const { mockSendSms } = require('notifications-node-client').mocks
const { mockNotifyClient } = require('notifications-node-client').mocks

const context = require('../test/defaultContext')
const testEnvVars = require('../test/testEnvVars')

const sendMessage = require('./index')
const { bindings: functionBindings } = require('./function')

const inputBindingName = 'notification'
const rateLimitExceededQueueName = 'rateLimitExceeded'

describe('SendMessage function', () => {
  const phoneNumber = '07000111222'
  const message = 'message'
  const notification = { message, phoneNumber }
  const errors = [{ error: 'ValidationError', message: 'phone_number is required' }]

  beforeAll(() => {
    context.bindingData = { dequeueCount: 1 }
    context.bindings = { notification }
  })

  afterEach(() => { jest.clearAllMocks() })

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

    expect(context.bindings).toHaveProperty(rateLimitExceededQueueName)
    expect(context.bindings[rateLimitExceededQueueName]).toHaveProperty('error')
    expect(context.bindings[rateLimitExceededQueueName].error).toMatchObject({ errors, status_code: rateLimitedStatusCode })
    expect(context.bindings[rateLimitExceededQueueName]).toHaveProperty(inputBindingName)
    expect(context.bindings[rateLimitExceededQueueName][inputBindingName]).toMatchObject(notification)
    expect(context.log.error).toHaveBeenCalled()
  })

  test.each([
    [{ response: { data: { errors, status_code: 403 } } }],
    [{ message, code: 'EAI_AGAIN' }],
    [{ message, code: 'ECONNRESET' }],
    [{ message, code: 'ENOTFOUND' }],
    [{ message, code: 'ETIMEDOUT' }]
  ])('test case %#, non-rate limited failed notifications deemed ok to try again with a dequeueCount < 5 throw an error, input - %o', async (error) => {
    context.bindingData.dequeueCount = 4
    mockSendSms.mockRejectedValue(error)

    await expect(sendMessage(context)).rejects.toThrow(Error)

    expect(context.log.error).toHaveBeenCalled()
    expect(context.log.warn).toHaveBeenCalled()
  })

  test('non-rate limited failed notifications with a dequeueCount of 5 are added to failed output binding', async () => {
    const errorStatusCode = 500
    context.bindingData.dequeueCount = 5
    mockSendSms.mockRejectedValueOnce({ response: { data: { errors, status_code: errorStatusCode } } })

    await sendMessage(context)

    expect(context.bindings).toHaveProperty('failed')
    expect(context.bindings.failed).toHaveProperty('error')
    expect(context.bindings.failed.error).toMatchObject({ errors, status_code: errorStatusCode })
    expect(context.bindings.failed).toHaveProperty(inputBindingName)
    expect(context.bindings.failed[inputBindingName]).toMatchObject(notification)
    expect(context.log.error).toHaveBeenCalled()
    expect(context.log.warn).toHaveBeenCalled()
  })
})

describe('SendMessage bindings', () => {
  test('queueTrigger input binding is correct', () => {
    const bindings = functionBindings.filter(binding => binding.direction === 'in')
    expect(bindings).toHaveLength(1)

    const binding = bindings[0]
    expect(binding.name).toEqual(inputBindingName)
    expect(binding.type).toEqual('queueTrigger')
    expect(binding.queueName).toEqual(`%${testEnvVars.NOTIFICATIONS_TO_SEND_QUEUE}%`)
  })

  const outputBindings = functionBindings.filter(binding => binding.direction === 'out')

  test('two output bindings exist', () => {
    expect(outputBindings).toHaveLength(2)
  })

  test('failed message queue output binding is correct', () => {
    const bindings = outputBindings.filter(binding => binding.name === 'failed')
    expect(bindings).toHaveLength(1)

    const binding = bindings[0]
    expect(binding.type).toEqual('queue')
    expect(binding.queueName).toEqual(`%${testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_QUEUE}%`)
  })

  test('rate limited message queue output binding is correct', () => {
    const bindings = outputBindings.filter(binding => binding.name === rateLimitExceededQueueName)
    expect(bindings).toHaveLength(1)

    const binding = bindings[0]
    expect(binding.type).toEqual('queue')
    expect(binding.queueName).toEqual(`%${testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_RATE_LIMIT_QUEUE}%`)
  })
})
