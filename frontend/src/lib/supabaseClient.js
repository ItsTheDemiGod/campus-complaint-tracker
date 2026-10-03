import { createClient } from '@supabase/supabase-js'

// anon/public key only. Never put the service_role key in the frontend.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
