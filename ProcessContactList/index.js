const { ContainerClient } = require('@azure/storage-blob')
const { QueueClient } = require('@azure/storage-queue')

const connectionString = process.env.AzureWebJobsStorage
const initialVisibility = parseInt(process.env.INITIAL_MESSAGE_VISIBILITY, 10)
const batchesQ = process.env.CONTACT_LIST_BATCHES_QUEUE

// Creating clients outside of the function is best practice as per
// https://docs.microsoft.com/en-us/azure/azure-functions/manage-connections
const batchesContainerClient = new ContainerClient(connectionString, process.env.CONTACT_LIST_BATCHES_CONTAINER)
const contactListContainerClient = new ContainerClient(connectionString, process.env.CONTACT_LIST_CONTAINER)
const qClient = new QueueClient(connectionString, batchesQ)

async function ensureResourcesExist () {
  // Prevent erroring if container or queue doesn't exist. Ideally this would
  // be outside of the function body but no top level await
  await batchesContainerClient.createIfNotExists()
  await qClient.createIfNotExists()
}

function createBatches (blobContents) {
  const { contacts, message } = blobContents
  const batches = []
  while (contacts.length) {
    batches.push({
      contacts: contacts.splice(0, 2500),
      message
    })
  }
  return batches
}

module.exports = async function (context) {
  try {
    await ensureResourcesExist()

    const { blobTrigger, contactListBlobName } = context.bindingData
    const { blobContents } = context.bindings
    context.log(`Contact List Blob Trigger function activated:\n - Blob: ${blobTrigger}\n - Size: ${context.bindings.myBlob.length} Bytes`)

    // Batch into smaller chunks
    const batches = createBatches(blobContents)

    const now = Date.now()
    const promises = []
    const blobs = []
    for (let i = 0; i < batches.length; i++) {
      const blobName = `${now}-batch-${i}`
      const blockBlobClient = batchesContainerClient.getBlockBlobClient(blobName)

      const content = JSON.stringify(batches[i])
      promises.push(blockBlobClient.upload(content, content.length, { blobHTTPHeaders: { blobContentType: 'application/json' } }))

      // Add a message for file to process at staggered time in future
      const visibilityTimeout = 90 * i + initialVisibility
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
    context.log(`'${contactListBlobName}' initiated the function and will be deleted.`)
    const blobClient = contactListContainerClient.getBlobClient(contactListBlobName)

    await blobClient.delete()
  } catch (e) {
    context.log.error(e)
    // Throwing an error ensures the built-in retry will kick in
    throw new Error(e)
  }
}
