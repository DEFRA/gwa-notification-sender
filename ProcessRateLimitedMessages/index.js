const { ContainerClient } = require('@azure/storage-blob')
const { QueueClient } = require('@azure/storage-queue')

const batchSize = parseInt(process.env.NOTIFICATIONS_FAILED_TO_SEND_PROCESSING_BATCH_SIZE, 10)
const batchesContainer = process.env.CONTACT_LIST_BATCHES_CONTAINER
const connectionString = process.env.AzureWebJobsStorage
const failedToSendQueue = process.env.NOTIFICATIONS_FAILED_TO_SEND_RATE_LIMIT_QUEUE
const toSendQueue = process.env.NOTIFICATIONS_TO_SEND_QUEUE
const visibilityTimeoutBase = parseInt(process.env.NOTIFICATIONS_FAILED_TO_SEND_VISIBILITY_TIMEOUT_BASE, 10)

const batchesContainerClient = new ContainerClient(connectionString, batchesContainer)
const failedToSendQueueClient = new QueueClient(connectionString, failedToSendQueue)
const toSendQueueClient = new QueueClient(connectionString, toSendQueue)

async function ensureResourcesExist () {
  await toSendQueueClient.createIfNotExists()
}

async function isBatchProcessingComplete () {
  const iter = batchesContainerClient.listBlobsFlat()
  const blobItem = await iter.next()
  return blobItem.done
}

module.exports = async function (context) {
  try {
    await ensureResourcesExist()
    const okToProcess = await isBatchProcessingComplete()
    if (!okToProcess) {
      context.log('Not OK to start processing messages.')
      return
    }
    context.log(`No batches in container '${batchesContainer}', going to start receiving messages.`)

    let totalMessages = 0
    let messageCount = 0
    let batchCount = 0
    do {
      const deletionPromises = []
      const sendPromises = []
      const messageItems = (await failedToSendQueueClient.receiveMessages({ numberOfMessages: batchSize })).receivedMessageItems
      messageCount = messageItems.length
      totalMessages += messageCount

      if (messageCount) {
        batchCount++
        const visibilityTimeout = visibilityTimeoutBase + batchCount
        context.log(`Moving ${messageCount} messages from '${failedToSendQueue}' to '${toSendQueue}' with visibilityTimeout '${visibilityTimeout}'. Batch ${batchCount}.`)

        for (const messageItem of messageItems) {
          const { messageId, messageText, popReceipt } = messageItem
          // TODO: check for 429 daily limit and
          const { notification } = JSON.parse(Buffer.from(messageText, 'base64').toString('utf8'))

          deletionPromises.push(failedToSendQueueClient.deleteMessage(messageId, popReceipt))

          const notificationB64Enc = Buffer.from(JSON.stringify(notification), 'utf8').toString('base64')
          sendPromises.push(toSendQueueClient.sendMessage(notificationB64Enc, { visibilityTimeout }))
        }
      } else {
        context.log(`No more messages to move from '${failedToSendQueue}'.`)
      }
      await Promise.all(deletionPromises.splice(0, batchSize), sendPromises.splice(0, batchSize))
    } while (messageCount)

    context.log(`Moved ${totalMessages} messages from '${failedToSendQueue}' to '${toSendQueue}' in ${batchCount} batches.`)
  } catch (e) {
    context.log.error(e)
    throw new Error(e)
  }
}
