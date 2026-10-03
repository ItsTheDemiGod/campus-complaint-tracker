import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import ErrorBanner from './ErrorBanner'

const CATEGORIES = ['hostel', 'lab', 'wifi', 'electrical', 'plumbing', 'other']
const STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened']

// Same colors as the status badges elsewhere in the app (index.css .badge-*),
// reused here for visual consistency rather than a separate chart palette.
const STATUS_COLORS = {
  open: '#5B6473', assigned: '#C49A2E', in_progress: '#3D5A80',
  resolved: '#2E6A4E', closed: '#152238', reopened: '#9B2335',
}
const NAVY_BAR = '#152238' // category + staff workload: single-series bars, no legend needed
const STEEL_BAR = '#3D5A80' // resolution-time breakdown

const RANGE_DAYS = { 7: 7, 30: 30, all: null }

function filterByRange(tickets, range) {
  const days = RANGE_DAYS[range]
  if (!days) return tickets
  const cutoff = Date.now() - days * 86400000
  return tickets.filter((t) => new Date(t.created_at).getTime() >= cutoff)
}

function formatDuration(ms) {
  const mins = Math.round(ms / 60000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const minutes = mins % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default function AnalyticsDashboard() {
  const [tickets, setTickets] = useState(null)
  const [resolvedHistory, setResolvedHistory] = useState([])
  const [staff, setStaff] = useState([])
  const [range, setRange] = useState('all')
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [ticketsRes, historyRes, staffRes] = await Promise.all([
          supabase.from('tickets').select('id,category,status,created_at,deadline,assigned_staff_id'),
          // Ascending order matters: firstResolvedAt below keeps the FIRST match per ticket.
          supabase.from('status_history').select('ticket_id,created_at').eq('new_status', 'resolved').order('created_at', { ascending: true }),
          supabase.from('profiles').select('id,full_name').eq('role', 'staff').eq('is_active', true),
        ])
        if (ticketsRes.error) return setError(ticketsRes.error.message)
        setTickets(ticketsRes.data)
        setResolvedHistory(historyRes.data ?? [])
        setStaff(staffRes.data ?? [])
      } catch (err) {
        setError(err.message)
      }
    }
    load()
  }, [])

  const filtered = useMemo(() => (tickets ? filterByRange(tickets, range) : []), [tickets, range])

  // First time each ticket's status_history ever recorded new_status='resolved'. A ticket
  // that was resolved, reopened, and resolved again only counts its FIRST resolution —
  // resolvedHistory is fetched oldest-first, so the first match per ticket_id wins.
  const firstResolvedAt = useMemo(() => {
    const map = {}
    for (const h of resolvedHistory) {
      if (!(h.ticket_id in map)) map[h.ticket_id] = h.created_at
    }
    return map
  }, [resolvedHistory])

  // Resolution time = first-resolved status_history row's created_at minus the ticket's
  // own created_at. Only tickets within the current date-range filter are included.
  const resolutionDurations = useMemo(
    () =>
      filtered
        .filter((t) => firstResolvedAt[t.id])
        .map((t) => ({ category: t.category, ms: new Date(firstResolvedAt[t.id]) - new Date(t.created_at) })),
    [filtered, firstResolvedAt],
  )

  const avgResolutionMs = resolutionDurations.length
    ? resolutionDurations.reduce((sum, d) => sum + d.ms, 0) / resolutionDurations.length
    : null

  const resolutionByCategory = useMemo(() => {
    const groups = {}
    for (const d of resolutionDurations) (groups[d.category] ??= []).push(d.ms)
    return Object.entries(groups).map(([category, msList]) => ({
      category,
      avgHours: Math.round((msList.reduce((a, b) => a + b, 0) / msList.length / 3600000) * 10) / 10,
    }))
  }, [resolutionDurations])

  const categoryCounts = useMemo(
    () => CATEGORIES.map((c) => ({ category: c, count: filtered.filter((t) => t.category === c).length })).filter((c) => c.count > 0),
    [filtered],
  )

  const statusCounts = useMemo(
    () => STATUSES.map((s) => ({ status: s, count: filtered.filter((t) => t.status === s).length })).filter((s) => s.count > 0),
    [filtered],
  )

  // Active staff only (is_active filter is in the fetch above) — excludes deactivated staff
  // even if they still have tickets assigned to them.
  // Includes staff with zero currently-assigned tickets too — seeing who has spare
  // capacity is as useful as seeing who's overloaded.
  const staffWorkload = useMemo(
    () =>
      staff.map((s) => ({
        name: s.full_name,
        count: filtered.filter((t) => t.assigned_staff_id === s.id && !['resolved', 'closed'].includes(t.status)).length,
      })),
    [staff, filtered],
  )

  const summary = useMemo(() => {
    const now = Date.now()
    return {
      total: filtered.length,
      open: filtered.filter((t) => t.status === 'open').length,
      inProgress: filtered.filter((t) => t.status === 'in_progress').length,
      resolvedClosed: filtered.filter((t) => ['resolved', 'closed'].includes(t.status)).length,
      overdue: filtered.filter((t) => t.deadline && new Date(t.deadline).getTime() < now && !['resolved', 'closed'].includes(t.status)).length,
    }
  }, [filtered])

  if (error) return <ErrorBanner message={error} />
  if (!tickets) return <p>Loading analytics...</p>

  return (
    <section>
      <div className="section-head">
        <h2>Analytics</h2>
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      <div className="stat-grid">
        <div className="stat-tile"><div className="stat-value">{summary.total}</div><div className="muted">Total tickets</div></div>
        <div className="stat-tile"><div className="stat-value">{summary.open}</div><div className="muted">Open</div></div>
        <div className="stat-tile"><div className="stat-value">{summary.inProgress}</div><div className="muted">In progress</div></div>
        <div className="stat-tile"><div className="stat-value">{summary.resolvedClosed}</div><div className="muted">Resolved + closed</div></div>
        <div className="stat-tile"><div className="stat-value">{summary.overdue}</div><div className="muted">Overdue</div></div>
      </div>

      <h3>Tickets by category</h3>
      {categoryCounts.length === 0 ? <p className="muted">Not enough data yet.</p> : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={categoryCounts}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="category" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill={NAVY_BAR} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      <h3>Tickets by status</h3>
      {statusCounts.length === 0 ? <p className="muted">Not enough data yet.</p> : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={statusCounts}
              dataKey="count"
              nameKey="status"
              innerRadius={60}
              outerRadius={90}
              label={({ status, count }) => `${status.replace('_', ' ')}: ${count}`}
            >
              {statusCounts.map((s) => <Cell key={s.status} fill={STATUS_COLORS[s.status]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}

      <h3>Average resolution time</h3>
      {avgResolutionMs === null ? (
        <p className="muted">Not enough data yet.</p>
      ) : (
        <>
          <div className="stat-tile">
            <div className="stat-value">{formatDuration(avgResolutionMs)}</div>
            <div className="muted">Across {resolutionDurations.length} resolved ticket(s)</div>
          </div>
          {resolutionByCategory.length > 0 && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={resolutionByCategory}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="category" />
                <YAxis label={{ value: 'hours', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Bar dataKey="avgHours" fill={STEEL_BAR} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </>
      )}

      <h3>Staff workload (active staff, currently assigned)</h3>
      {staffWorkload.length === 0 ? <p className="muted">Not enough data yet.</p> : (
        <ResponsiveContainer width="100%" height={Math.max(120, staffWorkload.length * 48)}>
          <BarChart data={staffWorkload} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} />
            <YAxis dataKey="name" type="category" width={120} />
            <Tooltip />
            <Bar dataKey="count" fill={NAVY_BAR} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  )
}
