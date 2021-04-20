const { mockContainerClient: sbMockContainerClient, mockListBlobsFlat: sbMockListBlobsFlat } = require('@azure/storage-blob').mocks
const { mockDeleteMessage: sqMockDeleteMessage, mockQueueClient: sqMockQueueClient, mockReceiveMessages: sqMockReceiveMessages, mockSendMessage: sqMockSendMessage } = require('@azure/storage-queue').mocks

const context = require('../test/defaultContext')
const testEnvVars = require('../test/testEnvVars')
const generateMessageItems = require('../test/generateMessageItems')

const processRateLimitedMessages = require('./index')

describe('ProcessRateLimitedMessages function', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('clients are created with correct env vars', async () => {
    // TODO: look to refactor this out
    sbMockListBlobsFlat.mockImplementation(() => { return { next: () => { return { done: false, value: undefined } } } })

    await processRateLimitedMessages(context)

    expect(sbMockContainerClient).toHaveBeenCalledTimes(1)
    expect(sbMockContainerClient).toHaveBeenCalledWith(testEnvVars.AzureWebJobsStorage, testEnvVars.CONTACT_LIST_BATCHES_CONTAINER)
    expect(sqMockQueueClient).toHaveBeenCalledTimes(2)
    expect(sqMockQueueClient).toHaveBeenNthCalledWith(1, testEnvVars.AzureWebJobsStorage, testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_RATE_LIMIT_QUEUE)
    expect(sqMockQueueClient).toHaveBeenNthCalledWith(2, testEnvVars.AzureWebJobsStorage, testEnvVars.NOTIFICATIONS_TO_SEND_QUEUE)
  })

  test('messages are not sent when batches still exist', async () => {
    sbMockListBlobsFlat.mockImplementation(() => { return { next: () => { return { done: false, value: undefined } } } })

    await processRateLimitedMessages(context)

    expect(context.log).toHaveBeenCalledTimes(1)
    expect(context.log).toHaveBeenCalledWith('Not OK to start processing messages.')
  })

  test('messages are processed (originals deleted and new ones sent) when no processing batches exist for a single message', async () => {
    sbMockListBlobsFlat.mockImplementation(() => { return { next: () => { return { done: true, value: undefined } } } })
    const numberOfMessageItems = 1
    const receivedMessageItems = generateMessageItems(numberOfMessageItems)
    sqMockReceiveMessages.mockImplementationOnce(() => { return { receivedMessageItems } })
    sqMockReceiveMessages.mockImplementationOnce(() => { return { receivedMessageItems: [] } })

    await processRateLimitedMessages(context)

    const messageItem = receivedMessageItems[0]
    expect(sqMockReceiveMessages).toHaveBeenCalledTimes(2)
    expect(sqMockReceiveMessages).toHaveBeenCalledWith({ numberOfMessages: testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_PROCESSING_BATCH_SIZE })
    expect(sqMockDeleteMessage).toHaveBeenCalledTimes(numberOfMessageItems)
    expect(sqMockDeleteMessage).toHaveBeenCalledWith(messageItem.messageId, messageItem.popReceipt)
    expect(sqMockSendMessage).toHaveBeenCalledTimes(numberOfMessageItems)
    const base64EncodedNotification = Buffer.from(JSON.stringify(JSON.parse(Buffer.from(messageItem.messageText, 'base64').toString('utf8')).notification), 'utf8').toString('base64')
    const visibilityTimeout = testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_VISIBILITY_TIMEOUT_BASE + 1
    expect(sqMockSendMessage).toHaveBeenCalledWith(base64EncodedNotification, { visibilityTimeout })
  })

  test('messages are processed (originals deleted and new ones sent) when no processing batches exist for more than a batch of messages', async () => {
    sbMockListBlobsFlat.mockImplementation(() => {
      return { next: () => { return { done: true, value: undefined } } }
    })
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
      const base64EncodedNotification = Buffer.from(JSON.stringify(JSON.parse(Buffer.from(receivedMessageItems[i].messageText, 'base64').toString('utf8')).notification), 'utf8').toString('base64')
      const visibilityTimeout = testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_VISIBILITY_TIMEOUT_BASE + (i < messageReceiveBatchSize ? 1 : 2)
      expect(sqMockDeleteMessage).toHaveBeenNthCalledWith(i + 1, receivedMessageItems[i].messageId, receivedMessageItems[i].popReceipt)
      expect(sqMockSendMessage).toHaveBeenNthCalledWith(i + 1, base64EncodedNotification, { visibilityTimeout })
    }
  })

  test('an error is thrown (and logged) when an error occurs', async () => {
    // Doesn't matter what causes the error, just that an error is thrown
    sqMockQueueClient.mockRejectedValue('error')

    await expect(processRateLimitedMessages(context)).rejects.toThrow(Error)

    expect(context.log.error).toHaveBeenCalledTimes(1)
  })
})
