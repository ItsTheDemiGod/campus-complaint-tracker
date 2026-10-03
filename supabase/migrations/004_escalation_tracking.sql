-- =====================================================================
-- 004_escalation_tracking.sql
-- Adds one nullable column to tickets so the escalation cron job can tell
-- whether an overdue reminder was already sent, and skip it next run.
-- Run after 001-003 in the Supabase SQL Editor.
-- =====================================================================

alter table public.tickets add column escalation_sent_at timestamptz;
