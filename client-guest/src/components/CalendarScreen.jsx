import Header from './Header.jsx';
import SummaryBanner from './SummaryBanner.jsx';
import SlotPicker from './SlotPicker.jsx';
import ErrorBanner from './ErrorBanner.jsx';
import { formatPrice } from '../i18n.js';
import {
  STEP_MINUTES,
  MIN_BOOKING_MINUTES,
  MAX_BOOKING_MINUTES,
  formatDuration,
} from 'salon-shared/booking';

// A stepper rather than a row of twelve pills: half-hour steps up to six hours
// is too many choices to lay out at phone width.
function StepButton({ label, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label === '+' ? 'plus' : 'minus'}
      style={{
        width: 42,
        height: 42,
        borderRadius: '50%',
        fontSize: 19,
        lineHeight: 1,
        border: '1px solid var(--line)',
        background: disabled ? 'var(--bg)' : 'var(--white)',
        color: disabled ? 'var(--line)' : 'var(--ink)',
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

export default function CalendarScreen(f) {
  const { T, lang, services, selectedServiceId, backToServices } = f;
  const service = services.find((s) => s.id === selectedServiceId);
  const isHourly = Boolean(service?.is_hourly);
  // The banner keeps the zone's terms; for an hourly zone the chosen length and
  // its total live in the picker below, next to the times they affect.
  const summary = service
    ? isHourly
      ? `${formatPrice(service.price_amd, lang)} ${T.perHourSuffix}`
      : `${service.duration_minutes} ${T.minUnit} · ${formatPrice(service.price_amd, lang)}`
    : '';

  const errorText = f.bannerErrorKey ? T[f.bannerErrorKey] : null;

  return (
    <>
      <Header
        title={T.pickATime}
        onBack={backToServices}
        showDots
        dotStep="calendar"
        lang={f.lang}
        langMenuOpen={f.langMenuOpen}
        toggleLangMenu={f.toggleLangMenu}
        setLang={f.setLang}
      />
      <div style={{ padding: '0 24px 12px' }}>
        <SummaryBanner
          name={service ? service[`name_${lang}`] : ''}
          subtitle={summary}
          actionLabel={T.change}
          onAction={backToServices}
        />
      </div>

      <ErrorBanner text={errorText} />

      {/* The length sits above the times, not on the previous screen: the point
          of choosing it here is watching which slots survive it, so the guest
          can see straight away whether Mariam has that long free. */}
      {isHourly && service && (
        <div style={{ padding: '0 24px 4px' }}>
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 14,
              padding: '12px 14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{T.howLong}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--terracotta)' }}>
                {formatPrice(Math.round((service.price_amd * f.bookedMinutes) / 60), lang)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <StepButton
                label="−"
                disabled={f.bookedMinutes <= MIN_BOOKING_MINUTES}
                onClick={() => f.stepMinutes(-STEP_MINUTES)}
              />
              <span style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 600 }}>
                {formatDuration(f.bookedMinutes, T.hourUnit, T.minUnit)}
              </span>
              <StepButton
                label="+"
                disabled={f.bookedMinutes >= MAX_BOOKING_MINUTES}
                onClick={() => f.stepMinutes(STEP_MINUTES)}
              />
            </div>
          </div>
        </div>
      )}

      <SlotPicker
        T={T}
        lang={lang}
        slotsData={f.slotsData}
        slotsLoading={f.slotsLoading}
        selectedDayIndex={f.selectedDayIndex}
        selectedSlot={f.selectedSlot}
        selectDay={f.selectDay}
        selectSlot={f.selectSlot}
      />

      {f.selectedSlot && (
        <div style={{ padding: '14px 24px 20px', borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
          <button
            onClick={f.continueToDetails}
            style={{ width: '100%', padding: 16, borderRadius: 999, background: 'var(--sage)', color: 'var(--white)', fontSize: 15, fontWeight: 600 }}
          >
            {T.continueBtn}
          </button>
        </div>
      )}
    </>
  );
}
