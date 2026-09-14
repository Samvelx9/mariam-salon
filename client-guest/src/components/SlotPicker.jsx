import { dayLabel, parseLocalDate } from '../i18n.js';

export default function SlotPicker({ T, lang, slotsData, slotsLoading, selectedDayIndex, selectedSlot, selectDay, selectSlot }) {
  const days = slotsData?.days ?? [];
  const daySlots = days[selectedDayIndex]?.slots ?? [];
  const isTodaySelected = selectedDayIndex === 0;

  return (
    <div className="scrollarea" style={{ flex: 1, overflowY: 'auto', padding: '4px 0 8px' }}>
      <div className="scrollarea" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 24px 4px' }}>
        {days.map((d, index) => {
          const dateObj = parseLocalDate(d.date);
          const selected = index === selectedDayIndex;
          return (
            <button
              key={d.date}
              onClick={() => selectDay(index)}
              style={{
                flexShrink: 0,
                minWidth: 48,
                padding: '10px 8px',
                borderRadius: 14,
                border: selected ? '1.5px solid var(--sage)' : '1px solid var(--line)',
                background: selected ? 'var(--sage)' : 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span style={{ fontSize: 11, color: selected ? 'var(--white)' : 'var(--ink)', opacity: 0.8, whiteSpace: 'nowrap' }}>
                {dayLabel(dateObj, index, lang)}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: selected ? 'var(--white)' : 'var(--ink)' }}>
                {dateObj.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ padding: '18px 24px 8px' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{T.onlyRealOpenings}</span>
      </div>

      {isTodaySelected && (
        <div style={{ padding: '0 24px 8px' }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>{T.sameDayNotice}</span>
        </div>
      )}

      {slotsLoading ? (
        <div style={{ padding: '4px 24px 24px' }}>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>{T.loading}</span>
        </div>
      ) : daySlots.length > 0 ? (
        <div style={{ padding: '4px 24px 24px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          {daySlots.map((time) => {
            const selected = time === selectedSlot;
            return (
              <button
                key={time}
                onClick={() => selectSlot(time)}
                style={{
                  padding: '12px 0',
                  borderRadius: 12,
                  border: selected ? '1.5px solid var(--terracotta)' : '1px solid var(--line)',
                  background: selected ? 'var(--terracotta)' : 'var(--surface)',
                  fontSize: 14,
                  fontWeight: 500,
                  color: selected ? 'var(--white)' : 'var(--ink)',
                }}
              >
                {time}
              </button>
            );
          })}
        </div>
      ) : (
        <div
          style={{
            margin: '8px 24px 24px',
            padding: 24,
            borderRadius: 16,
            background: 'var(--surface)',
            border: '1px dashed var(--line)',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>{T.noOpenings}</span>
        </div>
      )}
    </div>
  );
}
