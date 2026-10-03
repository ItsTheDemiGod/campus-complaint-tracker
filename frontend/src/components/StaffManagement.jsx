import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import ErrorBanner from './ErrorBanner'

const STAFF_CATEGORIES = ['electrician', 'plumber', 'network_technician', 'carpenter', 'general_maintenance']
const emptyForm = { full_name: '', email: '', phone_number: '', staff_category: '' }

function StaffRow({ staff, onChanged }) {
  const [category, setCategory] = useState(staff.staff_category ?? '')
  const [phone, setPhone] = useState(staff.phone_number ?? '')
  const [error, setError] = useState('')

  async function save(fields) {
    setError('')
    const { error } = await supabase.from('profiles').update(fields).eq('id', staff.id)
    if (error) return setError(error.message)
    onChanged()
  }

  return (
    <>
      <tr>
        <td>{staff.full_name}</td>
        <td>{staff.email}</td>
        <td>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => save({ phone_number: phone })} />
        </td>
        <td>
          <select value={category} onChange={(e) => { setCategory(e.target.value); save({ staff_category: e.target.value }) }}>
            {STAFF_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </td>
        <td>{staff.is_active ? 'Active' : 'Deactivated'}</td>
        <td>
          <button className="secondary" onClick={() => save({ is_active: !staff.is_active })}>
            {staff.is_active ? 'Deactivate' : 'Reactivate'}
          </button>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={6}><ErrorBanner message={error} onDismiss={() => setError('')} /></td>
        </tr>
      )}
    </>
  )
}

export default function StaffManagement() {
  const [staff, setStaff] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').eq('role', 'staff').order('full_name')
    if (error) {
      setError(error.message)
      return setStaff([]) // resolve the "Loading staff..." state instead of hanging on it forever
    }
    setStaff(data)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(form),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to create staff account')
      setResult(body)
      setForm(emptyForm)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Staff</h2>

      <form onSubmit={handleSubmit}>
        <label>
          Full name
          <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </label>
        <label>
          Phone number
          <input value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} required />
        </label>
        <label>
          Category
          <select value={form.staff_category} onChange={(e) => setForm({ ...form, staff_category: e.target.value })} required>
            <option value="">Select...</option>
            {STAFF_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <ErrorBanner message={error} onDismiss={() => setError('')} />
        {result && (
          <p className="success">
            Staff account created for {result.email}. Temporary password: <strong>{result.temp_password}</strong>
          </p>
        )}
        <button disabled={busy}>{busy ? 'Creating...' : 'Add staff'}</button>
      </form>

      {staff === null && <p>Loading staff...</p>}
      {staff?.length === 0 && <p className="muted">No staff accounts yet.</p>}
      {staff?.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Phone</th><th>Category</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {staff.map((s) => <StaffRow key={s.id} staff={s} onChanged={load} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
