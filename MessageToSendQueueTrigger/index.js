const { NotifyClient } = require('notifications-node-client')
const { v4: uuid } = require('uuid')

const notifyClientApiKey = process.env.NOTIFY_CLIENT_API_KEY
const notifyTemplateId = process.env.NOTIFY_TEMPLATE_ID
const notifyClient = new NotifyClient(notifyClientApiKey)

module.exports = async function (context) {
  const { notification } = context.bindings
  context.log('Message To Send Queue Trigger function activated for:', notification)

  try {
    const { message, phoneNumber } = notification
    await notifyClient.sendSms(notifyTemplateId, phoneNumber, {
      personalisation: { message },
      reference: uuid()
    })
  } catch (e) {
    const error = e?.response?.data ?? e
    context.log.error(error)
    // Add to failed queue for later inspection
    context.bindings.failed = {
      error,
      originalNotification: {
        ...notification
      }
    }
    // Don't rethrow - we don't want to keep making the requests if it is wrong
  }
}
