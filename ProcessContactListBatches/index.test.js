const { sbMockBlobClient, sbMockContainerClient, sbMockDelete, sbMockDownload } = require('@azure/storage-blob').sbMocks
const context = require('../test/defaultContext')
const testEnvVars = require('../test/testEnvVars')

const processContactListBatches = require('./index')

jest.mock('@azure/storage-blob')

const contactListBatchFileName = 'contactListBatchFileName'

describe('ProcessContactListBatches function', () => {
  beforeAll(() => {
    context.bindings = {
      contactListBatchFileName
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('file from message is downloaded', async () => {
    await processContactListBatches(context)

    expect(sbMockContainerClient).toHaveBeenCalledTimes(1)
    expect(sbMockContainerClient).toHaveBeenCalledWith(testEnvVars.AzureWebJobsStorage, testEnvVars.CONTACT_LIST_BATCHES_CONTAINER)
    // TODO: return an empty file from this
    expect(sbMockDownload).toHaveBeenCalledTimes(1)
  })

  // test('a message is sent for every contact in the batch', async () => {
  //   await processContactListBatches(context)
  //   expect(context.bindings).toHaveProperty('messagesToSend')
  //   // TODO: Need to mock the ressponse of the file download for this to work
  //   expect(context.bindings.messagesToSend).toHaveLength(99)
  // })

  // test('batch contact list blob is deleted', async () => {
  //   await processContactListBatches(context)

  //   expect(sbMockBlobClient).toHaveBeenCalledTimes(1)
  //   expect(sbMockBlobClient).toHaveBeenCalledWith(contactListBatchFileName)
  //   expect(sbMockDelete).toHaveBeenCalledTimes(1)
  // })

  test('an error is thrown (and logged) when an error occurs', async () => {
    // Doesn't matter what errors, just that an error is thrown
    context.bindings = null

    await expect(processContactListBatches(context)).rejects.toThrow(Error)
    expect(context.log.error).toHaveBeenCalledTimes(1)
  })
})
