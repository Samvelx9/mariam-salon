import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatPrice, parseLocalDate, formatDate } from '../i18n.js';
import { splitYerevanDateTime } from 'salon-shared/time';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const STATUS_KEY = {
  confirmed: 'statusConfirmed',
  completed: 'statusCompleted',
  cancelled: 'statusCancelled',
  no_show: 'statusNoShow',
};
const STATUS_COLOR = {
  confirmed: 'var(--sage)',
  completed: 'var(--ink)',
  cancelled: 'var(--terracotta)',
  no_show: 'var(--muted)',
};

export default function BookingsScreen({ T, lang, onAuthError }) {
  const [anchor, setAnchor] = useState(todayStr());
  const [statusFilter, setStatusFilter] = useState('');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const from = anchor;
  const to = addDays(anchor, 6);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getBookings({ from, to, status: statusFilter || undefined });
      setBookings(data);
    } catch (err) {
      if (!onAuthError(err)) setError('genericError');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, statusFilter]);

  async function changeStatus(id, status) {
    try {
      await api.updateBookingStatus(id, status);
      await load();
    } catch (err) {
      if (!onAuthError(err)) setError('genericError');
    }
  }

  const byDate = new Map();
  for (const b of bookings) {
    const { dateObj } = splitYerevanDateTime(b.start_time);
    const key = dateObj.toDateString();
    if (!byDate.has(key)) byDate.set(key, { dateObj, items: [] });
    byDate.get(key).items.push(b);
  }
  const days = [...byDate.values()].sort((a, b) => a.dateObj - b.dateObj);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ fontSize: 22, fontWeight: 500 }}>{T.bookingsTitle}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn-outline" onClick={() => setAnchor(addDays(anchor, -7))}>
            {T.prevWeek}
          </button>
          <button className="btn-outline" onClick={() => setAnchor(todayStr())}>
            {T.today}
          </button>
          <button className="btn-outline" onClick={() => setAnchor(addDays(anchor, 7))}>
            {T.nextWeek}
          </button>
          <select className="field-input" style={{ width: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{T.filterAll}</option>
            {Object.entries(STATUS_KEY).map(([value, key]) => (
              <option key={value} value={value}>
                {T[key]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--terracotta)' }}>{T[error]}</p>}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>{T.loading}</p>
      ) : days.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>{T.noBookingsThisPeriod}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {days.map(({ dateObj, items }) => (
            <div key={dateObj.toDateString()} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {formatDate(dateObj, lang)}
              </h3>
              {items
                .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
                .map((b) => {
                  const { time } = splitYerevanDateTime(b.start_time);
                  return (
                    <div
                      key={b.id}
                      className="card"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontFamily: "'Newsreader',serif", fontSize: 15 }}>
                          {time} · {b[`name_${lang}`]}
                        </span>
                        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                          {b.customer_name} · {b.customer_phone} · {formatPrice(b.price_at_booking, lang)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[b.status] }}>
                          {T[STATUS_KEY[b.status]]}
                        </span>
                        <select
                          className="field-input"
                          style={{ width: 150 }}
                          value=""
                          onChange={(e) => {
                            if (e.target.value) changeStatus(b.id, e.target.value);
                          }}
                        >
                          <option value="">{T.markAs}</option>
                          {Object.entries(STATUS_KEY)
                            .filter(([value]) => value !== b.status)
                            .map(([value, key]) => (
                              <option key={value} value={value}>
                                {T[key]}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
