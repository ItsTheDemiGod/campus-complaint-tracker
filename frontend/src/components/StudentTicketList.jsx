import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ErrorBanner from './ErrorBanner'
import { PriorityBadge, AiSuggestion } from './TicketAi'

const STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened']
const PAGE_SIZE = 15
const FLASH_MS = 1600
const fmt = (d) => new Date(d).toLocaleString()
const label = (s) => s.replace('_', ' ')
const ticketCode = (id) => `KT-${id.slice(0, 6).toUpperCase()}`

function TicketCard({ ticket, userId, flash }) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Load the timeline when expanded, and reload whenever the ticket changes
  // (updated_at moves on every update, including live updates from realtime).
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

  // Resolved -> reopened / closed. The DB trigger enforces that students may only do this.
  // The ticket row then refreshes itself through the realtime subscription in the list.
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
    })
    if (histErr) setError(histErr.message)
    setBusy(false)
  }

  const short = ticket.description.length > 120 ? ticket.description.slice(0, 120) + '...' : ticket.description

  return (
    <li className={`card${flash ? ' docket-flash' : ''}`}>
      <div className="card-head">
        <span className="docket-code">{ticketCode(ticket.id)}</span>
        <span className="head-badges"><PriorityBadge priority={ticket.priority} /><span className={`badge badge-${ticket.status}`}>{label(ticket.status)}</span></span>
      </div>
      <hr className="docket-rule" />
      <div className="docket-meta">{ticket.category} · {ticket.location}</div>
      <p>{open ? ticket.description : short}</p>
      <div className="docket-meta-block">
        <div>{fmt(ticket.created_at)}</div>
        {ticket.deadline && <div>Deadline: {fmt(ticket.deadline)}</div>}
        {/* Students can't read staff profiles (RLS), so we show only that someone is assigned. */}
        {ticket.assigned_staff_id && <div>Assigned to: staff member</div>}
      </div>

      {open && (
        <div>
          {ticket.photo_url && <img className="ticket-photo" src={ticket.photo_url} alt="Attached" />}
          <AiSuggestion ticket={ticket} />
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

      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <div className="actions">
        <button className="secondary" onClick={() => setOpen(!open)}>
          {open ? 'Hide Details' : 'View Details'}
        </button>
        {ticket.status === 'resolved' && (
          <>
            <button disabled={busy} onClick={() => changeStatus('reopened')}>Reopen</button>
            <button disabled={busy} onClick={() => changeStatus('closed')}>Close</button>
          </>
        )}
      </div>
    </li>
  )
}

// refreshKey: parent bumps it after a new ticket is submitted, to refetch the list.
export default function StudentTicketList({ refreshKey }) {
  const { user } = useAuth()
  const [tickets, setTickets] = useState(null)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
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

  // visibleCountRef tracks how many rows are currently loaded, so a refreshKey bump
  // (after submitting a new ticket) re-fetches exactly what's visible instead of
  // collapsing an already-expanded "Load more" list back to the first page.
  const visibleCountRef = useRef(PAGE_SIZE)

  const load = useCallback(async () => {
    const count = visibleCountRef.current
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false })
      .range(0, count - 1)
    if (error) return setError(error.message)
    setTickets(data)
    visibleCountRef.current = data.length
    setHasMore(data.length === count)
  }, [user.id])

  useEffect(() => { load() }, [load, refreshKey])

  async function loadMore() {
    setLoadingMore(true)
    const from = tickets.length
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('student_id', user.id)
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

  // REAL-TIME: Supabase Realtime streams Postgres row changes over a WebSocket.
  // We open a channel and listen for INSERT/UPDATE events on public.tickets, filtered
  // server-side to this student's rows. The table must be in the `supabase_realtime`
  // publication (migration 002), and RLS still applies, so we only receive rows we may read.
  // When staff/admin change a ticket, the event arrives here and we swap that row into
  // state, so React re-renders the new status without a page refresh.
  // (Note: DELETE events cannot be filtered by column, so deletions are not pushed live.)
  useEffect(() => {
    const channel = supabase
      .channel(`student-tickets-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets', filter: `student_id=eq.${user.id}` },
        ({ eventType, new: row }) => {
          if (eventType === 'INSERT') flashNew(row.id)
          setTickets((prev) => {
            const list = prev ?? []
            // Update in place; a brand-new ticket goes to the top (list is newest-first).
            return list.some((t) => t.id === row.id)
              ? list.map((t) => (t.id === row.id ? row : t))
              : [row, ...list]
          })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) } // unsubscribe on unmount/logout
  }, [user.id])

  if (error) return <ErrorBanner message={error} />
  if (!tickets) return <p>Loading tickets...</p>
  if (tickets.length === 0) return <p className="muted">You haven't submitted any complaints yet.</p>

  const needle = search.trim().toLowerCase()
  const filtered = tickets.filter(
    (t) =>
      (!statusFilter || t.status === statusFilter) &&
      (!needle || t.description.toLowerCase().includes(needle) || t.location.toLowerCase().includes(needle)),
  )

  return (
    <>
      <div className="actions">
        <input
          type="search"
          placeholder="Search description or location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </div>

      {filtered.length === 0 && <p className="muted">No complaints match your search.</p>}
      <ul className="cards">
        {filtered.map((t) => (
          <TicketCard key={t.id} ticket={t} userId={user.id} flash={flashIds.has(t.id)} />
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
