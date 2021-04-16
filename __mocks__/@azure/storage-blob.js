const sbMockDelete = jest.fn()
const sbMockDownload = jest.fn()
const sbMockBlobClient = jest.fn().mockImplementation(() => {
  return {
    delete: sbMockDelete,
    download: sbMockDownload
  }
})

const sbMockUpload = jest.fn()
const sbMockBlockBlobClient = jest.fn().mockImplementation(() => {
  return {
    upload: sbMockUpload
  }
})

const sbMockCreateIfNotExists = jest.fn()
const sbMockContainerClient = jest.fn().mockImplementation(() => {
  return {
    createIfNotExists: sbMockCreateIfNotExists,
    getBlobClient: sbMockBlobClient,
    getBlockBlobClient: sbMockBlockBlobClient
  }
})

module.exports = {
  ContainerClient: sbMockContainerClient,
  sbMocks: {
    sbMockBlobClient,
    sbMockBlockBlobClient,
    sbMockContainerClient,
    sbMockCreateIfNotExists,
    sbMockDelete,
    sbMockDownload,
    sbMockUpload
  }
}
