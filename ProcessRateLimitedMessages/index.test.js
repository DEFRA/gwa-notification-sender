const { mockContainerClient: sbMockContainerClient, mockListBlobsFlat: sbMockListBlobsFlat } = require('@azure/storage-blob').mocks
const { mockDeleteMessage: sqMockDeleteMessage, mockQueueClient: sqMockQueueClient, mockReceiveMessages: sqMockReceiveMessages, mockSendMessage: sqMockSendMessage } = require('@azure/storage-queue').mocks

const context = require('../test/defaultContext')
const testEnvVars = require('../test/testEnvVars')
const generateMessageItems = require('../test/generateMessageItems')

const processRateLimitedMessages = require('.')
const { bindings: functionBindings } = require('./function')

function mockBatchProcessingComplete (done) {
  sbMockListBlobsFlat.mockImplementation(() => { return { next: () => { return { done, value: undefined } } } })
}

// messageText must be a base64 encoded string that is an object containing
// a 'notification' property
function base64EncodeNotification (messageText) {
  return Buffer.from(JSON.stringify(JSON.parse(Buffer.from(messageText, 'base64').toString('utf8')).notification), 'utf8').toString('base64')
}

function expectSingleProcessedBatchIsCorrect (messageItem, numberOfMessageItems) {
  expect(sqMockReceiveMessages).toHaveBeenCalledTimes(2)
  expect(sqMockReceiveMessages).toHaveBeenCalledWith({ numberOfMessages: testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_PROCESSING_BATCH_SIZE })
  expect(sqMockDeleteMessage).toHaveBeenCalledTimes(numberOfMessageItems)
  expect(sqMockDeleteMessage).toHaveBeenCalledWith(messageItem.messageId, messageItem.popReceipt)
  expect(sqMockSendMessage).toHaveBeenCalledTimes(numberOfMessageItems)
}

describe('ProcessRateLimitedMessages function', () => {
  afterEach(() => { jest.clearAllMocks() })

  test('clients are created with correct env vars', async () => {
    mockBatchProcessingComplete(false)

    await processRateLimitedMessages(context)

    expect(sbMockContainerClient).toHaveBeenCalledTimes(1)
    expect(sbMockContainerClient).toHaveBeenCalledWith(testEnvVars.AzureWebJobsStorage, testEnvVars.CONTACT_LIST_BATCHES_CONTAINER)
    expect(sqMockQueueClient).toHaveBeenCalledTimes(2)
    expect(sqMockQueueClient).toHaveBeenNthCalledWith(1, testEnvVars.AzureWebJobsStorage, testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_RATE_LIMIT_QUEUE)
    expect(sqMockQueueClient).toHaveBeenNthCalledWith(2, testEnvVars.AzureWebJobsStorage, testEnvVars.NOTIFICATIONS_TO_SEND_QUEUE)
  })

  test('messages are not sent when batches still exist', async () => {
    mockBatchProcessingComplete(false)

    await processRateLimitedMessages(context)

    expect(context.log).toHaveBeenCalledTimes(1)
    expect(context.log).toHaveBeenCalledWith('Not OK to start processing messages.')
  })

  test('messages are processed (originals deleted and new ones sent) when no processing batches exist for a single message', async () => {
    mockBatchProcessingComplete(true)
    const numberOfMessageItems = 1
    const receivedMessageItems = generateMessageItems(numberOfMessageItems)
    sqMockReceiveMessages.mockImplementationOnce(() => { return { receivedMessageItems } })
    sqMockReceiveMessages.mockImplementationOnce(() => { return { receivedMessageItems: [] } })

    await processRateLimitedMessages(context)

    const messageItem = receivedMessageItems[0]
    expectSingleProcessedBatchIsCorrect(messageItem, numberOfMessageItems)

    const b64EncNotification = base64EncodeNotification(messageItem.messageText)
    const visibilityTimeout = testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_VISIBILITY_TIMEOUT_BASE + 1
    expect(sqMockSendMessage).toHaveBeenCalledWith(b64EncNotification, { visibilityTimeout })
  })

  test('messages are processed (originals deleted and new ones sent) when no processing batches exist for more than a batch of messages', async () => {
    mockBatchProcessingComplete(true)
    const messageReceiveBatchSize = testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_PROCESSING_BATCH_SIZE
    const numberOfBatches = 2
    const numberOfMessageItems = messageReceiveBatchSize + 1
    const receivedMessageItems = generateMessageItems(numberOfMessageItems)
    const receivedMessageItemsCopy = [...receivedMessageItems]
    sqMockReceiveMessages.mockImplementationOnce(() => { return { receivedMessageItems: receivedMessageItemsCopy.splice(0, messageReceiveBatchSize) } })
    sqMockReceiveMessages.mockImplementationOnce(() => { return { receivedMessageItems: receivedMessageItemsCopy } })
    sqMockReceiveMessages.mockImplementationOnce(() => { return { receivedMessageItems: [] } })

    await processRateLimitedMessages(context)

    const messageItem = receivedMessageItems[0]
    expect(sqMockReceiveMessages).toHaveBeenCalledTimes(numberOfBatches + 1)
    expect(sqMockReceiveMessages).toHaveBeenCalledWith({ numberOfMessages: messageReceiveBatchSize })
    expect(sqMockDeleteMessage).toHaveBeenCalledTimes(numberOfMessageItems)
    expect(sqMockDeleteMessage).toHaveBeenCalledWith(messageItem.messageId, messageItem.popReceipt)
    expect(sqMockSendMessage).toHaveBeenCalledTimes(numberOfMessageItems)
    for (let i = 0; i < numberOfMessageItems; i++) {
      const b64EncNotification = base64EncodeNotification(receivedMessageItems[i].messageText)
      const visibilityTimeout = testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_VISIBILITY_TIMEOUT_BASE + (i < messageReceiveBatchSize ? 1 : 2)
      expect(sqMockDeleteMessage).toHaveBeenNthCalledWith(i + 1, receivedMessageItems[i].messageId, receivedMessageItems[i].popReceipt)
      expect(sqMockSendMessage).toHaveBeenNthCalledWith(i + 1, b64EncNotification, { visibilityTimeout })
    }
  })

  test('messages exceeding daily limits have visibilityTimeout set to 01:00 next day', async () => {
    mockBatchProcessingComplete(true)
    const numberOfMessageItems = 1
    const dailyLimitExceededError = { error: 'TooManyRequestsError', message: 'not used' }
    const receivedMessageItems = generateMessageItems(numberOfMessageItems, dailyLimitExceededError)
    sqMockReceiveMessages.mockImplementationOnce(() => { return { receivedMessageItems } })
    sqMockReceiveMessages.mockImplementationOnce(() => { return { receivedMessageItems: [] } })
    const knownDateTime = new Date(2020, 1, 2, 11, 59, 30, 456)
    const tomorrowDateTime = new Date(2020, 1, 3, 1)
    const visibilityTimeoutForTomorrow = Math.ceil((tomorrowDateTime - knownDateTime) / 1000)
    Date.now = jest.fn(() => knownDateTime)

    await processRateLimitedMessages(context)

    const messageItem = receivedMessageItems[0]
    expectSingleProcessedBatchIsCorrect(messageItem, numberOfMessageItems)

    const b64EncNotification = base64EncodeNotification(messageItem.messageText)
    const visibilityTimeout = testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_VISIBILITY_TIMEOUT_BASE + 1 + visibilityTimeoutForTomorrow
    expect(sqMockSendMessage).toHaveBeenCalledWith(b64EncNotification, { visibilityTimeout })
  })

  test('an error is thrown (and logged) when an error occurs', async () => {
    // Doesn't matter what causes the error, just that an error is thrown
    sqMockQueueClient.mockRejectedValue('error')

    await expect(processRateLimitedMessages(context)).rejects.toThrow(Error)

    expect(context.log.error).toHaveBeenCalledTimes(1)
  })
})

describe('ProcessRateLimitedMessages bindings', () => {
  test('timer schedule is set to run every minute', () => {
    const bindings = functionBindings.filter((binding) => binding.direction === 'in')
    expect(bindings).toHaveLength(1)
    expect(bindings[0].schedule).toEqual('0 */1 * * * *')
  })
})
