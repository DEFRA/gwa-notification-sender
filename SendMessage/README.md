# Send Message - JavaScript

> Triggers on messages in a queue containing details
> of a message to send to GOV.UK Notify.

## Detail

The function triggers on messages in an Azure Queue Storage queue that have
been added by [ProcessContactListBatches](../ProcessContactListBatches).
The message includes the phone number to send the message too and the message
to send. A
[template id](https://docs.notifications.service.gov.uk/rest-api.html#request-body)
and
[reference](https://docs.notifications.service.gov.uk/rest-api.html#reference-optional)
are added to the request prior to sending to Notify.

An item is added to the DB prior to sending with a status of `Sent to Notify`.
When (if) the receipt for the notification is processed, this item will be
updated with the
[status from Notify](https://docs.notifications.service.gov.uk/rest-api.html#status-text-message).

If there is a problem with the sending of the message the error is caught,
logged and added to another queue for later analysis.
