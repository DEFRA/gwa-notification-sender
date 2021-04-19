function setMockDownloads (contents) {
  mockDownloads.push(contents)
}

const mockDownloads = []
const mockDelete = jest.fn()
const mockDownload = jest.fn()
  .mockImplementation(() => {
    return { readableStreamBody: mockDownloads.shift() }
  })
const mockBlobClient = jest.fn().mockImplementation(() => {
  return {
    delete: mockDelete,
    download: mockDownload
  }
})

const mockUpload = jest.fn()
const mockBlockBlobClient = jest.fn().mockImplementation(() => {
  return { upload: mockUpload }
})

const mockCreateIfNotExists = jest.fn()
const mockContainerClient = jest.fn().mockImplementation(() => {
  return {
    createIfNotExists: mockCreateIfNotExists,
    getBlobClient: mockBlobClient,
    getBlockBlobClient: mockBlockBlobClient
  }
})

module.exports = {
  ContainerClient: mockContainerClient,
  // TODO: rename to remove 'sb' for easier association
  mocks: {
    mockBlobClient,
    mockBlockBlobClient,
    mockContainerClient,
    mockCreateIfNotExists,
    mockDelete,
    mockDownload,
    mockUpload
  },
  setMockDownloads
}
