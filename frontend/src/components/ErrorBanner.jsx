// Reusable error display, used wherever a fetch/action error needs to be shown to
// the user, in place of ad-hoc <p className="error"> text scattered across pages.
export default function ErrorBanner({ message, onDismiss }) {
  if (!message) return null
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" className="secondary" onClick={onDismiss}>Dismiss</button>
      )}
    </div>
  )
}
