const { Readable } = require('stream').Stream

const { mockBlobClient, mockContainerClient, mockDelete, mockDownload } = require('@azure/storage-blob').mocks

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

function setMockDownload (contents) {
  const mockReadable = new Readable({ read () {} })
  mockReadable.push(JSON.stringify(contents))
  mockReadable.push(null)
  mockDownload.mockImplementation(() => { return { readableStreamBody: mockReadable } })
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

  test('file specified in message is downloaded', async () => {
    setMockDownload({ contacts: [], message: 'messages' })

    await processContactListBatches(context)

    expect(mockContainerClient).toHaveBeenCalledTimes(1)
    expect(mockContainerClient).toHaveBeenCalledWith(testEnvVars.AzureWebJobsStorage, testEnvVars.CONTACT_LIST_BATCHES_CONTAINER)
    expect(mockDownload).toHaveBeenCalledTimes(1)
  })

  test('a message is sent for a single contact in the batch', async () => {
    const phoneNumber = '07000111222'
    const message = 'message to send to a batch of contacts'
    setMockDownload({ contacts: [{ phoneNumber }], message })

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
    const rawFileContents = { contacts, message }
    setMockDownload(rawFileContents)

    await processContactListBatches(context)

    expect(context.bindings).toHaveProperty('messagesToSend')
    const sentMessages = context.bindings.messagesToSend
    expect(sentMessages).toHaveLength(numberOfContacts)

    testSentMessages(rawFileContents, sentMessages)
  })

  test('batch contact list blob is deleted', async () => {
    setMockDownload({ contacts: [], message: 'messages' })

    await processContactListBatches(context)

    expect(mockBlobClient).toHaveBeenCalledTimes(1)
    expect(mockBlobClient).toHaveBeenCalledWith(contactListBatchFileName)
    expect(mockDelete).toHaveBeenCalledTimes(1)
  })

  test('an error is thrown (and logged) when an error occurs', async () => {
    // Doesn't matter what causes the error, just that an error is thrown
    context.bindings = null

    await expect(processContactListBatches(context)).rejects.toThrow(Error)
    expect(context.log.error).toHaveBeenCalledTimes(1)
  })
})
