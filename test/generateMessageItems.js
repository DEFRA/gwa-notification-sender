module.exports = (count, err = { error: 'RateLimitError', message: 'not used' }) => {
  const messageItems = []
  let numberBase = 100000000
  for (let i = 0; i < count; i++) {
    messageItems.push({
      messageId: `messageId-${i}`,
      messageText: Buffer.from(JSON.stringify({ error: { errors: [err], status_code: 429 }, notification: { phoneNumber: `07${numberBase++}`, message: `message-${i}` } }), 'utf8').toString('base64'),
      popReceipt: `popReceipt-${i}`
    })
  }
  return messageItems
}
