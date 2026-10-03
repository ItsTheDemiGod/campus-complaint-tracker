-- =====================================================================
-- 003_staff_student_visibility.sql
-- Adds ONE new RLS policy: lets staff read the profile of a student who
-- filed a ticket currently assigned to them. Does not modify any policy
-- from 001/002. Run after 001 and 002 in the Supabase SQL Editor.
-- =====================================================================

-- Least-privilege scoping: a staff member may SELECT a profiles row only when
-- that row is the STUDENT on a ticket ASSIGNED TO THEM. The EXISTS subquery
-- ties the two conditions together on the same tickets row, so staff cannot
-- see: other staff's profiles, students who never filed a ticket assigned to
-- them, or (via this policy) anything about tickets not assigned to them.
-- This is additive to the existing "profiles: read own" policy — it does not
-- widen access to profiles in general, only to this one relationship.
create policy "profiles: staff read assigned ticket's student"
  on public.profiles for select
  to authenticated
  using (
    public.current_user_role() = 'staff'
    and exists (
      select 1 from public.tickets t
      where t.student_id = profiles.id
        and t.assigned_staff_id = auth.uid()
    )
  );
