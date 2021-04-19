const { Readable } = require('stream').Stream

const { setMockDownloads } = require('@azure/storage-blob')
const { mockBlobClient: sbMockBlobClient, mockContainerClient: sbMockContainerClient, mockDelete: sbMockDelete, mockDownload: sbMockDownload } = require('@azure/storage-blob').mocks

jest.mock('@azure/storage-blob')

const context = require('../test/defaultContext')
const testEnvVars = require('../test/testEnvVars')
const generateContacts = require('../test/generateContacts')

const processContactListBatches = require('./index')

const contactListBatchFileName = 'contactListBatchFileName'

function testSentMessages (fileContents, sentMessages) {
  const { contacts, message } = fileContents
  sentMessages.forEach((sentMessage, idx) => {
    expect(sentMessage.message).toEqual(message)
    expect(sentMessage.phoneNumber).toEqual(contacts[idx].phoneNumber)
  })
}

describe('ProcessContactListBatches function', () => {
  beforeAll(() => {
    context.bindings = {
      contactListBatchFileName
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  function mockZeroContactDownload () {
    const mockZeroContactDownload = new Readable({ read () {} })
    mockZeroContactDownload.push(JSON.stringify({ contacts: [], message: 'messages' }))
    mockZeroContactDownload.push(null)
    setMockDownloads(mockZeroContactDownload)
  }

  test('file specified in message is downloaded', async () => {
    mockZeroContactDownload()

    await processContactListBatches(context)

    expect(sbMockContainerClient).toHaveBeenCalledTimes(1)
    expect(sbMockContainerClient).toHaveBeenCalledWith(testEnvVars.AzureWebJobsStorage, testEnvVars.CONTACT_LIST_BATCHES_CONTAINER)
    expect(sbMockDownload).toHaveBeenCalledTimes(1)
  })

  test('a message is sent for a single contact in the batch', async () => {
    const phoneNumber = '07000111222'
    const message = 'message to send to a batch of contacts'
    const mockSingleContactDownload = new Readable({ read () {} })
    mockSingleContactDownload.push(JSON.stringify({ contacts: [{ phoneNumber }], message }))
    mockSingleContactDownload.push(null)
    setMockDownloads(mockSingleContactDownload)

    await processContactListBatches(context)

    expect(context.bindings).toHaveProperty('messagesToSend')
    expect(context.bindings.messagesToSend).toHaveLength(1)
    const messageSent = context.bindings.messagesToSend[0]
    expect(messageSent.message).toEqual(message)
    expect(messageSent.phoneNumber).toEqual(phoneNumber)
  })

  test('a message is sent for several contacts in the batch', async () => {
    const numberOfContacts = 10
    const contacts = generateContacts(numberOfContacts)
    const message = 'message to send to a batch of contacts'
    const mockSingleContactDownload = new Readable({ read () {} })
    const rawFileContents = { contacts, message }
    mockSingleContactDownload.push(JSON.stringify(rawFileContents))
    mockSingleContactDownload.push(null)
    setMockDownloads(mockSingleContactDownload)

    await processContactListBatches(context)

    expect(context.bindings).toHaveProperty('messagesToSend')
    const sentMessages = context.bindings.messagesToSend
    expect(sentMessages).toHaveLength(numberOfContacts)

    testSentMessages(rawFileContents, sentMessages)
  })

  test('batch contact list blob is deleted', async () => {
    mockZeroContactDownload()

    await processContactListBatches(context)

    expect(sbMockBlobClient).toHaveBeenCalledTimes(1)
    expect(sbMockBlobClient).toHaveBeenCalledWith(contactListBatchFileName)
    expect(sbMockDelete).toHaveBeenCalledTimes(1)
  })

  test('an error is thrown (and logged) when an error occurs', async () => {
    // Doesn't matter what causes the error, just that an error is thrown
    context.bindings = null

    await expect(processContactListBatches(context)).rejects.toThrow(Error)
    expect(context.log.error).toHaveBeenCalledTimes(1)
  })
})
