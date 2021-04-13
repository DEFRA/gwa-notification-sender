# GWA Notification Sender

> An [Azure Function app](https://azure.microsoft.com/en-gb/services/functions/)
> for sending notifications to
> [GOV.UK Notify](https://www.notifications.service.gov.uk/)

## Functions

The app is made up of a number of functions, working as a unit processing
contact data into messages. The process is initiated when a file is uploaded to
a container that the `ContactListBlobTrigger` function triggers on. Data is
then processed by `ContactListBatchQueueTrigger` before being processed by
`MessageToSendQueueTrigger`.

Each function is explained in more detail in its' own README:

* [ContactListBatchQueueTrigger](ContactListBatchQueueTrigger/README.md)
* [ContactListBlobTrigger](ContactListBlobTrigger/README.md)
* [MessageToSendQueueTrigger](MessageToSendQueueTrigger/README.md)

## Function Development

The best place to start for an overall view of how JavaScript Functions work in
Azure is the
[Azure Functions JavaScript developer guide](https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=v2).
From there follow the appropriate link to the documentation specific to
your preferred development environment i.e.
[Visual Studio Code](https://docs.microsoft.com/en-us/azure/azure-functions/create-first-function-vs-code-node)
or
[command line](https://docs.microsoft.com/en-us/azure/azure-functions/create-first-function-cli-node?tabs=azure-cli%2Cbrowser).

The documentation within this repo assumes the `command line` setup has been
completed, specifically for
[Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli).

## Running Locally

To start the function app run `func start`.

### Pre-requisites

The function app uses Azure Storage, specifically blobs and queues. When
working locally
[Azurite](https://github.com/Azure/Azurite) can be used to emulate storage.
Follow the
[instructions](https://docs.microsoft.com/en-us/azure/storage/common/storage-use-azurite)
for your preferred installation option.

The app will initiate the process when a file is uploaded to the container
specified by the env var `CONTACT_LISTS_INITIAL_CONTAINER` e.g.
`contact-lists-initial-local`. The other containers and queues used by the app
will be created if they do not already exist.

The app uses `local.settings.json` for local development.
[example.local.settings.json](example.local.settings.json) can be used as the
basis as it contains all required env vars with the exception of secrets which
have been removed. The connection string for Azurite is included.

## License

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT
LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and
applications when using this information.

> Contains public sector information licensed under the Open Government license
> v3

### About the license

The Open Government Licence (OGL) was developed by the Controller of Her
Majesty's Stationery Office (HMSO) to enable information providers in the
public sector to license the use and re-use of their information under a common
open licence.

It is designed to encourage use and re-use of information freely and flexibly,
with only a few conditions.
