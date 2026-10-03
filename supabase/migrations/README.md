# Supabase migrations

## What `001_initial_schema.sql` does
- Creates `profiles`, `tickets` and `status_history`, with their constraints and indexes.
- Adds triggers: `updated_at` on tickets, auto-create a profile on signup, and column/status rules for ticket updates.
- Enables Row Level Security on all three tables and creates the role-based policies (student / staff / admin).

## Run it
1. Supabase Dashboard -> your project -> **SQL Editor** -> **New query**.
2. Open `supabase/migrations/001_initial_schema.sql`, copy everything, paste it in.
3. Click **Run**. You should see "Success. No rows returned".

Run it **once** on an empty project. Running it twice fails with "already exists" (harmless, but nothing is re-applied).

## Order
Migrations are numbered (`001_`, `002_`, ...). Run them in order, each once, and never edit one that has already been run. Put changes in a new file instead.
