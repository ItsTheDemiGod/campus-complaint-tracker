const twilio = require('twilio');

// Backend-only: TWILIO_AUTH_TOKEN must never reach the frontend.
module.exports = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
