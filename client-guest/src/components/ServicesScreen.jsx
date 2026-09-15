import LangSwitcher from './LangSwitcher.jsx';
import { formatPrice } from '../i18n.js';
import { HOUR_CHOICES } from 'salon-shared/booking';
import { ClockIcon, ChevronLeftIcon, CategoryIcon } from './Icons.jsx';

// The price list for one treatment: every zone Mariam offers in that category,
// with its duration and price. Picking a zone is step 1 of the booking flow.
export default function ServicesScreen(f) {
  const {
    T,
    lang,
    selectedCategory,
    servicesLoading,
    selectedServiceId,
    selectService,
    continueToCalendar,
    backToLanding,
  } = f;

  const zones = selectedCategory?.services ?? [];
  // An hourly treatment is priced per hour, so the guest picks the length here,
  // before the time picker — the number of hours decides which start times are
  // long enough to offer.
  const isHourly = Boolean(selectedCategory?.is_hourly);
  const selectedZone = zones.find((z) => z.id === selectedServiceId);

  return (
    <>
      <div className="scrollarea" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ position: 'relative', padding: '20px 24px 8px' }}>
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
            <div
              style={{
                position: 'absolute',
                top: -70,
                right: -50,
                width: 190,
                height: 190,
                borderRadius: '50%',
                background: 'var(--sage-light)',
                opacity: 0.55,
              }}
            />
          </div>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={backToLanding}
              style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <ChevronLeftIcon size={19} color="var(--ink)" strokeWidth={2} />
            </button>
            <span style={{ flex: 1 }} />
            <LangSwitcher
              lang={f.lang}
              langMenuOpen={f.langMenuOpen}
              toggleLangMenu={f.toggleLangMenu}
              setLang={f.setLang}
              bg="var(--white)"
            />
          </div>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <span
              style={{
                width: 48,
                height: 48,
                borderRadius: 15,
                background: 'var(--white)',
                border: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CategoryIcon slug={selectedCategory?.slug} size={24} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.2 }}>
                {selectedCategory ? selectedCategory[`name_${lang}`] : ''}
              </h2>
              {selectedCategory?.[`description_${lang}`] && (
                <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--muted)' }}>
                  {selectedCategory[`description_${lang}`]}
                </p>
              )}
            </div>
          </div>
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

        <div style={{ padding: '12px 24px 8px' }}>
          <h3 style={{ fontSize: 19, fontWeight: 500 }}>{T.chooseZone}</h3>
        </div>

        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {servicesLoading && <span style={{ fontSize: 14, color: 'var(--muted)' }}>{T.loading}</span>}
          {!servicesLoading && zones.length === 0 && (
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>{T.noZonesYet}</span>
          )}
          {zones.map((s) => {
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
                    <ClockIcon size={13} color="var(--muted)" strokeWidth={2} />
                    {isHourly ? T.byTheHour : `${s.duration_minutes} ${T.minUnit}`}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--terracotta)' }}>
                    {formatPrice(s.price_amd, lang)}
                    {isHourly && <span style={{ fontSize: 11, fontWeight: 500 }}> {T.perHourSuffix}</span>}
                  </span>
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
          {isHourly && selectedZone && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{T.howLong}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--terracotta)' }}>
                  {formatPrice(selectedZone.price_amd * f.bookedHours, lang)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {HOUR_CHOICES.map((h) => {
                  const active = h === f.bookedHours;
                  return (
                    <button
                      key={h}
                      onClick={() => f.selectHours(h)}
                      style={{
                        minWidth: 48,
                        padding: '9px 12px',
                        borderRadius: 999,
                        fontSize: 13,
                        fontWeight: active ? 700 : 500,
                        border: active ? '1.5px solid var(--sage)' : '1px solid var(--line)',
                        background: active ? 'var(--sage-light)' : 'var(--white)',
                        color: 'var(--ink)',
                      }}
                    >
                      {h} {T.hourUnit}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
