const sqMockCreateIfNotExists = jest.fn()
const sqMockSendMessage = jest.fn()
const sqMockQueueClient = jest.fn().mockImplementation(() => {
  return {
    createIfNotExists: sqMockCreateIfNotExists,
    sendMessage: sqMockSendMessage
  }
})

module.exports = {
  // TODO: rename to remove 'sq' for easier association
  sqMocks: {
    sqMockCreateIfNotExists,
    sqMockQueueClient,
    sqMockSendMessage
  },
  QueueClient: sqMockQueueClient
}
