const context = require('../test/defaultContext')
const testEnvVars = require('../test/testEnvVars')

const { bindings: functionBindings } = require('./function')

const inputBindingName = 'notification'
const rateLimitExceededQueueName = 'rateLimitExceeded'

describe('SendMessage function', () => {
  const phoneNumber = '07000111222'
  const message = 'message'
  const notification = { message, phoneNumber }
  const errors = [{ error: 'ValidationError', message: 'phone_number is required' }]
  const uuidVal = 'd961effb-6779-4a90-ab51-86c2086de339'

  let CosmosClient
  let NotifyClient
  let containerMock
  let createMock
  let sendMessage

  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()

    CosmosClient = require('@azure/cosmos').CosmosClient
    jest.mock('@azure/cosmos')
    createMock = jest.fn()
    containerMock = jest.fn(() => { return { items: { create: createMock } } })
    CosmosClient.prototype.database.mockImplementation(() => {
      return { container: containerMock }
    })

    NotifyClient = require('notifications-node-client').NotifyClient
    jest.mock('notifications-node-client')

    const { v4: uuid } = require('uuid')
    jest.mock('uuid')
    uuid.mockReturnValue(uuidVal)

    sendMessage = require('.')

    context.bindingData = { dequeueCount: 1 }
    context.bindings = { notification }
  })

  test('Notify and Cosmos clients are correctly created on module import', async () => {
    expect(NotifyClient).toHaveBeenCalledTimes(1)
    expect(NotifyClient).toHaveBeenCalledWith(testEnvVars.NOTIFY_CLIENT_API_KEY)

    expect(CosmosClient).toHaveBeenCalledTimes(1)
    expect(CosmosClient).toHaveBeenCalledWith(testEnvVars.COSMOS_DB_CONNECTION_STRING)
    const databaseMock = CosmosClient.mock.instances[0].database
    expect(databaseMock).toHaveBeenCalledTimes(1)
    expect(databaseMock).toHaveBeenCalledWith(testEnvVars.COSMOS_DB_NAME)
    expect(containerMock).toHaveBeenCalledTimes(1)
    expect(containerMock).toHaveBeenCalledWith(testEnvVars.COSMOS_DB_RECEIPTS_CONTAINER)
  })

  test('message is sent to Notify and pending receipt created with correct details', async () => {
    await sendMessage(context)

    const notifyClientMockInstance = NotifyClient.mock.instances[0]
    expect(notifyClientMockInstance.sendSms).toHaveBeenCalledTimes(1)
    expect(notifyClientMockInstance.sendSms).toHaveBeenCalledWith(
      testEnvVars.NOTIFY_TEMPLATE_ID,
      phoneNumber,
      { personalisation: { message }, reference: uuidVal }
    )
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(createMock).toHaveBeenCalledWith({ id: uuidVal, status: 'Sent to Notify', to: phoneNumber })
  })

  test('rate limited failed notifications are added to rate limited output binding', async () => {
    const rateLimitedStatusCode = 429
    NotifyClient.prototype.sendSms.mockRejectedValueOnce({ response: { data: { errors, status_code: rateLimitedStatusCode } } })

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
    NotifyClient.prototype.sendSms.mockRejectedValue(error)

    await expect(sendMessage(context)).rejects.toThrow(Error)

    expect(context.log.error).toHaveBeenCalled()
    expect(context.log.warn).toHaveBeenCalled()
  })

  test('409 response from Cosmos will throw an error', async () => {
    createMock.mockRejectedValue({ code: 409 })

    await expect(sendMessage(context)).rejects.toThrow(Error)

    expect(context.log.error).toHaveBeenCalled()
    expect(context.log.warn).toHaveBeenCalled()
  })

  test.each([
    [{ code: 400 }],
    [{ code: 401 }],
    [{ code: 403 }],
    [{ code: 408 }],
    [{ code: 413 }],
    [{ code: 423 }],
    [{ code: 429 }],
    [{ code: 500 }],
    [{ code: 503 }]
  ])('test case %#, unsuccessul responses from Cosmos (expect 409) are added to failed output binding, input - %o', async (error) => {
    createMock.mockRejectedValue(error)

    await sendMessage(context)

    expect(context.log.error).toHaveBeenCalled()
    expect(context.log.warn).toHaveBeenCalled()
    expect(context.bindings).toHaveProperty('failed')
    expect(context.bindings.failed).toHaveProperty('error')
    expect(context.bindings.failed.error).toMatchObject(error)
    expect(context.bindings.failed).toHaveProperty(inputBindingName)
    expect(context.bindings.failed[inputBindingName]).toMatchObject(notification)
  })

  test('non-rate limited failed notifications with a dequeueCount of 5 are added to failed output binding', async () => {
    const errorStatusCode = 500
    context.bindingData.dequeueCount = 5
    NotifyClient.prototype.sendSms.mockRejectedValueOnce({ response: { data: { errors, status_code: errorStatusCode } } })

    await sendMessage(context)

    expect(context.log.error).toHaveBeenCalled()
    expect(context.log.warn).toHaveBeenCalled()
    expect(context.bindings).toHaveProperty('failed')
    expect(context.bindings.failed).toHaveProperty('error')
    expect(context.bindings.failed.error).toMatchObject({ errors, status_code: errorStatusCode })
    expect(context.bindings.failed).toHaveProperty(inputBindingName)
    expect(context.bindings.failed[inputBindingName]).toMatchObject(notification)
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
    expect(binding.connection).toEqual('AzureWebJobsStorage')
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
    expect(binding.connection).toEqual('AzureWebJobsStorage')
  })

  test('rate limited message queue output binding is correct', () => {
    const bindings = outputBindings.filter(binding => binding.name === rateLimitExceededQueueName)
    expect(bindings).toHaveLength(1)

    const binding = bindings[0]
    expect(binding.type).toEqual('queue')
    expect(binding.queueName).toEqual(`%${testEnvVars.NOTIFICATIONS_FAILED_TO_SEND_RATE_LIMIT_QUEUE}%`)
    expect(binding.connection).toEqual('AzureWebJobsStorage')
  })
})
