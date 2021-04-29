const { ContainerClient } = require('@azure/storage-blob')
const { QueueClient } = require('@azure/storage-queue')

const batchesContainer = process.env.CONTACT_LIST_BATCHES_CONTAINER
const connectionString = process.env.AzureWebJobsStorage
const contactListContainer = process.env.CONTACT_LIST_CONTAINER
const contactListQueue = process.env.CONTACT_LIST_BATCHES_QUEUE
const initialVisibility = parseInt(process.env.INITIAL_MESSAGE_VISIBILITY, 10)

// Creating clients outside of the function is best practice as per
// https://docs.microsoft.com/en-us/azure/azure-functions/manage-connections
const batchesContainerClient = new ContainerClient(connectionString, batchesContainer)
const contactListContainerClient = new ContainerClient(connectionString, contactListContainer)
const batchesQueueClient = new QueueClient(connectionString, contactListQueue)

async function ensureResourcesExist (context) {
  await Promise
    .all([
      batchesContainerClient.createIfNotExists(),
      batchesQueueClient.createIfNotExists()
    ])
    .then(values => context.log(`Output from ensureResourcesExist: ${values}.`))
    .catch(error => context.log.error(`Error output from ensureResourcesExist: ${error}.`))
}

function createBatches (blobContents) {
  const { contacts, message } = JSON.parse(blobContents)
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
    await ensureResourcesExist(context)

    const { blobTrigger, contactListBlobName } = context.bindingData
    const { blobContents } = context.bindings
    context.log(`Contact List Blob Trigger function activated:\n - Blob: ${blobTrigger}\n - Size: ${blobContents.length} Bytes`)

    const batches = createBatches(blobContents)

    const now = Date.now()
    const promises = []
    const blobs = []
    for (let i = 0; i < batches.length; i++) {
      const blobName = `${now}-batch-${i}`
      const blockBlobClient = batchesContainerClient.getBlockBlobClient(blobName)

      const content = JSON.stringify(batches[i])
      promises.push(blockBlobClient.upload(content, content.length, { blobHTTPHeaders: { blobContentType: 'application/json' } }))

      // Add a message with the name of the file to process with staggered
      // future times
      const visibilityTimeout = 90 * i + initialVisibility
      const blobNameB64Enc = Buffer.from(blobName, 'utf8').toString('base64')
      promises.push(batchesQueueClient.sendMessage(blobNameB64Enc, { visibilityTimeout }))
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
