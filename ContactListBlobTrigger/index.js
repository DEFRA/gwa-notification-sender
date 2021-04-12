const { BlobServiceClient } = require('@azure/storage-blob')
const { QueueClient } = require('@azure/storage-queue')

const connectionString = process.env.AzureWebJobsStorage

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)

const batchesContainerClient = blobServiceClient.getContainerClient(process.env.CONTACT_LISTS_BATCHES_CONTAINER)
// Prevent erroring if container doesn't exist
batchesContainerClient.createIfNotExists()
const initialContainerClient = blobServiceClient.getContainerClient(process.env.CONTACT_LISTS_INITIAL_CONTAINER)

// Client for adding messages for batch files
const batchesQ = process.env.CONTACT_LISTS_BATCHES_QUEUE
const qClient = new QueueClient(connectionString, batchesQ)
qClient.createIfNotExists()

module.exports = async function (context) {
  try {
    const { blobTrigger, initialContactListBlobName } = context.bindingData
    const { contacts, message } = context.bindings.blobContents
    const contactCount = contacts.length
    context.log(`Contact List Blob Trigger function activated:\n - Blob: ${blobTrigger}\n - Size: ${context.bindings.myBlob.length} Bytes\n - Number of contacts: ${contactCount}`)

    // Batch into smaller chunks
    const batches = []
    while (contacts.length) {
      batches.push({
        contacts: contacts.splice(0, 2200),
        message
      })
    }

    const now = Date.now()
    const promises = []
    const blobs = []
    for (let i = 0; i < batches.length; i++) {
      const blobName = `${now}-batch-${i}`
      const blockBlobClient = batchesContainerClient.getBlockBlobClient(blobName)

      const content = JSON.stringify(batches[i])
      promises.push(blockBlobClient.upload(content, content.length, { blobHTTPHeaders: { blobContentType: 'application/json' } }))

      // Add a message for file to process at staggered time in future
      const visibilityTimeout = 90 * (i + 1)
      const buf = Buffer.from(blobName, 'utf8')
      promises.push(qClient.sendMessage(buf.toString('base64'), { visibilityTimeout }))
      blobs.push({
        blobName,
        visibleIn: visibilityTimeout
      })
    }
    context.log('Blobs uploaded:', blobs)

    await Promise.all(promises)

    // Delete the inital contact list
    context.log(`'${initialContactListBlobName}' initiated the function and will be deleted.`)
    const blobClient = initialContainerClient.getBlobClient(initialContactListBlobName)

    await blobClient.delete()
  } catch (e) {
    context.log.error(e)
    // Throwing an error ensures the built-in retry will kick in
    throw new Error(e)
  }
}
