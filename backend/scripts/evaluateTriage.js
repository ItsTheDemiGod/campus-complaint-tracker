// Standalone eval: `node backend/scripts/evaluateTriage.js` (needs GEMINI_API_KEY in root .env).
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { classifyTicket, MODEL } = require('../services/aiTriage');

// Hand-built set (no historical data). The last three are deliberately ambiguous:
// expect lower confidence and possible "wrong" categories there.
const CASES = [
  ['The ceiling fan in room 204 sparks and smells like burning when switched on, wires visible.', 'Block C 204', 'electrical', 'critical'],
  ['Tube light in the corridor has been flickering for a week.', 'Block A corridor', 'electrical', 'low'],
  ['No power in the whole of Block B since morning, none of the sockets work.', 'Block B', 'electrical', 'high'],
  ['Tap in the bathroom is dripping constantly and wasting water.', 'Hostel D floor 2', 'plumbing', 'low'],
  ['Water is gushing from a burst pipe in the corridor and flooding the rooms.', 'Block A ground floor', 'plumbing', 'critical'],
  ['Toilet flush is not working, cannot be used for two days.', 'Block C floor 3', 'plumbing', 'medium'],
  ['Wi-Fi is not connecting in my room at all.', 'Hostel B 112', 'wifi', 'medium'],
  ['Internet is completely down across the entire hostel block during exams.', 'Hostel A', 'wifi', 'high'],
  ['wifi speed is a bit slow in the evenings', 'Hostel C', 'wifi', 'low'],
  ['Three computers in CS Lab 2 will not boot, the whole practical batch is stuck.', 'CS Lab 2', 'lab', 'high'],
  ['Projector in lab 5 has a dead pixel line, still usable.', 'Lab 5', 'lab', 'low'],
  ['Oscilloscope in the electronics lab is giving wrong readings and needs calibration.', 'Electronics Lab', 'lab', 'medium'],
  ['Gas leak smell near the chemistry lab burners, students evacuated.', 'Chemistry Lab', 'lab', 'critical'],
  ['My hostel cot is broken and the mattress has sagged badly.', 'Hostel B 301', 'hostel', 'medium'],
  ['Window latch in my room is broken, will not close properly.', 'Hostel A 105', 'hostel', 'low'],
  ['Mess hall tables are dirty and the cleaning is poor lately.', 'Mess', 'other', 'low'],
  ['Stray dogs keep entering the campus gate at night, feels unsafe.', 'Main gate', 'other', 'high'],
  ['Something is wrong in my room, please fix it.', 'Hostel C 210', 'other', 'medium'], // ambiguous
  ['Lights and internet both stopped working in the lab.', 'Lab 3', 'electrical', 'high'], // ambiguous
  ['Water is leaking from the AC near the router and the network keeps dropping.', 'Server room', 'plumbing', 'high'], // ambiguous
];

(async () => {
  const rows = [];
  for (const [description, location, expectedCategory, expectedPriority] of CASES) {
    const result = await classifyTicket(description, location);
    rows.push({ description, location, expectedCategory, expectedPriority, result });
    console.log(
      result
        ? `cat ${result.category === expectedCategory ? 'OK ' : 'BAD'} (${result.category}/${expectedCategory})  pri ${result.priority === expectedPriority ? 'OK ' : 'BAD'} (${result.priority}/${expectedPriority})  conf ${result.confidence}`
        : 'FAIL (null result)',
      '-', description.slice(0, 50),
    );
  }
  const ok = rows.filter((r) => r.result);
  const pct = (n) => (ok.length ? +((100 * n) / ok.length).toFixed(1) : null);
  const summary = {
    model: MODEL,
    ranAt: new Date().toISOString(),
    total: rows.length,
    failures: rows.length - ok.length,
    categoryAccuracyPct: pct(ok.filter((r) => r.result.category === r.expectedCategory).length),
    priorityAccuracyPct: pct(ok.filter((r) => r.result.priority === r.expectedPriority).length),
    avgConfidence: ok.length ? +(ok.reduce((s, r) => s + r.result.confidence, 0) / ok.length).toFixed(3) : null,
  };
  console.log('\n', summary);
  fs.writeFileSync(path.join(__dirname, 'eval-results.json'), JSON.stringify({ summary, rows }, null, 2));
})();
