import { LANG_META, LANG_ORDER } from '../i18n.js';

export default function LangSwitcher({ lang, langMenuOpen, toggleLangMenu, setLang, bg = 'var(--surface)' }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={toggleLangMenu}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '6px 9px',
          borderRadius: 999,
          border: '1px solid var(--line)',
          background: bg,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{LANG_META[lang].flag}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--muted)', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path d="M6 9L12 15L18 9"></path>
        </svg>
      </button>
      {langMenuOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            background: 'var(--white)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
            zIndex: 30,
            minWidth: 136,
          }}
        >
          {LANG_ORDER.map((code) => (
            <button
              key={code}
              onClick={() => setLang(code)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 8,
                background: code === lang ? 'var(--sage-light)' : 'transparent',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 16 }}>{LANG_META[code].flag}</span>
              <span style={{ fontSize: 13, fontWeight: code === lang ? 700 : 500, color: 'var(--ink)' }}>
                {LANG_META[code].name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
