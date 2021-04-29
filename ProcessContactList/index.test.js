const testEnvVars = require('../test/testEnvVars')

const inputBlobBindingName = 'blobContents'

describe('ProcessContactList function', () => {
  const context = require('../test/defaultContext')
  const generateContacts = require('../test/generateContacts')

  const message = 'message to send'
  const blobContents = Buffer.from(JSON.stringify({ contacts: [], message }))

  let processContactList
  let ContainerClient
  let QueueClient
  let deleteMock
  let uploadMock

  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()

    ContainerClient = require('@azure/storage-blob').ContainerClient
    QueueClient = require('@azure/storage-queue').QueueClient
    jest.mock('@azure/storage-blob')
    jest.mock('@azure/storage-queue')

    deleteMock = jest.fn()
    uploadMock = jest.fn()
    ContainerClient.prototype.getBlobClient.mockImplementation(() => {
      return { delete: deleteMock }
    })
    ContainerClient.prototype.getBlockBlobClient.mockImplementation(() => {
      return { upload: uploadMock }
    })

    processContactList = require('.')

    context.bindingData = { blobTrigger: '', contactListBlobName: '' }
    context.bindings = { blobContents }
  })

  test('clients are created with correct env vars', async () => {
    await processContactList(context)

    expect(QueueClient).toHaveBeenCalledTimes(1)
    expect(QueueClient).toHaveBeenCalledWith(testEnvVars.AzureWebJobsStorage, testEnvVars.CONTACT_LIST_BATCHES_QUEUE)
    expect(ContainerClient).toHaveBeenCalledTimes(2)
    expect(ContainerClient).toHaveBeenNthCalledWith(1, testEnvVars.AzureWebJobsStorage, testEnvVars.CONTACT_LIST_BATCHES_CONTAINER)
    expect(ContainerClient).toHaveBeenNthCalledWith(2, testEnvVars.AzureWebJobsStorage, testEnvVars.CONTACT_LIST_CONTAINER)
  })

  test('resources will be created if they do not exist', async () => {
    await processContactList(context)

    expect(ContainerClient.mock.instances[0].createIfNotExists).toHaveBeenCalledTimes(1)
    expect(QueueClient.mock.instances[0].createIfNotExists).toHaveBeenCalledTimes(1)
  })

  test('a file with no contacts does not upload or send messages', async () => {
    await processContactList(context)

    expect(uploadMock).not.toHaveBeenCalled()
    expect(QueueClient.mock.instances[0].sendMessage).not.toHaveBeenCalled()
  })

  test('contact list blob is deleted', async () => {
    const contactListBlobName = 'contactListBlobName'
    context.bindingData.contactListBlobName = contactListBlobName

    await processContactList(context)

    const getBlobClientMock = ContainerClient.mock.instances[1].getBlobClient
    expect(getBlobClientMock).toHaveBeenCalledTimes(1)
    expect(getBlobClientMock).toHaveBeenCalledWith(contactListBlobName)
    expect(deleteMock).toHaveBeenCalledTimes(1)
  })

  test('a single batch is created for 2500 contacts', async () => {
    const contacts = generateContacts(2500)
    context.bindings[inputBlobBindingName] = Buffer.from(JSON.stringify({ contacts, message }))

    const now = Date.now()
    Date.now = jest.fn(() => now)
    const expectedBlobName = `${now}-batch-0`
    const expectedMessageContent = Buffer.from(expectedBlobName, 'utf8').toString('base64')
    const expectedUploadBlobContent = JSON.stringify({ contacts, message })

    await processContactList(context)

    const getBlockBlobClientMock = ContainerClient.mock.instances[0].getBlockBlobClient
    expect(getBlockBlobClientMock).toHaveBeenCalledTimes(1)
    expect(getBlockBlobClientMock).toHaveBeenCalledWith(expectedBlobName)

    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(uploadMock).toHaveBeenCalledWith(expectedUploadBlobContent, expectedUploadBlobContent.length, { blobHTTPHeaders: { blobContentType: 'application/json' } })

    const sendMessageMock = QueueClient.mock.instances[0].sendMessage
    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    expect(sendMessageMock).toHaveBeenCalledWith(expectedMessageContent, { visibilityTimeout: testEnvVars.INITIAL_MESSAGE_VISIBILITY })
  })

  test('two batches are created for 2501 contacts', async () => {
    const contacts = generateContacts(2501)
    const uploadContacts = [...contacts]
    context.bindings[inputBlobBindingName] = Buffer.from(JSON.stringify({ contacts, message }))

    const now = Date.now()
    Date.now = jest.fn(() => now)
    const expectedBlobName1 = `${now}-batch-0`
    const expectedBlobName2 = `${now}-batch-1`
    const expectedMessageContent1 = Buffer.from(expectedBlobName1, 'utf8').toString('base64')
    const expectedMessageContent2 = Buffer.from(expectedBlobName2, 'utf8').toString('base64')
    const expectedUploadBlobContent1 = JSON.stringify({ contacts: uploadContacts.splice(0, 2500), message })
    const expectedUploadBlobContent2 = JSON.stringify({ contacts: uploadContacts.splice(0, 2500), message })

    await processContactList(context)

    const getBlockBlobClientMock = ContainerClient.mock.instances[0].getBlockBlobClient
    expect(getBlockBlobClientMock).toHaveBeenCalledTimes(2)
    expect(getBlockBlobClientMock).toHaveBeenCalledWith(expectedBlobName1)

    expect(uploadMock).toHaveBeenCalledTimes(2)
    expect(uploadMock).toHaveBeenNthCalledWith(1, expectedUploadBlobContent1, expectedUploadBlobContent1.length, { blobHTTPHeaders: { blobContentType: 'application/json' } })
    expect(uploadMock).toHaveBeenNthCalledWith(2, expectedUploadBlobContent2, expectedUploadBlobContent2.length, { blobHTTPHeaders: { blobContentType: 'application/json' } })

    const sendMessageMock = QueueClient.mock.instances[0].sendMessage
    expect(sendMessageMock).toHaveBeenCalledTimes(2)
    expect(sendMessageMock).toHaveBeenNthCalledWith(1, expectedMessageContent1, { visibilityTimeout: testEnvVars.INITIAL_MESSAGE_VISIBILITY })
    expect(sendMessageMock).toHaveBeenNthCalledWith(2, expectedMessageContent2, { visibilityTimeout: 90 + testEnvVars.INITIAL_MESSAGE_VISIBILITY })
  })

  test('an error is thrown (and logged) when an error occurs', async () => {
    // Doesn't matter what causes the error, just that an error is thrown
    context.bindings = null

    await expect(processContactList(context)).rejects.toThrow(Error)
    expect(context.log.error).toHaveBeenCalledTimes(1)
  })
})

describe('ProcessContactList bindings', () => {
  const { bindings: functionBindings } = require('./function')

  test('blobTrigger input binding is correct', () => {
    const bindings = functionBindings.filter(b => b.direction === 'in')
    expect(bindings).toHaveLength(1)

    const binding = bindings[0]
    expect(binding.name).toEqual(inputBlobBindingName)
    expect(binding.type).toEqual('blobTrigger')
    expect(binding.path).toEqual(`%${testEnvVars.CONTACT_LIST_CONTAINER}%/{contactListBlobName}`)
  })
})
