const supabaseAdmin = require('../config/supabaseClient');

// Verifies the bearer token with Supabase Auth, then checks the caller's profile
// role via the service_role client (bypasses RLS, so this works regardless of policy).
module.exports = async function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile?.is_active || profile.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  req.user = { id: user.id, email: user.email };
  next();
};
