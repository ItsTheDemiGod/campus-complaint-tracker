import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ErrorBanner from './ErrorBanner'

const STATUS_FILTERS = ['assigned', 'in_progress', 'resolved', 'reopened']
const PAGE_SIZE = 15
const FLASH_MS = 1600
const fmt = (d) => new Date(d).toLocaleString()
const label = (s) => s.replace('_', ' ')
const ticketCode = (id) => `KT-${id.slice(0, 6).toUpperCase()}`

// Only the FK to the student is embedded here (staff already know who they are;
// the other FK, assigned_staff_id, is always their own id).
const TICKET_SELECT = '*, student:profiles!tickets_student_id_fkey(full_name)'

function TicketCard({ ticket, userId, onChanged, flash }) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    supabase
      .from('status_history')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) return setError(error.message)
        setHistory(data ?? [])
      })
      .catch((err) => setError(err.message))
  }, [open, ticket.id, ticket.updated_at])

  // The trigger only restricts the NEW status for staff (must be in_progress/resolved);
  // this UI narrows that further to the one forward step valid from the current status.
  async function changeStatus(newStatus) {
    setError('')
    setBusy(true)
    const { error: upErr } = await supabase.from('tickets').update({ status: newStatus }).eq('id', ticket.id)
    if (upErr) {
      setBusy(false)
      return setError(upErr.message)
    }
    const { error: histErr } = await supabase.from('status_history').insert({
      ticket_id: ticket.id,
      changed_by: userId,
      old_status: ticket.status,
      new_status: newStatus,
      note: newStatus === 'resolved' ? note.trim() : null,
    })
    if (histErr) setError(histErr.message)
    setNote('')
    setBusy(false)
    onChanged?.()
  }

  const overdue = ticket.deadline && new Date(ticket.deadline) < new Date() && !['resolved', 'closed'].includes(ticket.status)

  return (
    <li className={`card${overdue ? ' overdue' : ''}${flash ? ' docket-flash' : ''}`}>
      <div className="card-head">
        <span className="docket-code">{ticketCode(ticket.id)}</span>
        <span className={`badge badge-${ticket.status}`}>{label(ticket.status)}</span>
      </div>
      <hr className="docket-rule" />
      <div className="docket-meta">{ticket.category} · {ticket.location}</div>
      <p>{ticket.description}</p>
      {ticket.photo_url && <img className="ticket-photo" src={ticket.photo_url} alt="Attached" />}
      <div className="docket-meta-block">
        <div>Filed by {ticket.student?.full_name ?? 'unknown'} · {fmt(ticket.created_at)}</div>
        {ticket.deadline && (
          <div className={overdue ? 'error' : undefined}>
            Deadline: {fmt(ticket.deadline)}{overdue && ' — OVERDUE'}
          </div>
        )}
      </div>

      {open && (
        <div>
          <h4>History</h4>
          <ul className="timeline">
            {history.map((h) => (
              <li key={h.id}>
                {fmt(h.created_at)}: {h.old_status ? `${label(h.old_status)} → ` : ''}
                {label(h.new_status)}
                {h.note && <em> ({h.note})</em>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ticket.status === 'in_progress' && (
        <label>
          Resolution note
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}

      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <div className="actions">
        <button className="secondary" onClick={() => setOpen(!open)}>
          {open ? 'Hide history' : 'View full history'}
        </button>
        {ticket.status === 'assigned' && (
          <button disabled={busy} onClick={() => changeStatus('in_progress')}>Start work</button>
        )}
        {ticket.status === 'reopened' && (
          <button disabled={busy} onClick={() => changeStatus('in_progress')}>Resume work</button>
        )}
        {ticket.status === 'in_progress' && (
          <button disabled={busy || !note.trim()} onClick={() => changeStatus('resolved')}>Mark resolved</button>
        )}
      </div>
    </li>
  )
}

export default function StaffTicketList() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState(null)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [flashIds, setFlashIds] = useState(() => new Set())
  // Tracks which ticket ids are currently in view, kept in sync with `tickets` below.
  // Read inside the (reference-stable) realtime callback to tell "a ticket just
  // became relevant to me" (not previously known — e.g. just assigned to this staff
  // member) apart from an update to a ticket already on screen.
  const knownIdsRef = useRef(new Set())

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
  // refresh after realtime events / status changes) can re-fetch exactly what's visible
  // without collapsing an already-expanded "Load more" list — and WITHOUT `load`
  // depending on `tickets` itself. Keeping `load` reference-stable matters: the realtime
  // effect below depends on it, and if it changed on every ticket update, the
  // subscription would tear down and resubscribe on every single realtime event.
  const visibleCountRef = useRef(PAGE_SIZE)

  const load = useCallback(async () => {
    const count = visibleCountRef.current
    const { data, error } = await supabase
      .from('tickets')
      .select(TICKET_SELECT)
      .eq('assigned_staff_id', user.id)
      .order('deadline', { ascending: true })
      .order('created_at', { ascending: false })
      .range(0, count - 1)
    if (error) return setError(error.message)
    setTickets(data)
    visibleCountRef.current = data.length
    setHasMore(data.length === count)
  }, [user.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (tickets) knownIdsRef.current = new Set(tickets.map((t) => t.id))
  }, [tickets])

  async function loadMore() {
    setLoadingMore(true)
    const from = tickets.length
    const { data, error } = await supabase
      .from('tickets')
      .select(TICKET_SELECT)
      .eq('assigned_staff_id', user.id)
      .order('deadline', { ascending: true })
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

  // Realtime: filtered to this staff member's assigned tickets, same pattern as Phase 3.
  // Known limit (same as Phase 3's DELETE case): if admin reassigns a ticket away from this
  // staff member, RLS then hides that row from them, but no event arrives to remove it from
  // the list live — it only disappears on the next full reload.
  useEffect(() => {
    const channel = supabase
      .channel(`staff-tickets-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets', filter: `assigned_staff_id=eq.${user.id}` },
        ({ new: row }) => {
          if (row?.id && !knownIdsRef.current.has(row.id)) flashNew(row.id)
          load()
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user.id, load])

  if (error) return <ErrorBanner message={error} />
  if (!tickets) return <p>Loading tickets...</p>
  if (tickets.length === 0) return <p className="muted">No tickets assigned to you yet.</p>

  const filtered = statusFilter ? tickets.filter((t) => t.status === statusFilter) : tickets

  return (
    <>
      <div className="actions">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </div>

      {filtered.length === 0 && <p className="muted">No tickets match this filter.</p>}
      <ul className="cards">
        {filtered.map((t) => (
          <TicketCard key={t.id} ticket={t} userId={user.id} onChanged={load} flash={flashIds.has(t.id)} />
        ))}
      </ul>
      {hasMore && (
        <button className="secondary" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </>
  )
}
