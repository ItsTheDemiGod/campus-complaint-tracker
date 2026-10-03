import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ErrorBanner from './ErrorBanner'

const CATEGORIES = ['hostel', 'lab', 'wifi', 'electrical', 'plumbing', 'other']
const PRIORITIES = ['low', 'medium', 'high', 'critical']
const MIN_CONFIDENCE = 0.6 // below this the AI guess is shown but never auto-filled
const MIN_DESC_FOR_AI = 15
const MAX_PHOTO_BYTES = 5 * 1024 * 1024 // matches the bucket's 5 MB limit

export default function NewTicketForm({ onCreated }) {
  const { user } = useAuth()
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('medium')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [photo, setPhoto] = useState(null)
  const [fileKey, setFileKey] = useState(0) // changing the key clears the file input
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [suggestion, setSuggestion] = useState(null) // last successful AI response
  const [aiState, setAiState] = useState('idle') // idle | loading | failed

  async function suggest() {
    setAiState('loading')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/ai/suggest-triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ description, location }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const s = await res.json()
      setSuggestion(s)
      setAiState('idle')
      if (s.confidence >= MIN_CONFIDENCE) {
        setCategory(s.category)
        setPriority(s.priority)
      }
    } catch {
      setAiState('failed') // never blocks the form
    }
  }

  function onPhotoChange(e) {
    const file = e.target.files[0] ?? null
    setError('')
    if (file && !file.type.startsWith('image/')) {
      setPhoto(null)
      setFileKey((k) => k + 1)
      return setError('Please choose an image file.')
    }
    if (file && file.size > MAX_PHOTO_BYTES) {
      setPhoto(null)
      setFileKey((k) => k + 1)
      return setError('Photo must be 5 MB or smaller.')
    }
    setPhoto(file)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!category) return setError('Please select a category.')
    if (!description.trim()) return setError('Please describe the problem.')
    if (!location.trim()) return setError('Please enter the location.')

    setBusy(true)
    try {
      let photo_url = null
      if (photo) {
        // Folder = user id: the storage policy only allows uploads into your own folder.
        const safeName = photo.name.replace(/[^\w.-]/g, '_')
        const path = `${user.id}/${Date.now()}-${safeName}`
        const { error: upErr } = await supabase.storage.from('ticket-photos').upload(path, photo)
        if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`)
        photo_url = supabase.storage.from('ticket-photos').getPublicUrl(path).data.publicUrl
      }

      // status is not sent: the column defaults to 'open' (RLS requires it anyway).
      const { data: ticket, error: insErr } = await supabase
        .from('tickets')
        .insert({
          student_id: user.id,
          category,
          description: description.trim(),
          location: location.trim(),
          photo_url,
          priority,
          // ai_* stay null unless a suggestion was fetched. Accepted = final choice equals suggestion.
          ...(suggestion && {
            ai_suggested_category: suggestion.category,
            ai_suggested_priority: suggestion.priority,
            ai_confidence: suggestion.confidence,
            ai_suggestion_reasoning: suggestion.reasoning,
            ai_category_accepted: category === suggestion.category,
            ai_priority_accepted: priority === suggestion.priority,
          }),
        })
        .select('id')
        .single()
      if (insErr) throw new Error(`Could not submit complaint: ${insErr.message}`)

      // First entry of the audit trail.
      const { error: histErr } = await supabase.from('status_history').insert({
        ticket_id: ticket.id,
        changed_by: user.id,
        old_status: null,
        new_status: 'open',
      })
      if (histErr) console.warn('status_history insert failed:', histErr.message)

      setSuccess('Complaint submitted.')
      setCategory('')
      setPriority('medium')
      setSuggestion(null)
      setAiState('idle')
      setDescription('')
      setLocation('')
      setPhoto(null)
      setFileKey((k) => k + 1)
      onCreated?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Category
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Select...</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Priority
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </label>
      <label>
        Location
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Block C Room 204, CS Lab 2"
        />
      </label>
      <label>
        Description
        <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <button
        type="button"
        className="secondary"
        disabled={aiState === 'loading' || description.trim().length < MIN_DESC_FOR_AI}
        onClick={suggest}
      >
        {aiState === 'loading' ? 'Thinking...' : 'Suggest category & priority'}
      </button>
      {aiState === 'failed' && (
        <p className="ai-note">AI suggestion unavailable right now — please select manually</p>
      )}
      {aiState !== 'failed' && suggestion && (
        <p className="ai-note">
          {suggestion.confidence >= MIN_CONFIDENCE
            ? `AI suggests: ${suggestion.category}, ${suggestion.priority} priority (${Math.round(suggestion.confidence * 100)}% confident) — ${suggestion.reasoning}`
            : `AI guessed ${suggestion.category}, ${suggestion.priority} priority but wasn't confident enough (${Math.round(suggestion.confidence * 100)}%) — please choose manually.`}
        </p>
      )}
      <label>
        Photo (optional)
        <input key={fileKey} type="file" accept="image/*" onChange={onPhotoChange} />
      </label>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      {success && <p className="success">{success}</p>}
      <button disabled={busy}>{busy ? 'Submitting...' : 'Submit complaint'}</button>
    </form>
  )
}
