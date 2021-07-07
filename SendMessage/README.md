# Send Message - JavaScript

> Triggers on messages in a queue containing details
> of a message to send to GOV.UK Notify.

## Detail

The function triggers on messages in an Azure Queue Storage queue that have
been added by [ProcessContactListBatches](../ProcessContactListBatches).
The message includes the phone number to send the message to, the message
to send and the id of the message being sent. A
[template id](https://docs.notifications.service.gov.uk/rest-api.html#request-body)
and
[reference](https://docs.notifications.service.gov.uk/rest-api.html#reference-optional)
are added to the request prior to sending to Notify.

An item is added to the DB prior to sending with a status of
`Internal: Sent to Notify`. When (if) the receipt for the notification is
processed, this item will be updated with the
[status from Notify](https://docs.notifications.service.gov.uk/rest-api.html#status-text-message).
If the message sending fails, the pending receipt will be updated with a status
appropriate to the failure reason.

All statuses are appended with `Internal:` to differentiate them from the
statuses returned by Notify which are prepended with `Notify:`.

There are
[numerous response codes](https://docs.microsoft.com/en-us/rest/api/cosmos-db/http-status-codes-for-cosmosdb)
Cosmos DB can return. If the response code is `409` (the id already exists) the
message will be treated in the same way as a rate limit failure and it will be
retried. If the response from Cosmos is anything else it will be added to the
failed queue for later analysis.

Messages that fail to send and are retried will create multiple receipts. There
will be some receipts with the status `Internal: To be retried` and another
receipt with the final status, either a success or a failure, depending what
happens.
Maintaining a record for each failed send attempt enables reports to be
generated for the frequency of this happening. The overall status of a send
attempt for a phone number is still able to be reported on.

If there is a problem with the sending of the message the error is caught,
logged and added to another queue for later analysis.
