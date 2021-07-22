const statusType = 'Internal'

// Statuses are used in `gwa-web` for reporting purposes. Changes here may
// require changes in that project.
module.exports = {
  dbConflict: `${statusType}: DB conflict`,
  failedToSend: `${statusType}: Failed to send`,
  rateLimited: `${statusType}: Rate limit exceeded`,
  retry: `${statusType}: To be retried`,
  sent: `${statusType}: Sent to Notify`
}
