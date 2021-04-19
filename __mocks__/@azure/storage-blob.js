function setMockDownloads (contents) {
  mockDownloads.push(contents)
}

const mockDownloads = []
const sbMockDelete = jest.fn()
const sbMockDownload = jest.fn()
  .mockImplementation(() => {
    return { readableStreamBody: mockDownloads.shift() }
  })
const sbMockBlobClient = jest.fn().mockImplementation(() => {
  return {
    delete: sbMockDelete,
    download: sbMockDownload
  }
})

const sbMockUpload = jest.fn()
const sbMockBlockBlobClient = jest.fn().mockImplementation(() => {
  return { upload: sbMockUpload }
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
  // TODO: rename to remove 'sb' for easier association
  sbMocks: {
    sbMockBlobClient,
    sbMockBlockBlobClient,
    sbMockContainerClient,
    sbMockCreateIfNotExists,
    sbMockDelete,
    sbMockDownload,
    sbMockUpload,
    mockDownloads
  },
  setMockDownloads
}
