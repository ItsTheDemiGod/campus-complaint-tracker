-- =====================================================================
-- 001_initial_schema.sql
-- Campus Complaint & Maintenance Tracker: tables, triggers, RLS policies.
-- Run once in Supabase Dashboard -> SQL Editor (see README.md).
-- =====================================================================


-- =====================================================================
-- 1. TABLES
-- =====================================================================

-- profiles: one row per auth.users row; holds the app-level role and staff details.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text not null,
  email        text not null,
  role         text not null check (role in ('student', 'staff', 'admin')),
  phone_number text,  -- only used when role = 'staff' (WhatsApp target)
  staff_category text check (staff_category in
    ('electrician', 'plumber', 'network_technician', 'carpenter', 'general_maintenance')),
  is_active    boolean not null default true,  -- admin can deactivate a user
  created_at   timestamptz not null default now()
);

-- tickets: one row per complaint.
create table public.tickets (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.profiles (id),
  category          text not null,   -- e.g. hostel, lab, wifi, electrical, plumbing, other
  description       text not null,
  location          text not null,   -- room / hostel block / lab name
  photo_url         text,            -- optional photo in Supabase Storage
  status            text not null default 'open'
                      check (status in ('open', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened')),
  assigned_staff_id uuid references public.profiles (id),
  deadline          timestamptz,
  whatsapp_sent_at  timestamptz,
  whatsapp_status   text check (whatsapp_status in ('sent', 'failed', 'delivered')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- status_history: append-only audit trail of status changes.
-- on delete cascade so an admin can delete a ticket together with its history.
create table public.status_history (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets (id) on delete cascade,
  changed_by  uuid not null references public.profiles (id),
  old_status  text,
  new_status  text not null,
  note        text,  -- why the status changed; staff put resolution notes here
  created_at  timestamptz not null default now()
);

-- Indexes on the columns the RLS policies and dashboards filter by.
create index tickets_student_id_idx        on public.tickets (student_id);
create index tickets_assigned_staff_id_idx on public.tickets (assigned_staff_id);
create index status_history_ticket_id_idx  on public.status_history (ticket_id);


-- =====================================================================
-- 2. HELPER FUNCTION + TRIGGERS
-- =====================================================================

-- Returns the caller's role ('student' | 'staff' | 'admin'), or NULL if they
-- have no profile or are deactivated (is_active = false), which removes all access.
-- SECURITY DEFINER: reads profiles bypassing RLS. Without this, a policy on
-- profiles that looks up the role in profiles would recurse infinitely.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

-- Keep tickets.updated_at fresh on every update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tickets_set_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

-- Auto-create a profile when someone signs up via Supabase Auth.
-- SECURITY NOTE: the role is read from raw_APP_meta_data, NOT raw_user_meta_data.
-- user_meta_data is whatever the browser sends in supabase.auth.signUp({options:{data}}),
-- so trusting it would let anyone sign up as 'admin'. app_meta_data can only be set
-- server-side (service role / dashboard), so staff/admin accounts are created by an
-- admin (later phase) with app_metadata {"role": "staff"}. Everyone else is a student.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_app_meta_data ->> 'role', 'student')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS decides WHICH ROWS a user may update, but cannot restrict WHICH COLUMNS.
-- This trigger does that for tickets:
--   * admin, or no logged-in user (service role / SQL editor): anything goes
--   * staff / student: only `status` may change, and only to allowed values
--       staff   -> 'in_progress' or 'resolved'
--       student -> 'reopened' or 'closed', and only from 'resolved'
-- So staff cannot reassign, change the deadline, or edit the description, and
-- students cannot touch anything except reopening/closing a resolved ticket.
create or replace function public.enforce_ticket_update_rules()
returns trigger
language plpgsql
as $$
declare
  r text := public.current_user_role();
begin
  if auth.uid() is null or r = 'admin' then
    return new;
  end if;

  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Only the ticket status may be changed';
  end if;

  if new.status = old.status then
    return new;
  end if;
  if r = 'staff' and new.status in ('in_progress', 'resolved') then
    return new;
  end if;
  if r = 'student' and old.status = 'resolved' and new.status in ('reopened', 'closed') then
    return new;
  end if;

  raise exception 'Status change % -> % is not allowed for role %', old.status, new.status, coalesce(r, 'none');
end;
$$;

create trigger tickets_enforce_update_rules
  before update on public.tickets
  for each row execute function public.enforce_ticket_update_rules();


-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- With RLS enabled and no matching policy, access is DENIED. So anything not
-- explicitly allowed below (e.g. deleting tickets as staff, editing history)
-- is blocked by default. The service_role key (Express backend) bypasses RLS.
-- =====================================================================

alter table public.profiles       enable row level security;
alter table public.tickets        enable row level security;
alter table public.status_history enable row level security;


-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------

-- Every logged-in user (student, staff, admin) can read their own profile.
-- The app needs it to know who is logged in and which role to show.
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- Admins can read every profile (to list staff for assignment, manage accounts).
create policy "profiles: admin read all"
  on public.profiles for select
  to authenticated
  using (public.current_user_role() = 'admin');

-- Admins can update any profile (change phone number, staff_category, deactivate).
-- No other role can update profiles, so nobody can promote themselves to admin.
create policy "profiles: admin update all"
  on public.profiles for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Only admins may insert profile rows directly. Students never need this:
-- the handle_new_user trigger (SECURITY DEFINER, bypasses RLS) creates theirs.
create policy "profiles: admin insert"
  on public.profiles for insert
  to authenticated
  with check (public.current_user_role() = 'admin');


-- ---------------------------------------------------------------------
-- tickets
-- ---------------------------------------------------------------------

-- A student may file a ticket only as themselves, and only as a fresh unassigned
-- 'open' ticket (so they cannot self-assign, set a deadline, or fake a status).
create policy "tickets: student insert own"
  on public.tickets for insert
  to authenticated
  with check (
    public.current_user_role() = 'student'
    and student_id = auth.uid()
    and status = 'open'
    and assigned_staff_id is null
    and deadline is null
  );

-- Students see only the tickets they filed.
create policy "tickets: student read own"
  on public.tickets for select
  to authenticated
  using (public.current_user_role() = 'student' and student_id = auth.uid());

-- Students may update only their own RESOLVED tickets (to reopen or close them).
-- The enforce_ticket_update_rules trigger limits this to a status change.
create policy "tickets: student reopen/close own resolved"
  on public.tickets for update
  to authenticated
  using (public.current_user_role() = 'student' and student_id = auth.uid() and status = 'resolved')
  with check (student_id = auth.uid());

-- Staff see only tickets assigned to them.
create policy "tickets: staff read assigned"
  on public.tickets for select
  to authenticated
  using (public.current_user_role() = 'staff' and assigned_staff_id = auth.uid());

-- Staff may update only tickets assigned to them. The trigger restricts the change
-- to `status` (in_progress / resolved), so they cannot reassign or edit other fields.
-- There is no staff DELETE policy, so staff cannot delete tickets.
create policy "tickets: staff update assigned"
  on public.tickets for update
  to authenticated
  using (public.current_user_role() = 'staff' and assigned_staff_id = auth.uid())
  with check (assigned_staff_id = auth.uid());

-- Admins have full control: read, insert, update (assign, set deadline/category), delete.
create policy "tickets: admin all"
  on public.tickets for all
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');


-- ---------------------------------------------------------------------
-- status_history
-- There are no UPDATE or DELETE policies, so history is append-only.
-- ---------------------------------------------------------------------

-- Students read history only for tickets they filed.
create policy "status_history: student read own tickets"
  on public.status_history for select
  to authenticated
  using (
    public.current_user_role() = 'student'
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id and t.student_id = auth.uid()
    )
  );

-- Staff read history only for tickets assigned to them.
create policy "status_history: staff read assigned tickets"
  on public.status_history for select
  to authenticated
  using (
    public.current_user_role() = 'staff'
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id and t.assigned_staff_id = auth.uid()
    )
  );

-- Admins read all history.
create policy "status_history: admin read all"
  on public.status_history for select
  to authenticated
  using (public.current_user_role() = 'admin');

-- A user may log a status change only as themselves (changed_by = auth.uid()),
-- only on a ticket they are allowed to touch, and only with a status their role
-- may set: student -> open (initial row) / reopened / closed, staff -> in_progress / resolved.
create policy "status_history: student insert own tickets"
  on public.status_history for insert
  to authenticated
  with check (
    public.current_user_role() = 'student'
    and changed_by = auth.uid()
    and new_status in ('open', 'reopened', 'closed')
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id and t.student_id = auth.uid()
    )
  );

create policy "status_history: staff insert assigned tickets"
  on public.status_history for insert
  to authenticated
  with check (
    public.current_user_role() = 'staff'
    and changed_by = auth.uid()
    and new_status in ('in_progress', 'resolved')
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id and t.assigned_staff_id = auth.uid()
    )
  );

-- Admins can log any status change on any ticket (still recorded under their own id).
create policy "status_history: admin insert"
  on public.status_history for insert
  to authenticated
  with check (public.current_user_role() = 'admin' and changed_by = auth.uid());
