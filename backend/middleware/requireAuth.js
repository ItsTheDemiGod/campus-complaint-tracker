const supabaseAdmin = require('../config/supabaseClient');

// Like requireAdmin, but any authenticated, active user passes.
module.exports = async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single();
  if (!profile?.is_active) return res.status(403).json({ error: 'Account inactive' });

  req.user = { id: user.id, email: user.email, role: profile.role };
  next();
};
