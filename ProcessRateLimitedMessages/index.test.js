describe('ProcessRateLimitedMessages function', () => {
  const context = require('../test/defaultContext')
  const testEnvVars = require('../test/testEnvVars')
  const generateMessageItems = require('../test/generateMessageItems')

  let ContainerClient
  let QueueClient
  let processRateLimitedMessages

  function mockBatchProcessingComplete (done) {
    ContainerClient.prototype.listBlobsFlat.mockImplementation(() => { return { next: () => { return { done, value: undefined } } } })
  }

  // messageText must be a base64 encoded string that is an object containing
  // a 'notification' property
  function base64EncodeNotification (messageText) {
    return Buffer.from(JSON.stringify(JSON.parse(Buffer.from(messageText, 'base64').toString('utf8')).notification), 'utf8').toString('base64')
  }

  function expectSingleProcessedBatchIsCorrect (messageItem, numberOfMessageItems, visibilityTimeout) {
    const failedToSendQueueClientMockInstance = QueueClient.mock.instances[0]
    expect(failedToSendQueueClientMockInstance.receiveMessages).toHaveBeenCalledTimes(2)
    expect(failedToSendQueueClientMockInstance.receiveMessages).toHaveBeenCalledWith({ numberOfMessages: testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_PROCESSING_BATCH_SIZE })
    expect(failedToSendQueueClientMockInstance.deleteMessage).toHaveBeenCalledTimes(numberOfMessageItems)
    expect(failedToSendQueueClientMockInstance.deleteMessage).toHaveBeenCalledWith(messageItem.messageId, messageItem.popReceipt)

    const sendMessageMock = QueueClient.mock.instances[1].sendMessage
    expect(sendMessageMock).toHaveBeenCalledTimes(numberOfMessageItems)
    const b64EncNotification = base64EncodeNotification(messageItem.messageText)
    expect(sendMessageMock).toHaveBeenCalledWith(b64EncNotification, { visibilityTimeout })
  }

  beforeEach(() => {
    jest.mock('@azure/storage-blob')
    jest.mock('@azure/storage-queue')
    jest.clearAllMocks()
    jest.resetModules()

    ContainerClient = require('@azure/storage-blob').ContainerClient
    QueueClient = require('@azure/storage-queue').QueueClient
    processRateLimitedMessages = require('.')
  })

  test('clients are created with correct env vars', async () => {
    mockBatchProcessingComplete(false)

    await processRateLimitedMessages(context)

    expect(ContainerClient).toHaveBeenCalledTimes(1)
    expect(ContainerClient).toHaveBeenCalledWith(testEnvVars.AzureWebJobsStorage, testEnvVars.CONTACT_LIST_BATCHES_CONTAINER)
    expect(QueueClient).toHaveBeenCalledTimes(2)
    expect(QueueClient).toHaveBeenNthCalledWith(1, testEnvVars.AzureWebJobsStorage, testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_RATE_LIMIT_QUEUE)
    expect(QueueClient).toHaveBeenNthCalledWith(2, testEnvVars.AzureWebJobsStorage, testEnvVars.NOTIFICATIONS_TO_SEND_QUEUE)
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
    QueueClient.prototype.receiveMessages.mockResolvedValueOnce({ receivedMessageItems })
    QueueClient.prototype.receiveMessages.mockResolvedValueOnce({ receivedMessageItems: [] })

    await processRateLimitedMessages(context)

    const messageItem = receivedMessageItems[0]
    const visibilityTimeout = testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_VISIBILITY_TIMEOUT_BASE + 1
    expectSingleProcessedBatchIsCorrect(messageItem, numberOfMessageItems, visibilityTimeout)
  })

  test('messages are processed (originals deleted and new ones sent) when no processing batches exist for more than a batch of messages', async () => {
    mockBatchProcessingComplete(true)
    const messageReceiveBatchSize = testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_PROCESSING_BATCH_SIZE
    const numberOfBatches = 2
    const numberOfMessageItems = messageReceiveBatchSize + 1
    const receivedMessageItems = generateMessageItems(numberOfMessageItems)
    const receivedMessageItemsCopy = [...receivedMessageItems]
    QueueClient.prototype.receiveMessages.mockResolvedValueOnce({ receivedMessageItems: receivedMessageItemsCopy.splice(0, messageReceiveBatchSize) })
    QueueClient.prototype.receiveMessages.mockResolvedValueOnce({ receivedMessageItems: receivedMessageItemsCopy })
    QueueClient.prototype.receiveMessages.mockResolvedValueOnce({ receivedMessageItems: [] })

    await processRateLimitedMessages(context)

    const messageItem = receivedMessageItems[0]
    const failedToSendQueueClientMockInstance = QueueClient.mock.instances[0]
    expect(failedToSendQueueClientMockInstance.receiveMessages).toHaveBeenCalledTimes(numberOfBatches + 1)
    expect(failedToSendQueueClientMockInstance.receiveMessages).toHaveBeenCalledWith({ numberOfMessages: messageReceiveBatchSize })
    expect(failedToSendQueueClientMockInstance.deleteMessage).toHaveBeenCalledTimes(numberOfMessageItems)
    expect(failedToSendQueueClientMockInstance.deleteMessage).toHaveBeenCalledWith(messageItem.messageId, messageItem.popReceipt)
    const sendMessageMock = QueueClient.mock.instances[1].sendMessage
    expect(sendMessageMock).toHaveBeenCalledTimes(numberOfMessageItems)

    for (let i = 0; i < numberOfMessageItems; i++) {
      const b64EncNotification = base64EncodeNotification(receivedMessageItems[i].messageText)
      const visibilityTimeout = testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_VISIBILITY_TIMEOUT_BASE + (i < messageReceiveBatchSize ? 1 : 2)
      expect(failedToSendQueueClientMockInstance.deleteMessage).toHaveBeenNthCalledWith(i + 1, receivedMessageItems[i].messageId, receivedMessageItems[i].popReceipt)
      expect(sendMessageMock).toHaveBeenNthCalledWith(i + 1, b64EncNotification, { visibilityTimeout })
    }
  })

  test('messages exceeding daily limits have visibilityTimeout set to 01:00 next day', async () => {
    mockBatchProcessingComplete(true)
    const numberOfMessageItems = 1
    const dailyLimitExceededError = { error: 'TooManyRequestsError', message: 'not used' }
    const receivedMessageItems = generateMessageItems(numberOfMessageItems, dailyLimitExceededError)
    QueueClient.prototype.receiveMessages.mockResolvedValueOnce({ receivedMessageItems })
    QueueClient.prototype.receiveMessages.mockResolvedValueOnce({ receivedMessageItems: [] })
    const knownDateTime = new Date(2020, 1, 2, 11, 59, 30, 456)
    const tomorrowDateTime = new Date(2020, 1, 3, 1)
    const visibilityTimeoutForTomorrow = Math.ceil((tomorrowDateTime - knownDateTime) / 1000)
    Date.now = jest.fn(() => knownDateTime)

    await processRateLimitedMessages(context)

    const messageItem = receivedMessageItems[0]
    const visibilityTimeout = testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_VISIBILITY_TIMEOUT_BASE + 1 + visibilityTimeoutForTomorrow
    expectSingleProcessedBatchIsCorrect(messageItem, numberOfMessageItems, visibilityTimeout)
  })

  test('an error is thrown (and logged) when an error occurs', async () => {
    // Doesn't matter what causes the error, just that an error is thrown
    QueueClient.mockRejectedValue('error')

    await expect(processRateLimitedMessages(context)).rejects.toThrow(Error)

    expect(context.log.error).toHaveBeenCalledTimes(1)
  })
})

describe('ProcessRateLimitedMessages bindings', () => {
  const { bindings: functionBindings } = require('./function')

  test('timer schedule is set to run every minute', () => {
    const bindings = functionBindings.filter((binding) => binding.direction === 'in')
    expect(bindings).toHaveLength(1)
    expect(bindings[0].schedule).toEqual('0 */1 * * * *')
  })
})
