import LangSwitcher from './LangSwitcher.jsx';
import { formatPrice } from '../i18n.js';

export default function ServicesScreen(f) {
  const { T, lang, services, servicesLoading, selectedServiceId, selectService, continueToCalendar, goToLookup } = f;

  return (
    <>
      <div className="scrollarea" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ position: 'relative', padding: '36px 24px 8px' }}>
          {/* Own clipping wrapper so this decorative circle can't bleed into
              horizontal scroll, without clipping the lang dropdown below (a
              sibling, not nested inside this overflow:hidden box). */}
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
            <div
              style={{
                position: 'absolute',
                top: -60,
                right: -50,
                width: 180,
                height: 180,
                borderRadius: '50%',
                background: 'var(--sage-light)',
                opacity: 0.6,
              }}
            />
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--sage)', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', flexShrink: 0 }}>
                <path d="M12 21C12 21 4 17 4 9C4 5 7 3 12 3C17 3 20 5 20 9C20 17 12 21 12 21Z"></path>
                <path d="M12 21V9"></path>
              </svg>
              <h2 style={{ fontSize: 22, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {T.brandName}
              </h2>
            </div>
            <LangSwitcher lang={f.lang} langMenuOpen={f.langMenuOpen} toggleLangMenu={f.toggleLangMenu} setLang={f.setLang} bg="var(--white)" />
          </div>
          <p style={{ position: 'relative', margin: '6px 0 0', fontSize: 13, color: 'var(--muted)' }}>{T.tagline}</p>
        </div>

        <div style={{ padding: '12px 24px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>
            {T.step1of3}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sage)' }} />
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--line)' }} />
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--line)' }} />
          </div>
        </div>

        <div style={{ padding: '2px 24px 4px', textAlign: 'center' }}>
          <a href="#" onClick={(e) => { e.preventDefault(); goToLookup(); }} style={{ fontSize: 12.5, fontWeight: 600 }}>
            {T.manageLink}
          </a>
        </div>

        <div style={{ padding: '12px 24px 8px' }}>
          <h3 style={{ fontSize: 19, fontWeight: 500 }}>{T.chooseService}</h3>
        </div>

        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {servicesLoading && <span style={{ fontSize: 14, color: 'var(--muted)' }}>{T.loading}</span>}
          {services.map((s) => {
            const selected = s.id === selectedServiceId;
            return (
              <button
                key={s.id}
                onClick={() => selectService(s.id)}
                style={{
                  textAlign: 'left',
                  width: '100%',
                  padding: 16,
                  borderRadius: 16,
                  border: selected ? '1.5px solid var(--sage)' : '1px solid var(--line)',
                  background: selected ? 'var(--sage-light)' : 'var(--surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  transition: 'background 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontFamily: "'Newsreader',serif", fontSize: 16, color: 'var(--ink)' }}>{s[`name_${lang}`]}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--muted)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <circle cx="12" cy="12" r="9"></circle>
                      <path d="M12 7V12L15.5 14"></path>
                    </svg>
                    {s.duration_minutes} {T.minUnit}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--terracotta)' }}>{formatPrice(s.price_amd, lang)}</span>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: selected ? '1.5px solid var(--sage)' : '1.5px solid var(--line)',
                      background: selected ? 'var(--sage)' : 'transparent',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selected && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--white)', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                        <path d="M5 13L9.5 17.5L19 7"></path>
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedServiceId && (
        <div style={{ padding: '14px 24px 20px', borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
          <button
            onClick={continueToCalendar}
            style={{ width: '100%', padding: 16, borderRadius: 999, background: 'var(--sage)', color: 'var(--white)', fontSize: 15, fontWeight: 600 }}
          >
            {T.continueBtn}
          </button>
        </div>
      )}
    </>
  );
}
