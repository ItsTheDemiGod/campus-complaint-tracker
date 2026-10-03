const router = require('express').Router();
const requireAuth = require('../middleware/requireAuth');
const { classifyTicket } = require('../services/aiTriage');

router.post('/suggest-triage', requireAuth, async (req, res) => {
  const { description, location } = req.body ?? {};
  if (typeof description !== 'string' || description.trim().length < 5 || description.length > 2000) {
    return res.status(400).json({ error: 'description (5-2000 chars) is required' });
  }
  const result = await classifyTicket(description.trim(), typeof location === 'string' ? location.slice(0, 200) : '');
  if (!result) return res.status(503).json({ error: 'AI suggestion unavailable' });
  res.json(result);
});

module.exports = router;
