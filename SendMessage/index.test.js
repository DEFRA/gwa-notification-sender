const { mockSendSms } = require('notifications-node-client').mocks
const { mockNotifyClient } = require('notifications-node-client').mocks

const context = require('../test/defaultContext')
const testEnvVars = require('../test/testEnvVars')

const sendMessage = require('./index')

describe('SendMessage function', () => {
  const phoneNumber = '07000111222'
  const message = 'message'
  const notification = { message, phoneNumber }
  const errors = [{ error: 'ValidationError', message: 'phone_number is required' }]

  beforeAll(() => {
    context.bindingData = { dequeueCount: 1 }
    context.bindings = { notification }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('message is sent to Notify with correct details', async () => {
    mockSendSms.mockResolvedValueOnce()
    await sendMessage(context)

    expect(context.log.error).not.toHaveBeenCalled()
    expect(mockNotifyClient).toHaveBeenCalledTimes(1)
    expect(mockNotifyClient).toHaveBeenCalledWith(testEnvVars.NOTIFY_CLIENT_API_KEY)
    expect(mockSendSms).toHaveBeenCalledTimes(1)
    expect(mockSendSms).toHaveBeenCalledWith(testEnvVars.NOTIFY_TEMPLATE_ID, phoneNumber,
      expect.objectContaining({
        personalisation: { message },
        reference: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      })
    )
  })

  test('rate limited failed notifications are added to rate limited output binding', async () => {
    const rateLimitedStatusCode = 429
    mockSendSms.mockRejectedValueOnce({ response: { data: { errors, status_code: rateLimitedStatusCode } } })

    await sendMessage(context)

    expect(context.bindings).toHaveProperty('rateLimitExceeded')
    expect(context.bindings.rateLimitExceeded).toHaveProperty('error')
    expect(context.bindings.rateLimitExceeded.error).toMatchObject({ errors, status_code: rateLimitedStatusCode })
    expect(context.bindings.rateLimitExceeded).toHaveProperty('notification')
    expect(context.bindings.rateLimitExceeded.notification).toMatchObject(notification)
    expect(context.log.error).toHaveBeenCalled()
  })

  test('non-rate limited failed notifications deemed ok to try again with a dequeueCount < 5 throw an error', async () => {
    mockSendSms.mockRejectedValueOnce({ response: { data: { errors, status_code: 403 } } })

    context.bindingData.dequeueCount = 4

    await expect(sendMessage(context)).rejects.toThrow(Error)

    expect(context.log.error).toHaveBeenCalled()
    expect(context.log.warn).toHaveBeenCalled()
  })

  test('non-rate limited failed notifications with a dequeueCount of 5 are added to failed output binding', async () => {
    const errorStatusCode = 500
    // mockSendSms.mockRejectedValueOnce({ response: { message: 'error message', code: 'ENOTFOUND' } })
    mockSendSms.mockRejectedValueOnce({ response: { data: { errors, status_code: errorStatusCode } } })
    context.bindingData.dequeueCount = 5

    await sendMessage(context)

    expect(context.bindings).toHaveProperty('failed')
    expect(context.bindings.failed).toHaveProperty('error')
    expect(context.bindings.failed.error).toMatchObject({ errors, status_code: errorStatusCode })
    expect(context.bindings.failed).toHaveProperty('notification')
    expect(context.bindings.failed.notification).toMatchObject(notification)
    expect(context.log.error).toHaveBeenCalled()
    expect(context.log.warn).toHaveBeenCalled()
  })
})
