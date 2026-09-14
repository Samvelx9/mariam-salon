import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { formatPrice } from '../i18n.js';

const EMPTY_FORM = { nameEn: '', nameRu: '', nameHy: '', durationMinutes: '', priceAmd: '' };

export default function ServicesScreen({ T, lang, onAuthError }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null); // null | 'new' | service id
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getServices();
      setServices(data);
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

  function startNew() {
    setForm(EMPTY_FORM);
    setEditingId('new');
    setError(null);
  }

  function startEdit(s) {
    setForm({
      nameEn: s.name_en,
      nameRu: s.name_ru,
      nameHy: s.name_hy,
      durationMinutes: String(s.duration_minutes),
      priceAmd: String(s.price_amd),
    });
    setEditingId(s.id);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function save() {
    const payload = {
      nameEn: form.nameEn.trim(),
      nameRu: form.nameRu.trim(),
      nameHy: form.nameHy.trim(),
      durationMinutes: Number(form.durationMinutes),
      priceAmd: Number(form.priceAmd),
    };
    if (!payload.nameEn || !payload.nameRu || !payload.nameHy || !payload.durationMinutes || Number.isNaN(payload.priceAmd)) {
      setError('genericError');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingId === 'new') {
        await api.createService(payload);
      } else {
        await api.updateService(editingId, payload);
      }
      setEditingId(null);
      await load();
    } catch (err) {
      if (!onAuthError(err)) setError('genericError');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s) {
    try {
      await api.updateService(s.id, { isActive: !s.is_active });
      await load();
    } catch (err) {
      if (!onAuthError(err)) setError('genericError');
    }
  }

  async function remove(s) {
    if (!window.confirm(T.confirmDeleteService)) return;
    try {
      await api.deleteService(s.id);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'service_has_bookings') {
        window.alert(T.serviceHasBookingsError);
      } else if (!onAuthError(err)) {
        setError('genericError');
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 22, fontWeight: 500 }}>{T.servicesTitle}</h2>
        {editingId === null && (
          <button className="btn-primary" onClick={startNew}>
            {T.addServiceBtn}
          </button>
        )}
      </div>

      {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--terracotta)' }}>{T[error]}</p>}

      {editingId !== null && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Field label={T.nameEnLabel} value={form.nameEn} onChange={(v) => setForm({ ...form, nameEn: v })} />
            <Field label={T.nameRuLabel} value={form.nameRu} onChange={(v) => setForm({ ...form, nameRu: v })} />
            <Field label={T.nameHyLabel} value={form.nameHy} onChange={(v) => setForm({ ...form, nameHy: v })} />
            <Field
              label={T.durationLabel}
              type="number"
              value={form.durationMinutes}
              onChange={(v) => setForm({ ...form, durationMinutes: v })}
            />
            <Field label={T.priceLabel} type="number" value={form.priceAmd} onChange={(v) => setForm({ ...form, priceAmd: v })} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {T.saveBtn}
            </button>
            <button className="btn-outline" onClick={cancelEdit}>
              {T.cancelBtn}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>{T.loading}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {services.map((s) => (
            <div
              key={s.id}
              className="card"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontFamily: "'Newsreader',serif", fontSize: 16 }}>
                  {s[`name_${lang}`]}{' '}
                  {!s.is_active && (
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'Karla',sans-serif" }}>
                      ({T.inactiveTag})
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  {s.duration_minutes} {T.minUnit} · {formatPrice(s.price_amd, lang)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn-outline" onClick={() => startEdit(s)}>
                  {T.editBtn}
                </button>
                <button className="btn-outline" onClick={() => toggleActive(s)}>
                  {s.is_active ? T.deactivateBtn : T.activateBtn}
                </button>
                <button className="btn-danger-outline" onClick={() => remove(s)}>
                  {T.deleteBtn}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</label>
      <input className="field-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
