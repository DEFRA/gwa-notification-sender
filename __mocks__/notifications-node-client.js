const mockSendSms = jest.fn()
const mockNotifyClient = jest.fn(() => {
  return { sendSms: mockSendSms }
})

module.exports = {
  mocks: {
    mockNotifyClient,
    mockSendSms
  },
  NotifyClient: mockNotifyClient
}
