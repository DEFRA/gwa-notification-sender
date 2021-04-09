const { BlobServiceClient } = require('@azure/storage-blob')

const connectionString = process.env.AzureWebJobsStorage
const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)

const batchesContainerName = process.env.CONTACT_LISTS_BATCHES_CONTAINER
const batchesContainerClient = blobServiceClient.getContainerClient(batchesContainerName)

async function streamToBuffer (readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    readableStream.on('data', (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data))
    })
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks))
    })
    readableStream.on('error', reject)
  })
}

module.exports = async function (context) {
  try {
    const { contactListBatchFileName } = context.bindings
    context.log('Contact List Batch Queue Trigger function activated:\n - QueueItem:', contactListBatchFileName)

    const messagesToBeSent = []
    const batchesBlobClient = batchesContainerClient.getBlobClient(contactListBatchFileName)
    const downloadBlobResponse = await batchesBlobClient.download()
    const blobContents = (await streamToBuffer(downloadBlobResponse.readableStreamBody)).toString()

    const { contacts, message } = JSON.parse(blobContents)

    for (let i = 0; i < contacts.length; i++) {
      const phoneNumber = contacts[i].phoneNumber
      const msg = {
        message,
        phoneNumber
      }
      messagesToBeSent.push(msg)
    }

    context.bindings.messagesToSend = messagesToBeSent
    context.log(`${messagesToBeSent.length} messages added to queue for sending.`)

    // Delete batch of contacts
    context.log(`'${contactListBatchFileName}' initiated the function and will be deleted.`)
    await batchesBlobClient.delete()
  } catch (e) {
    context.log.error(e)
    // Throwing an error ensures the built-in retry will kick in
    throw new Error(e)
  }
}
