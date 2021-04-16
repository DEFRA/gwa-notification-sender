# GWA Notification Sender

[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![tested with jest](https://img.shields.io/badge/tested_with-jest-99424f.svg)](https://github.com/facebook/jest)
[![Build and Deploy Production](https://github.com/DEFRA/gwa-notification-sender/actions/workflows/build-and-deploy-production.yml/badge.svg)](https://github.com/DEFRA/gwa-notification-sender/actions/workflows/build-and-deploy-production.yml)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_gwa-notification-sender&metric=coverage)](https://sonarcloud.io/dashboard?id=DEFRA_gwa-notification-sender)
[![Technical Debt](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_gwa-notification-sender&metric=sqale_index)](https://sonarcloud.io/dashboard?id=DEFRA_gwa-notification-sender)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_gwa-notification-sender&metric=sqale_rating)](https://sonarcloud.io/dashboard?id=DEFRA_gwa-notification-sender)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_gwa-notification-sender&metric=security_rating)](https://sonarcloud.io/dashboard?id=DEFRA_gwa-notification-sender)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_gwa-notification-sender&metric=vulnerabilities)](https://sonarcloud.io/dashboard?id=DEFRA_gwa-notification-sender)
[![Known Vulnerabilities](https://snyk.io/test/github/defra/gwa-notification-sender/badge.svg)](https://snyk.io/test/github/defra/gwa-notification-sender)

> An [Azure Function app](https://azure.microsoft.com/en-gb/services/functions/)
> for sending notifications to
> [GOV.UK Notify](https://www.notifications.service.gov.uk/)

## Functions

The app is made up of a number of functions, working as a unit processing
contact data into messages. The process is initiated when a file is uploaded to
a container that the `ProcessContactList` function triggers on. Data is
then processed by `ProcessContactListBatches` before being processed by
`SendMessage`.

Ensuring messages that have failed to send due to hitting rate limits (this
_shouldn't_ happen but needs to be accounted for) `ProcessRateLimitedMessages`
runs on a schedule.

Each function is explained in more detail in its' own README:

* [ProcessContactList](ProcessContactList/README.md)
* [ProcessContactListBatches](ProcessContactListBatches/README.md)
* [SendMessage](SendMessage/README.md)
* [ProcessRateLimitedMessages](ProcessRateLimitedMessages/README.md)

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

To start the function app run `func start` or `npm run start` (which just runs
`func start`).

### Pre-requisites

The app uses Azure Storage, specifically blobs and queues. When
working locally
[Azurite](https://github.com/Azure/Azurite) can be used to emulate storage.
Follow the
[instructions](https://docs.microsoft.com/en-us/azure/storage/common/storage-use-azurite)
for your preferred installation option.

The app will initiate the process when a file is uploaded to the container
specified by the env var `CONTACT_LIST_CONTAINER` e.g.
`contact-list-local`. The other containers and queues used by the app
will be created if they do not already exist.

The app uses `local.settings.json` for local development.
[.local.settings.json](.local.settings.json) can be used as the
basis as it contains all required env vars with the exception of secrets which
have been removed. The connection string for Azurite is included.

## Notify Set Up

The app sends message via Notify. Getting set up on Notify is straight forward,
simply follow the
[documentation](https://www.notifications.service.gov.uk/using-notify/get-started).
When set up, 2 env vars need to be set:

* `NOTIFY_CLIENT_API_KEY` - the API key
* `NOTIFY_TEMPLATE_ID` - the UUID of the message template

There are different types of
[API key](https://docs.notifications.service.gov.uk/rest-api.html#api-keys).
When running locally the API key should be of type `test`.

The message template should be empty apart from the message property i.e.
`((message))`. This allows the message to be fully controlled by the app
sending the message.

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
