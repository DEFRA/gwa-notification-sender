const testEnvVars = require('../test/testEnvVars')

const inputBindingName = 'contactListBatchFileName'
const outputBindingName = 'messagesToSend'

describe('ProcessContactListBatches function', () => {
  const { Readable } = require('stream').Stream

  const context = require('../test/defaultContext')
  const generateContacts = require('../test/generateContacts')

  function testSentMessages (fileContents, sentMessages) {
    const { contacts, message } = fileContents
    sentMessages.forEach((sentMessage, idx) => {
      expect(sentMessage.message).toEqual(message)
      expect(sentMessage.phoneNumber).toEqual(contacts[idx].phoneNumber)
    })
  }

  function setMockDownload (contents, encoding) {
    const mockReadable = new Readable({ read () {} })
    if (encoding) {
      mockReadable.setEncoding(encoding) // default is null
    }
    mockReadable.push(JSON.stringify(contents))
    mockReadable.push(null)

    const deleteBlobMock = jest.fn().mockResolvedValue()
    ContainerClient.prototype.getBlobClient.mockImplementation(() => {
      return {
        download: jest.fn().mockResolvedValue({ readableStreamBody: mockReadable }),
        delete: deleteBlobMock
      }
    })
    return {
      deleteBlobMock
    }
  }

  const inputFileName = 'incoming-file.json'

  let ContainerClient
  let processContactListBatches

  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()

    ContainerClient = require('@azure/storage-blob').ContainerClient
    jest.mock('@azure/storage-blob')

    processContactListBatches = require('.')

    context.bindings[inputBindingName] = inputFileName
  })

  test('file specified in message is downloaded and deleted', async () => {
    const contents = { contacts: [], message: 'messages' }
    const { deleteBlobMock } = setMockDownload(contents)

    await processContactListBatches(context)

    expect(ContainerClient).toHaveBeenCalledTimes(1)
    expect(ContainerClient).toHaveBeenCalledWith(testEnvVars.AzureWebJobsStorage, testEnvVars.CONTACT_LIST_BATCHES_CONTAINER)
    const getBlobClientMock = ContainerClient.mock.instances[0].getBlobClient
    expect(getBlobClientMock).toHaveBeenCalledTimes(1)
    expect(getBlobClientMock).toHaveBeenCalledWith(inputFileName)
    expect(deleteBlobMock).toHaveBeenCalledTimes(1)
  })

  test('a message is sent for a single contact in the batch', async () => {
    const phoneNumber = '07000111222'
    const message = 'message to send to a batch of contacts'
    setMockDownload({ contacts: [{ phoneNumber }], message })

    await processContactListBatches(context)

    expect(context.bindings).toHaveProperty(outputBindingName)
    expect(context.bindings[outputBindingName]).toHaveLength(1)
    const messageSent = context.bindings[outputBindingName][0]
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

    expect(context.bindings).toHaveProperty(outputBindingName)
    const sentMessages = context.bindings[outputBindingName]
    expect(sentMessages).toHaveLength(numberOfContacts)

    testSentMessages(rawFileContents, sentMessages)
  })

  test('file downloads when contents are utf8 encoded', async () => {
    const { deleteBlobMock } = setMockDownload({ contacts: [], message: 'messages' }, 'utf8')

    await processContactListBatches(context)

    const getBlobClientMock = ContainerClient.mock.instances[0].getBlobClient
    expect(getBlobClientMock).toHaveBeenCalledTimes(1)
    expect(getBlobClientMock).toHaveBeenCalledWith(inputFileName)
    expect(deleteBlobMock).toHaveBeenCalledTimes(1)
  })

  test('an error is thrown (and logged) when an error occurs', async () => {
    // Doesn't matter what causes the error, just that an error is thrown
    context.bindings = null

    await expect(processContactListBatches(context)).rejects.toThrow(Error)
    expect(context.log.error).toHaveBeenCalledTimes(1)
  })
})

describe('ProcessContactListBatches bindings', () => {
  const { bindings: functionBindings } = require('./function')

  test('queueTrigger input binding is correct', () => {
    const bindings = functionBindings.filter(binding => binding.direction === 'in')
    expect(bindings).toHaveLength(1)

    const binding = bindings[0]
    expect(binding.name).toEqual(inputBindingName)
    expect(binding.type).toEqual('queueTrigger')
    expect(binding.queueName).toEqual(`%${testEnvVars.CONTACT_LIST_BATCHES_QUEUE}%`)
  })

  test('queue output binding is correct', () => {
    const bindings = functionBindings.filter(binding => binding.direction === 'out')
    expect(bindings).toHaveLength(1)

    const binding = bindings[0]
    expect(binding.name).toEqual(outputBindingName)
    expect(binding.type).toEqual('queue')
    expect(binding.queueName).toEqual(`%${testEnvVars.NOTIFICATIONS_TO_SEND_QUEUE}%`)
  })
})
