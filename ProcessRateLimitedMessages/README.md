# Process Rate Limited Messages - JavaScript

> Triggers on a timer, checking for messages that have failed to send due to
> being rate limited.

## Detail

The function triggers on a timer every 1 minute. The function first checks to
see if there are any files in the Azure Blob Storage container used for storing
the contact list batches. If files are found the function will exit. If no
files are found, the function will continue (see the
[notes](#processing-finished-indicator) below on why this is done).
The function moves messages from the queue used to store messages that
have failed to send (due to hitting Notify rate limits) to the message sending
queue.

The process of moving messages is to receive batches of messages (maximum 32),
use them to send new messages and delete the failed to send messages.
When messages are sent to the sending queue the
[`visibilityTimeout`](https://azuresdkdocs.blob.core.windows.net/$web/javascript/azure-storage-queue/12.4.0/interfaces/queuesendmessageoptions.html#visibilitytimeout)
property is set. For each batch of messages the timeout is incremented by 1
second. This effectively rate limits the messages to a maximum of 1920 (60 *
32) messages per minute (below the
[3K per minute rate](https://docs.notifications.service.gov.uk/rest-api.html#rate-limits)
for Notify).

## Notes

### Processing finished indicator

Using the fact there aren't any files in the batch processing container as an
indicator processing has completed is simple and _should_ be robust. If this
isn't the case the mechanism can be reviewed.

One consideration is the potential for this function to trigger just after a
file has been deleted. This could mean a full batch of 2.5K messages has
started to be processed (although if it was the last file it is very unlikely
to be the full 2.5K). However, to accommodate for this scenario messages are
sent to the send queue with a `visibilityTimeout` of a minimum of 30 seconds in
the future. If rate limits were hit again then the process would begin again so
there _shouldn't_ be a issues.
