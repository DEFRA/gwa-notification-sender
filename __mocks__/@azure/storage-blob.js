const mockDelete = jest.fn()
const mockDownload = jest.fn()
const mockBlobClient = jest.fn(() => {
  return {
    delete: mockDelete,
    download: mockDownload
  }
})

const mockUpload = jest.fn()
const mockBlockBlobClient = jest.fn(() => {
  return { upload: mockUpload }
})

const mockCreateIfNotExists = jest.fn()
const mockContainerClient = jest.fn(() => {
  return {
    createIfNotExists: mockCreateIfNotExists,
    getBlobClient: mockBlobClient,
    getBlockBlobClient: mockBlockBlobClient
  }
})

module.exports = {
  ContainerClient: mockContainerClient,
  mocks: {
    mockBlobClient,
    mockBlockBlobClient,
    mockContainerClient,
    mockCreateIfNotExists,
    mockDelete,
    mockDownload,
    mockUpload
  }
}
