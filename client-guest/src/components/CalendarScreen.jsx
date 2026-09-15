import Header from './Header.jsx';
import SummaryBanner from './SummaryBanner.jsx';
import SlotPicker from './SlotPicker.jsx';
import ErrorBanner from './ErrorBanner.jsx';
import { formatPrice } from '../i18n.js';

export default function CalendarScreen(f) {
  const { T, lang, services, selectedServiceId, backToServices } = f;
  const service = services.find((s) => s.id === selectedServiceId);
  // For an hourly zone the banner has to show what was actually chosen — the
  // length and what that costs — not the zone's nominal duration and rate.
  const summary = service
    ? service.is_hourly
      ? `${f.bookedHours} ${T.hourUnit} · ${formatPrice(service.price_amd * f.bookedHours, lang)}`
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
