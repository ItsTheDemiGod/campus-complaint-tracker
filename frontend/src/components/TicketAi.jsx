export function PriorityBadge({ priority }) {
  return <span className={`priority priority-${priority}`}>{priority}</span>
}

const verdict = (accepted) => (accepted === null ? '' : accepted ? ' (accepted)' : ' (overridden)')

// Transparency panel: what the AI suggested and whether the student kept it.
export function AiSuggestion({ ticket }) {
  if (!ticket.ai_suggested_category) return null
  return (
    <div className="ai-details">
      <h4>AI suggestion</h4>
      <div>Category: {ticket.ai_suggested_category}{verdict(ticket.ai_category_accepted)}</div>
      <div>Priority: {ticket.ai_suggested_priority}{verdict(ticket.ai_priority_accepted)}</div>
      <div>Confidence: {Math.round(ticket.ai_confidence * 100)}%</div>
      <div>Reasoning: {ticket.ai_suggestion_reasoning}</div>
    </div>
  )
}
