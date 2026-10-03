const shortId = (ticket) => ticket.id.slice(0, 8);
const fmtDeadline = (ticket) => new Date(ticket.deadline).toLocaleString();

// Plain-text versions. WhatsApp only accepts a plain `body` for messages sent
// INSIDE the 24-hour session window (i.e. after the recipient has messaged the
// sandbox number recently) — used as the fallback below when no approved
// Content Template SID is configured yet.
function buildAssignmentMessage(ticket) {
  return `🔧 New Maintenance Ticket #${shortId(ticket)}
Issue: ${ticket.category} — ${ticket.description}
Location: ${ticket.location}
Deadline: ${fmtDeadline(ticket)}
Please resolve by the deadline and update the ticket status in the portal.`;
}

function buildEscalationMessage(ticket) {
  return `⚠️ OVERDUE Maintenance Ticket #${shortId(ticket)}
Issue: ${ticket.category} — ${ticket.description}
Location: ${ticket.location}
Deadline was: ${fmtDeadline(ticket)}
This ticket is overdue. Please update its status in the portal as soon as possible.`;
}

// PRODUCTION PATH (not active right now — see buildSendParams below): once a
// custom WhatsApp Content Template is authored and approved for this account
// (requires a paid Twilio account; the free trial only grants Twilio's own
// fixed sample templates, which take no variables), buildSendParams would pass
// this object as `contentVariables` instead of omitting it. WhatsApp Content
// Template variables are 1-indexed, string keys, string values; order/count
// must match the {{1}}..{{5}} placeholders in the template text registered in
// the Twilio Console — see CLAUDE.md for the exact template text these line up
// with. Same five fields for both the assignment and escalation templates,
// only the template wording would differ.
function buildTemplateVariables(ticket) {
  return {
    1: shortId(ticket),
    2: ticket.category,
    3: ticket.description,
    4: ticket.location,
    5: fmtDeadline(ticket),
  };
}

// WhatsApp requires an approved Content Template (contentSid) for a business-
// initiated message — confirmed live: even a plain `body` inside the session
// window was rejected with "ContentSid Required" on this account/number, so
// there is no body-only fallback that actually works here.
//
// CURRENT STATE (free Twilio trial): the only ContentSid available is one of
// Twilio's own fixed sample templates, which takes NO variables — passing a
// contentVariables object it doesn't expect risks its own error, so this sends
// {contentSid} alone. That means the real ticket details (category, location,
// deadline) do NOT appear in the WhatsApp text right now; the message is only
// a notification trigger telling staff to open the portal, where the full
// details are visible. This is a deliberate, documented tradeoff of free-trial
// testing, not a bug — the moment a custom template is authored and approved
// (paid account), switch this back to passing buildTemplateVariables() as
// contentVariables, matching the commented-out production path above.
function buildSendParams(templateSid, ticket, plainBody) {
  if (templateSid) {
    return { contentSid: templateSid };
  }
  return { body: plainBody };
}

// Strips formatting characters only — does not guess a missing country code,
// phone_number must already be entered in full E.164 (e.g. +91XXXXXXXXXX).
// Also used to clean TWILIO_WHATSAPP_NUMBER, since that env var can contain
// spaces (Twilio's console displays it formatted, e.g. "+1 737 250 8034").
function normalizePhone(raw) {
  const digits = raw.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}

module.exports = { buildAssignmentMessage, buildEscalationMessage, buildSendParams, normalizePhone };
