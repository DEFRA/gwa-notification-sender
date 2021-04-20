module.exports = (count) => {
  const contacts = []
  let numberBase = 100000000
  for (let i = 0; i < count; i++) {
    contacts.push({ phoneNumber: `07${numberBase++}` })
  }
  return contacts
}
