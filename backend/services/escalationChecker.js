const supabaseAdmin = require('../config/supabaseClient');
const twilioClient = require('../config/twilioClient');
const { buildEscalationMessage, buildSendParams, normalizePhone } = require('./whatsappMessage');

async function runEscalationCheck() {
  const { data: overdue, error } = await supabaseAdmin
    .from('tickets')
    .select('*, staff:profiles!tickets_assigned_staff_id_fkey(phone_number)')
    .lt('deadline', new Date().toISOString())
    .not('status', 'in', '(resolved,closed)')
    .is('escalation_sent_at', null);
  if (error) throw error;

  let sent = 0;
  for (const ticket of overdue ?? []) {
    const phone = ticket.staff?.phone_number;
    if (!phone) continue;
    try {
      await twilioClient.messages.create({
        from: `whatsapp:${normalizePhone(process.env.TWILIO_WHATSAPP_NUMBER)}`,
        to: `whatsapp:${normalizePhone(phone)}`,
        ...buildSendParams(process.env.TWILIO_ESCALATION_TEMPLATE_SID, ticket, buildEscalationMessage(ticket)),
      });
      await supabaseAdmin.from('tickets').update({ escalation_sent_at: new Date().toISOString() }).eq('id', ticket.id);
      sent++;
    } catch (err) {
      console.error(`Escalation send failed for ticket ${ticket.id}:`, err.message);
    }
  }

  const checked = overdue?.length ?? 0;
  console.log(`Escalation check: ${checked} checked, ${sent} sent`);
  return { checked, sent };
}

module.exports = { runEscalationCheck };
