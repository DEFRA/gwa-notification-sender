# Process Initial Contact List - JavaScript

> Triggers on files in blob storage containing a list of contacts and a message
> to send to them.

## Detail

The function triggers on files in an Azure Blob Storage container.  The purpose
of the function is to process the file into smaller batches of contacts to send
the message to. Notify has a rate limit of
[3K messages per minute](https://docs.notifications.service.gov.uk/rest-api.html#rate-limits)
and without a rate limiting mechanism the function will far exceed that. Along
with creating the files for the batches of contacts a message is added to an
Azure Queue Storage queue for each file. Each message is created with
[`visibilityTimeout`](https://azuresdkdocs.blob.core.windows.net/$web/javascript/azure-storage-queue/12.4.0/interfaces/queuesendmessageoptions.html#visibilitytimeout)
set to be at enough of gap to mostly avoid hitting the rate limit. See
[Batch sizes and gaps](#batch-sizes-and-gaps) for additional information.

When the batch files and messages have been created and sent the file
responsible for triggering the function is deleted.

The files are expected to have been added by a web app where the details of the
message and contacts list is managed. However, there are no checks that this is
the case.

The format of the file is expected to be a JSON object e.g.:

```json
{
  "message": "hello world",
  "contacts": [{ "phoneNumber": "07NNNNNNNNN" }]
}
```

There are no checks performed on the format of the `phoneNumber` as this is
expected to have been done prior to the creation of the file.
Notify will not send messages to non-mobile phone numbers. The number of
messages billed for each message sent it determined by the size of the message
i.e. the number of characters in the message. Additional details are available
for
[Notify Pricing](https://www.notifications.service.gov.uk/pricing#long-text-messages).

The size of `contacts` is effectively unbound. However, it is not expected a
list of contacts will exceed 50K and the number is likely to be less than that
for most message sends.
The batching process will handle many millions of contacts so _should_ be able
to handle scenarios where the number of contacts to be sent to at any one time
increases significantly.

## Notes

### Function triggering in quick succession

It is worth mentioning the batching process and processing of those messages
has no mechanism currently builtin to prevent the scenario of several files
being uploaded and processed in quick succession. This could happen if the web
app were to be used to send a message before a previous message had completed
sending to all contacts.
This would have the effect of overriding this rate limiting mechanism.

Message sending is not expected to be a common scenario so
this _shouldn't_ be a problem. If it transpires this is not the case some
rework would be required to ensure the message sends were queued in order and
did not exceed sending batches more than once per minute.

### Batch sizes and gaps

Through trial and error the batch size and gaps between them was settled on as
2.5K messages every 90 seconds with a 30 second initial buffer to allow the
processing of the first batch to be completed before the second batch begins.
Smaller batch sizes being sent more frequently were tested down to 1.2K
messages every 32 seconds and several batch sizes using 65+ second gaps.
However, using a longer gap proved to be more successful at not hitting rate
limits.
