import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ErrorBanner from './ErrorBanner'
import { PriorityBadge, AiSuggestion } from './TicketAi'

const CATEGORIES = ['hostel', 'lab', 'wifi', 'electrical', 'plumbing', 'other']
const STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened']
const PAGE_SIZE = 15
const FLASH_MS = 1600
const fmt = (d) => new Date(d).toLocaleString()
const ticketCode = (id) => `KT-${id.slice(0, 6).toUpperCase()}`

// Joins the student's and assigned staff's profile via each FK separately (tickets has
// two FKs into profiles, so Postgres's default constraint names disambiguate them).
const TICKET_SELECT = '*, student:profiles!tickets_student_id_fkey(full_name), staff:profiles!tickets_assigned_staff_id_fkey(full_name)'

async function notifyApi(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`/api/notify/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json
}

function AssignForm({ ticket, activeStaff, adminId, onAssigned }) {
  const relevant = activeStaff.filter((s) => s.staff_category === ticket.category)
  const [staffId, setStaffId] = useState('')
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleAssign() {
    if (!staffId || !deadline) return setError('Pick a staff member and deadline.')
    setError('')
    setBusy(true)
    const { error: upErr } = await supabase
      .from('tickets')
      .update({ assigned_staff_id: staffId, deadline: new Date(deadline).toISOString(), status: 'assigned' })
      .eq('id', ticket.id)
    if (upErr) {
      setBusy(false)
      return setError(upErr.message)
    }
    const staffName = activeStaff.find((s) => s.id === staffId)?.full_name
    const { error: histErr } = await supabase.from('status_history').insert({
      ticket_id: ticket.id,
      changed_by: adminId,
      old_status: ticket.status,
      new_status: 'assigned',
      note: `Assigned to ${staffName}`,
    })
    setBusy(false)
    if (histErr) return setError(histErr.message)
    onAssigned?.(ticket.id)
  }

  return (
    <div className="actions">
      <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
        <option value="">Assign to...</option>
        {(relevant.length ? relevant : activeStaff).map((s) => (
          <option key={s.id} value={s.id}>{s.full_name} ({s.staff_category})</option>
        ))}
      </select>
      <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      <button disabled={busy} onClick={handleAssign}>{busy ? 'Assigning...' : 'Assign'}</button>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
    </div>
  )
}

export default function AdminTicketOverview() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState(null)
  const [activeStaff, setActiveStaff] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [notifyMsgs, setNotifyMsgs] = useState({}) // ticketId -> { ok, text } for the most recent send attempt this session
  const [escalationResult, setEscalationResult] = useState('')
  const [escalationBusy, setEscalationBusy] = useState(false)
  const [flashIds, setFlashIds] = useState(() => new Set())

  function flashNew(id) {
    setFlashIds((prev) => new Set(prev).add(id))
    setTimeout(() => {
      setFlashIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, FLASH_MS)
  }

  // visibleCountRef tracks how many rows are currently loaded, so `load()` (used as a
  // refresh after realtime events / assign / resend / escalation) can re-fetch exactly
  // what's visible without collapsing an already-expanded "Load more" list back to the
  // first page — and WITHOUT `load` depending on `tickets` itself. Keeping `load`
  // reference-stable (empty deps) matters: the realtime effect below depends on it, and
  // if it changed on every ticket update, the subscription would tear down and
  // resubscribe on every single realtime event.
  const visibleCountRef = useRef(PAGE_SIZE)

  const load = useCallback(async () => {
    const count = visibleCountRef.current
    const { data, error } = await supabase
      .from('tickets')
      .select(TICKET_SELECT)
      .order('created_at', { ascending: false })
      .range(0, count - 1)
    if (error) return setError(error.message)
    setTickets(data)
    visibleCountRef.current = data.length
    setHasMore(data.length === count)
  }, [])

  const loadStaff = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').eq('role', 'staff').eq('is_active', true)
    if (error) return setError(error.message)
    setActiveStaff(data ?? [])
  }, [])

  useEffect(() => { load(); loadStaff() }, [load, loadStaff])

  async function loadMore() {
    setLoadingMore(true)
    const from = tickets.length
    const { data, error } = await supabase
      .from('tickets')
      .select(TICKET_SELECT)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    setLoadingMore(false)
    if (error) return setError(error.message)
    setTickets((prev) => {
      const existing = new Set(prev.map((t) => t.id))
      const merged = [...prev, ...data.filter((t) => !existing.has(t.id))]
      visibleCountRef.current = merged.length
      return merged
    })
    setHasMore(data.length === PAGE_SIZE)
  }

  // Realtime: admins see every ticket, so no row filter (RLS still applies, but admin reads all).
  useEffect(() => {
    const channel = supabase
      .channel('admin-tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, ({ eventType, new: row }) => {
        if (eventType === 'INSERT') flashNew(row.id)
        load()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  // Runs right after a successful assignment, and also from the per-ticket "Resend" button.
  async function sendWhatsApp(ticketId, path) {
    try {
      await notifyApi(path)
      setNotifyMsgs((m) => ({ ...m, [ticketId]: { ok: true, text: 'WhatsApp sent' } }))
    } catch (err) {
      setNotifyMsgs((m) => ({ ...m, [ticketId]: { ok: false, text: `WhatsApp failed: ${err.message}` } }))
    }
    load() // picks up the whatsapp_status/whatsapp_sent_at the backend just wrote
  }

  async function handleAssigned(ticketId) {
    load()
    sendWhatsApp(ticketId, 'ticket-assigned')
  }

  async function handleEscalationCheck() {
    setEscalationBusy(true)
    try {
      const { checked, sent } = await notifyApi('run-escalation-check')
      setEscalationResult(`Checked ${checked} overdue ticket(s), sent ${sent} reminder(s).`)
    } catch (err) {
      setEscalationResult(`Escalation check failed: ${err.message}`)
    }
    setEscalationBusy(false)
    load()
  }

  if (error) return <ErrorBanner message={error} />
  if (!tickets) return <p>Loading tickets...</p>

  const needle = search.trim().toLowerCase()
  const filtered = tickets.filter(
    (t) =>
      (!statusFilter || t.status === statusFilter) &&
      (!categoryFilter || t.category === categoryFilter) &&
      (!needle ||
        t.description.toLowerCase().includes(needle) ||
        t.location.toLowerCase().includes(needle) ||
        (t.student?.full_name ?? '').toLowerCase().includes(needle)),
  )

  return (
    <section>
      <h2>All tickets</h2>
      <div className="actions">
        <input
          type="search"
          placeholder="Search description, location, or student..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="secondary" disabled={escalationBusy} onClick={handleEscalationCheck}>
          {escalationBusy ? 'Checking...' : 'Run escalation check now'}
        </button>
      </div>
      {escalationResult && <p className="muted">{escalationResult}</p>}

      {filtered.length === 0 && <p className="muted">No tickets match.</p>}
      <ul className="cards">
        {filtered.map((t) => {
          const notify = notifyMsgs[t.id]
          const whatsappOk = notify ? notify.ok : t.whatsapp_status === 'sent'
          return (
            <li className={`card${flashIds.has(t.id) ? ' docket-flash' : ''}`} key={t.id}>
              <div className="card-head">
                <span className="docket-code">{ticketCode(t.id)}</span>
                <span className="head-badges"><PriorityBadge priority={t.priority} /><span className={`badge badge-${t.status}`}>{t.status.replace('_', ' ')}</span></span>
              </div>
              <hr className="docket-rule" />
              <div className="docket-meta">{t.category} · {t.location}</div>
              <p>{t.description}</p>
              <AiSuggestion ticket={t} />
              <div className="docket-meta-block">
                <div>Filed by {t.student?.full_name ?? 'unknown'} · {fmt(t.created_at)}</div>
                {t.deadline && <div>Deadline: {fmt(t.deadline)}</div>}
                {t.staff?.full_name && <div>Assigned to: {t.staff.full_name}</div>}
              </div>
              {(notify || t.whatsapp_status) && (
                <div className={whatsappOk ? 'success' : 'error'}>
                  {notify ? notify.text : `WhatsApp: ${t.whatsapp_status === 'sent' ? 'sent ✓' : 'failed ✗'}`}
                  {!notify && t.whatsapp_status === 'sent' && t.whatsapp_sent_at && ` (${fmt(t.whatsapp_sent_at)})`}
                </div>
              )}
              {t.status === 'open' && <AssignForm ticket={t} activeStaff={activeStaff} adminId={user.id} onAssigned={handleAssigned} />}
              {t.assigned_staff_id && (
                <div className="actions">
                  <button className="secondary" onClick={() => sendWhatsApp(t.id, `resend/${t.id}`)}>Resend WhatsApp</button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {hasMore && (
        <button className="secondary" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </section>
  )
}
