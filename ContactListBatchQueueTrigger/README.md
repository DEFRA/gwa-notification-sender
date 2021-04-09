# Contact List Batch Queue Trigger - JavaScript

> Triggers on messages in a queue containing the name of a file with a batch of
> contacts.

## Detail

The function triggers on messages in an Azure Queue Storage queue that have
been added by [ContactListBlobTrigger](../ContactListBlobTrigger).
The message includes the name of a file that contains a batch of contacts.

The file name is used to retrieve the contents of the file. For every contact
in the file a message is created with the phone number and message text before
adding the message to a queue.

When the messages have been added to the queue the file is deleted.
