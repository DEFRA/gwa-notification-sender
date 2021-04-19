const { mockBlobClient: sbMockBlobClient, mockBlockBlobClient: sbMockBlockBlobClient, mockContainerClient: sbMockContainerClient, mockCreateIfNotExists: sbMockCreateIfNotExists, mockDelete: sbMockDelete, mockListBlobsFlat: sbMockListBlobsFlat, mockUpload: sbMockUpload } = require('@azure/storage-blob').mocks
const { mockCreateIfNotExists: sqMockCreateIfNotExists, mockQueueClient: sqMockQueueClient, mockSendMessage: sqMockSendMessage } = require('@azure/storage-queue').mocks

const context = require('../test/defaultContext')
const testEnvVars = require('../test/testEnvVars')
const generateContacts = require('../test/generateContacts')

const processRateLimitedMessages = require('./index')

const message = 'message to send'
const blobContents = {
  contacts: [],
  message
}

describe('ProcessRateLimitedMessages function', () => {
  beforeAll(() => {
    context.bindingData = {
      blobTrigger: '',
      contactListBlobName: ''
    }
    context.bindings = {
      blobContents,
      myBlob: {
        length: JSON.stringify(blobContents).length
      }
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test.only('clients are created with correct env vars', async () => {
    await processRateLimitedMessages(context)

    expect(sbMockContainerClient).toHaveBeenCalledTimes(1)
    expect(sbMockContainerClient).toHaveBeenCalledWith(testEnvVars.AzureWebJobsStorage, testEnvVars.CONTACT_LIST_BATCHES_CONTAINER)
    expect(sqMockQueueClient).toHaveBeenCalledTimes(2)
    expect(sqMockQueueClient).toHaveBeenNthCalledWith(1, testEnvVars.AzureWebJobsStorage, testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_RATE_LIMIT_QUEUE)
    expect(sqMockQueueClient).toHaveBeenNthCalledWith(2, testEnvVars.AzureWebJobsStorage, testEnvVars.NOTIFICATIONS_TO_SEND_QUEUE)
  })

  test('messages are not sent when batches still exist', async () => {
    // TODO: return true for blob listing
    await processRateLimitedMessages(context)
  })

  test('messages are processed when no batches exist', async () => {
    // TODO: return false for blob listing
    await processRateLimitedMessages(context)
    // test receiveMessages is called
    // test visibilityTimeout is set correctly
  })

  test('messages are deleted when they have been sent', async () => {
    await processRateLimitedMessages(context)
  })

  test('an error is thrown (and logged) when an error occurs', async () => {
    // Doesn't matter what causes the error, just that an error is thrown
    context.bindings = null

    await expect(processRateLimitedMessages(context)).rejects.toThrow(Error)
    expect(context.log.error).toHaveBeenCalledTimes(1)
  })
})
