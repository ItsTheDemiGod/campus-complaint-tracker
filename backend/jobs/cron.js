const cron = require('node-cron');
const { runEscalationCheck } = require('../services/escalationChecker');

// Runs inside the Express process, so it only fires while this process stays alive —
// a server restart or crash pauses it until the process comes back up. Fine for local
// dev/demo; a real deployment would need a persistent scheduler (e.g. a platform cron
// add-on) or an external cron service hitting a trigger endpoint instead.
function startEscalationCron() {
  cron.schedule('*/15 * * * *', () => {
    runEscalationCheck().catch((err) => console.error('Escalation cron failed:', err.message));
  });
}

module.exports = { startEscalationCron };
