const logMock = jest.fn()
logMock.error = jest.fn()

module.exports = {
  log: logMock
}
