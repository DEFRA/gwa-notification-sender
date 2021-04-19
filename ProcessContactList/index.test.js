const { mockBlobClient: sbMockBlobClient, mockBlockBlobClient: sbMockBlockBlobClient, mockContainerClient: sbMockContainerClient, mockCreateIfNotExists: sbMockCreateIfNotExists, mockDelete: sbMockDelete, mockUpload: sbMockUpload } = require('@azure/storage-blob').mocks
const { mockCreateIfNotExists: sqMockCreateIfNotExists, mockQueueClient: sqMockQueueClient, mockSendMessage: sqMockSendMessage } = require('@azure/storage-queue').mocks

const context = require('../test/defaultContext')
const testEnvVars = require('../test/testEnvVars')
const generateContacts = require('../test/generateContacts')

const processContactList = require('./index')

const message = 'message to send'
const blobContents = {
  contacts: [],
  message
}

describe('ProcessContactList function', () => {
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

  test('clients are created with correct env vars', async () => {
    await processContactList(context)

    expect(sqMockQueueClient).toHaveBeenCalledTimes(1)
    expect(sqMockQueueClient).toHaveBeenCalledWith(testEnvVars.AzureWebJobsStorage, testEnvVars.CONTACT_LIST_BATCHES_QUEUE)
    expect(sbMockContainerClient).toHaveBeenCalledTimes(2)
    expect(sbMockContainerClient).toHaveBeenNthCalledWith(1, testEnvVars.AzureWebJobsStorage, testEnvVars.CONTACT_LIST_BATCHES_CONTAINER)
    expect(sbMockContainerClient).toHaveBeenNthCalledWith(2, testEnvVars.AzureWebJobsStorage, testEnvVars.CONTACT_LIST_CONTAINER)
  })

  test('resources will be created if they do not exist', async () => {
    await processContactList(context)

    expect(sqMockCreateIfNotExists).toHaveBeenCalledTimes(1)
    expect(sbMockCreateIfNotExists).toHaveBeenCalledTimes(1)
  })

  test('a file with no contacts does not upload or send messages', async () => {
    await processContactList(context)

    expect(sbMockBlockBlobClient).not.toHaveBeenCalled()
    expect(sqMockQueueClient).not.toHaveBeenCalled()
  })

  test('contact list blob is deleted', async () => {
    const contactListBlobName = 'contactListBlobName'
    context.bindingData.contactListBlobName = contactListBlobName

    await processContactList(context)

    expect(sbMockBlobClient).toHaveBeenCalledTimes(1)
    expect(sbMockBlobClient).toHaveBeenCalledWith(contactListBlobName)
    expect(sbMockDelete).toHaveBeenCalledTimes(1)
  })

  test('a single batch is created for 2500 contacts', async () => {
    const contacts = generateContacts(2500)
    context.bindings.blobContents = { contacts, message }

    const now = Date.now()
    Date.now = jest.fn(() => now)
    const expectedBlobName = `${now}-batch-0`
    const expectedMessageContent = Buffer.from(expectedBlobName, 'utf8').toString('base64')
    const expectedUploadBlobContent = JSON.stringify({ contacts, message })

    await processContactList(context)

    expect(sbMockBlockBlobClient).toHaveBeenCalledTimes(1)
    expect(sbMockBlockBlobClient).toHaveBeenCalledWith(expectedBlobName)
    expect(sbMockUpload).toHaveBeenCalledTimes(1)
    expect(sbMockUpload).toHaveBeenCalledWith(expectedUploadBlobContent, expectedUploadBlobContent.length, { blobHTTPHeaders: { blobContentType: 'application/json' } })
    expect(sqMockSendMessage).toHaveBeenCalledTimes(1)
    expect(sqMockSendMessage).toHaveBeenCalledWith(expectedMessageContent, { visibilityTimeout: testEnvVars.INITIAL_MESSAGE_VISIBILITY })
  })

  test('two batches are created for 2501 contacts', async () => {
    const contacts = generateContacts(2501)
    const uploadContacts = [...contacts]
    context.bindings.blobContents = { contacts, message }

    const now = Date.now()
    Date.now = jest.fn(() => now)
    const expectedBlobName1 = `${now}-batch-0`
    const expectedBlobName2 = `${now}-batch-1`
    const expectedMessageContent1 = Buffer.from(expectedBlobName1, 'utf8').toString('base64')
    const expectedMessageContent2 = Buffer.from(expectedBlobName2, 'utf8').toString('base64')
    const expectedUploadBlobContent1 = JSON.stringify({ contacts: uploadContacts.splice(0, 2500), message })
    const expectedUploadBlobContent2 = JSON.stringify({ contacts: uploadContacts.splice(0, 2500), message })

    await processContactList(context)

    expect(sbMockBlockBlobClient).toHaveBeenCalledTimes(2)
    expect(sbMockBlockBlobClient).toHaveBeenCalledWith(expectedBlobName1)
    expect(sbMockUpload).toHaveBeenCalledTimes(2)
    expect(sbMockUpload).toHaveBeenNthCalledWith(1, expectedUploadBlobContent1, expectedUploadBlobContent1.length, { blobHTTPHeaders: { blobContentType: 'application/json' } })
    expect(sbMockUpload).toHaveBeenNthCalledWith(2, expectedUploadBlobContent2, expectedUploadBlobContent2.length, { blobHTTPHeaders: { blobContentType: 'application/json' } })
    expect(sqMockSendMessage).toHaveBeenCalledTimes(2)
    expect(sqMockSendMessage).toHaveBeenNthCalledWith(1, expectedMessageContent1, { visibilityTimeout: testEnvVars.INITIAL_MESSAGE_VISIBILITY })
    expect(sqMockSendMessage).toHaveBeenNthCalledWith(2, expectedMessageContent2, { visibilityTimeout: 90 + testEnvVars.INITIAL_MESSAGE_VISIBILITY })
  })

  test('an error is thrown (and logged) when an error occurs', async () => {
    // Doesn't matter what causes the error, just that an error is thrown
    context.bindings = null

    await expect(processContactList(context)).rejects.toThrow(Error)
    expect(context.log.error).toHaveBeenCalledTimes(1)
  })
})
