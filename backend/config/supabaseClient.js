const { createClient } = require('@supabase/supabase-js');

// service_role key bypasses RLS: backend-only, never expose to the frontend.
// Requires dotenv to be loaded first (server.js does this). Throws if env vars are missing.
module.exports = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
