-- Phase 9.6: AI triage columns on tickets.
--
-- RLS/trigger check (read from 001, not assumed):
--   * "tickets: student insert own" WITH CHECK constrains only role, student_id, status,
--     assigned_staff_id and deadline. It does not restrict other columns, so students can
--     set priority and ai_* at insert time. No policy change needed.
--   * enforce_ticket_update_rules is a BEFORE UPDATE trigger only; inserts never hit it.
--     Post-insert, it already blocks students/staff from editing any column except status
--     (so priority and ai_* are immutable for them after filing). Admin is unrestricted.
-- Hence no RLS or trigger changes in this migration.

alter table public.tickets
  add column priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  add column ai_suggested_category text,
  add column ai_suggested_priority text,
  add column ai_confidence numeric(4,3) check (ai_confidence between 0 and 1),
  add column ai_suggestion_reasoning text,
  add column ai_category_accepted boolean,   -- null = no suggestion was ever fetched
  add column ai_priority_accepted boolean;
