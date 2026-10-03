// Persistent institutional header, used on every page in place of each page's
// old ad-hoc header/logout row. userName/userRole/onLogout are omitted on
// Login/Signup, which show only the institutional branding.
export default function SiteHeader({ userName, userRole, onLogout }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="site-header-brand">
          {/* Original abstract device (gold disc + navy compass-star) — not a copy of
              any real Karunya emblem, which we don't have and shouldn't fabricate. */}
          <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true" focusable="false">
            <circle cx="19" cy="19" r="19" fill="#C49A2E" />
            <path d="M19 7 L23 19 L19 31 L15 19 Z" fill="#152238" />
            <path d="M7 19 L19 15 L31 19 L19 23 Z" fill="#152238" opacity="0.55" />
          </svg>
          <div>
            <div className="site-header-title">Karunya Institute of Technology and Sciences</div>
            <div className="site-header-subtitle">Campus Complaint &amp; Maintenance Portal</div>
          </div>
        </div>
        {userName && (
          <div className="site-header-user">
            <span>{userName} · {userRole}</span>
            <button className="outline" onClick={onLogout}>Log out</button>
          </div>
        )}
      </div>
    </header>
  )
}
