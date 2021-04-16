const sqMockCreateIfNotExists = jest.fn()
const sqMockSendMessage = jest.fn()
const sqMockQueueClient = jest.fn().mockImplementation(() => {
  return {
    createIfNotExists: sqMockCreateIfNotExists,
    sendMessage: sqMockSendMessage
  }
})

module.exports = {
  sqMocks: {
    sqMockCreateIfNotExists,
    sqMockQueueClient,
    sqMockSendMessage
  },
  QueueClient: sqMockQueueClient
}
