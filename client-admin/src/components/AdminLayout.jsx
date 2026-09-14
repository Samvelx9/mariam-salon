import LangSwitcher from './LangSwitcher.jsx';

const TABS = ['dashboard', 'bookings', 'services', 'availability'];
const TAB_LABEL_KEY = {
  dashboard: 'navDashboard',
  bookings: 'navBookings',
  services: 'navServices',
  availability: 'navAvailability',
};

export default function AdminLayout({ T, lang, setLang, tab, setTab, onLogout, children }) {
  return (
    <div className="admin-shell">
      <div style={{ borderBottom: '1px solid var(--line)', background: 'var(--white)' }}>
        <div
          className="admin-content"
          style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {T.appName}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <LangSwitcher lang={lang} setLang={setLang} />
            <button onClick={onLogout} className="btn-outline">
              {T.logout}
            </button>
          </div>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface)' }}>
        <div className="admin-content" style={{ padding: 0, display: 'flex', gap: 4, overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '14px 16px',
                fontSize: 14,
                fontWeight: 600,
                color: tab === t ? 'var(--sage)' : 'var(--muted)',
                borderBottom: tab === t ? '2px solid var(--sage)' : '2px solid transparent',
                whiteSpace: 'nowrap',
              }}
            >
              {T[TAB_LABEL_KEY[t]]}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-content">{children}</div>
    </div>
  );
}
