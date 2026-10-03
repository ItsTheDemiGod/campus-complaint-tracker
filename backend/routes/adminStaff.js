const router = require('express').Router();
const crypto = require('crypto');
const supabaseAdmin = require('../config/supabaseClient');
const requireAdmin = require('../middleware/requireAdmin');

const STAFF_CATEGORIES = ['electrician', 'plumber', 'network_technician', 'carpenter', 'general_maintenance'];

// POST /api/admin/staff: create a staff auth user + profile.
// Uses a generated temp password (not inviteUserByEmail) so account creation works
// immediately without depending on project email delivery being set up; the admin
// shares the password with the staff member out of band.
router.post('/', requireAdmin, async (req, res) => {
  const { full_name, email, phone_number, staff_category } = req.body;
  if (!full_name || !email || !phone_number || !staff_category) {
    return res.status(400).json({ error: 'full_name, email, phone_number and staff_category are required' });
  }
  if (!STAFF_CATEGORIES.includes(staff_category)) {
    return res.status(400).json({ error: `staff_category must be one of: ${STAFF_CATEGORIES.join(', ')}` });
  }

  const temp_password = crypto.randomBytes(9).toString('base64url'); // 12 chars

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: temp_password,
    email_confirm: true,
    app_metadata: { role: 'staff' },
    user_metadata: { full_name },
  });
  if (error) {
    const status = /already been registered|already exists/i.test(error.message) ? 409 : 400;
    return res.status(status).json({ error: error.message });
  }

  // handle_new_user already created the profiles row, but Supabase's admin API merges
  // app_metadata into auth.users AFTER the row insert that fires the trigger, so the
  // trigger always sees role missing and defaults to 'student'. Set it explicitly here
  // along with the fields the trigger never knew about.
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ role: 'staff', phone_number, staff_category })
    .eq('id', data.user.id);
  if (profileError) return res.status(500).json({ error: `Staff account created but profile update failed: ${profileError.message}` });

  res.status(201).json({ id: data.user.id, email, temp_password });
});

module.exports = router;
