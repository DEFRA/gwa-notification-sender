module.exports = (count) => {
  const messageItems = []
  for (let i = 0; i < count; i++) {
    messageItems.push({
      messageId: `messageId-${i}`,
      messageText: Buffer.from(JSON.stringify({ notification: { phoneNumber: `07${i}`, message: `message-${i}` } }), 'utf8').toString('base64'),
      popReceipt: `popReceipt-${i}`
    })
  }
  return messageItems
}
