const mockCreateIfNotExists = jest.fn()
const mockDeleteMessage = jest.fn()
const mockReceiveMessages = jest.fn()
const mockSendMessage = jest.fn()
const mockQueueClient = jest.fn(() => {
  return {
    createIfNotExists: mockCreateIfNotExists,
    deleteMessage: mockDeleteMessage,
    receiveMessages: mockReceiveMessages,
    sendMessage: mockSendMessage
  }
})

module.exports = {
  mocks: {
    mockCreateIfNotExists,
    mockDeleteMessage,
    mockQueueClient,
    mockReceiveMessages,
    mockSendMessage
  },
  QueueClient: mockQueueClient
}
