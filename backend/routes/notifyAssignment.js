const router = require('express').Router();
const supabaseAdmin = require('../config/supabaseClient');
const twilioClient = require('../config/twilioClient');
const requireAdmin = require('../middleware/requireAdmin');
const { buildAssignmentMessage, buildSendParams, normalizePhone } = require('../services/whatsappMessage');
const { runEscalationCheck } = require('../services/escalationChecker');

// Shared by POST /ticket-assigned and POST /resend/:ticketId — same send logic either way.
async function sendAssignmentWhatsApp(ticketId) {
  const { data: ticket, error: ticketErr } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .eq('id', ticketId)
    .single();
  if (ticketErr || !ticket) throw { status: 404, message: 'Ticket not found' };
  if (!ticket.assigned_staff_id) throw { status: 400, message: 'Ticket has no assigned staff' };

  const { data: staff } = await supabaseAdmin
    .from('profiles')
    .select('phone_number')
    .eq('id', ticket.assigned_staff_id)
    .single();
  if (!staff?.phone_number) throw { status: 400, message: 'Assigned staff has no phone number on file' };

  try {
    await twilioClient.messages.create({
      from: `whatsapp:${normalizePhone(process.env.TWILIO_WHATSAPP_NUMBER)}`,
      to: `whatsapp:${normalizePhone(staff.phone_number)}`,
      ...buildSendParams(process.env.TWILIO_ASSIGNMENT_TEMPLATE_SID, ticket, buildAssignmentMessage(ticket)),
    });
    await supabaseAdmin
      .from('tickets')
      .update({ whatsapp_sent_at: new Date().toISOString(), whatsapp_status: 'sent' })
      .eq('id', ticketId);
    return { status: 'sent' };
  } catch (err) {
    await supabaseAdmin.from('tickets').update({ whatsapp_status: 'failed' }).eq('id', ticketId);
    throw { status: 502, message: `WhatsApp send failed: ${err.message}` };
  }
}

router.post('/ticket-assigned', requireAdmin, async (req, res) => {
  const { ticketId } = req.body;
  if (!ticketId) return res.status(400).json({ error: 'ticketId is required' });
  try {
    res.json(await sendAssignmentWhatsApp(ticketId));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to send WhatsApp message' });
  }
});

router.post('/resend/:ticketId', requireAdmin, async (req, res) => {
  try {
    res.json(await sendAssignmentWhatsApp(req.params.ticketId));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to send WhatsApp message' });
  }
});

// Runs the 15-minute escalation job on demand, so the feature can be demoed without waiting.
router.post('/run-escalation-check', requireAdmin, async (req, res) => {
  try {
    res.json(await runEscalationCheck());
  } catch (err) {
    res.status(500).json({ error: err.message || 'Escalation check failed' });
  }
});

module.exports = router;
