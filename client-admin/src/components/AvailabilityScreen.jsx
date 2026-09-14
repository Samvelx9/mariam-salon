import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { WEEKDAY_FULL, parseLocalDate, formatDate } from '../i18n.js';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export default function AvailabilityScreen({ T, lang, onAuthError }) {
  const [hours, setHours] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newBlock, setNewBlock] = useState({ date: '', allDay: true, startTime: '10:00', endTime: '11:00', note: '' });
  const [addingBlock, setAddingBlock] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [hoursData, blocksData] = await Promise.all([
        api.getWeeklyHours(),
        api.getBlocks(todayStr(), addDays(todayStr(), 365)),
      ]);
      setHours(hoursData);
      setBlocks(blocksData);
    } catch (err) {
      if (!onAuthError(err)) setError('genericError');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateRow(dayOfWeek, fields) {
    setHours((prev) => prev.map((h) => (h.day_of_week === dayOfWeek ? { ...h, ...fields } : h)));
  }

  async function saveRow(row) {
    try {
      await api.updateWeeklyHours(row.day_of_week, {
        isOpen: row.is_open,
        startTime: row.start_time,
        endTime: row.end_time,
      });
      await load();
    } catch (err) {
      if (!onAuthError(err)) setError('genericError');
    }
  }

  async function submitBlock(e) {
    e.preventDefault();
    if (!newBlock.date) return;
    setAddingBlock(true);
    setError(null);
    try {
      await api.createBlock({
        date: newBlock.date,
        startTime: newBlock.allDay ? null : newBlock.startTime,
        endTime: newBlock.allDay ? null : newBlock.endTime,
        note: newBlock.note.trim() || undefined,
      });
      setNewBlock({ date: '', allDay: true, startTime: '10:00', endTime: '11:00', note: '' });
      await load();
    } catch (err) {
      if (!onAuthError(err)) setError('genericError');
    } finally {
      setAddingBlock(false);
    }
  }

  async function removeBlock(id) {
    try {
      await api.deleteBlock(id);
      await load();
    } catch (err) {
      if (!onAuthError(err)) setError('genericError');
    }
  }

  if (loading) return <p style={{ color: 'var(--muted)' }}>{T.loading}</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <h2 style={{ fontSize: 22, fontWeight: 500 }}>{T.availabilityTitle}</h2>
      {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--terracotta)' }}>{T[error]}</p>}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>{T.weeklyHoursSection}</h3>
        {hours.map((row) => (
          <div
            key={row.day_of_week}
            className="card"
            style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}
          >
            <span style={{ minWidth: 110, fontWeight: 600, fontSize: 14 }}>{WEEKDAY_FULL[lang][row.day_of_week]}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={row.is_open}
                onChange={(e) =>
                  updateRow(row.day_of_week, {
                    is_open: e.target.checked,
                    start_time: e.target.checked ? row.start_time || '09:00' : null,
                    end_time: e.target.checked ? row.end_time || '18:00' : null,
                  })
                }
              />
              {row.is_open ? T.openLabel : T.closedLabel}
            </label>
            {row.is_open && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  {T.startTimeLabel}
                  <input
                    className="field-input"
                    style={{ width: 110 }}
                    type="time"
                    value={(row.start_time || '').slice(0, 5)}
                    onChange={(e) => updateRow(row.day_of_week, { start_time: e.target.value })}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  {T.endTimeLabel}
                  <input
                    className="field-input"
                    style={{ width: 110 }}
                    type="time"
                    value={(row.end_time || '').slice(0, 5)}
                    onChange={(e) => updateRow(row.day_of_week, { end_time: e.target.value })}
                  />
                </label>
              </>
            )}
            <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={() => saveRow(row)}>
              {T.saveBtn}
            </button>
          </div>
        ))}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>{T.dateBlocksSection}</h3>

        <form onSubmit={submitBlock} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>{T.blockDateLabel}</label>
              <input
                className="field-input"
                type="date"
                value={newBlock.date}
                onChange={(e) => setNewBlock({ ...newBlock, date: e.target.value })}
                required
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 20 }}>
              <input
                type="checkbox"
                checked={newBlock.allDay}
                onChange={(e) => setNewBlock({ ...newBlock, allDay: e.target.checked })}
              />
              {T.blockAllDay}
            </label>
            {!newBlock.allDay && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>{T.startTimeLabel}</label>
                  <input
                    className="field-input"
                    type="time"
                    value={newBlock.startTime}
                    onChange={(e) => setNewBlock({ ...newBlock, startTime: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>{T.endTimeLabel}</label>
                  <input
                    className="field-input"
                    type="time"
                    value={newBlock.endTime}
                    onChange={(e) => setNewBlock({ ...newBlock, endTime: e.target.value })}
                  />
                </div>
              </>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>{T.blockNoteLabel}</label>
              <input
                className="field-input"
                placeholder={T.blockNotePlaceholder}
                value={newBlock.note}
                onChange={(e) => setNewBlock({ ...newBlock, note: e.target.value })}
              />
            </div>
          </div>
          <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start' }} disabled={addingBlock}>
            {T.addBlockBtn}
          </button>
        </form>

        {blocks.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>{T.noBlocks}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {blocks.map((b) => (
              <div key={b.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    {formatDate(parseLocalDate(b.date), lang)}
                    {b.start_time ? ` · ${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)}` : ` · ${T.blockAllDay}`}
                  </span>
                  {b.note && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{b.note}</span>}
                </div>
                <button className="btn-danger-outline" onClick={() => removeBlock(b.id)}>
                  {T.deleteBtn}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
