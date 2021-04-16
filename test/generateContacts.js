function generateContacts (n) {
  const contacts = []
  let numberBase = 100000000
  for (let i = 0; i < n; i++) {
    contacts.push({ phoneNumber: `07${numberBase++}` })
  }
  return contacts
}

module.exports = generateContacts
