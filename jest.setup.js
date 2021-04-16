const envVars = require('./test/testEnvVars')

process.env.AzureWebJobsStorage = envVars.AzureWebJobsStorage
process.env.CONTACT_LIST_BATCHES_CONTAINER = envVars.CONTACT_LIST_BATCHES_CONTAINER
process.env.CONTACT_LIST_CONTAINER = envVars.CONTACT_LIST_CONTAINER
process.env.CONTACT_LIST_BATCHES_QUEUE = envVars.CONTACT_LIST_BATCHES_QUEUE
process.env.INITIAL_MESSAGE_VISIBILITY = envVars.INITIAL_MESSAGE_VISIBILITY
