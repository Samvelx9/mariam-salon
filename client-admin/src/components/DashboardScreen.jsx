import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatPrice, parseLocalDate, formatDate } from '../i18n.js';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function startOfMonth() {
  return `${todayStr().slice(0, 7)}-01`;
}

export default function DashboardScreen({ T, lang, onAuthError }) {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayStr());
  const [financials, setFinancials] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [newExpense, setNewExpense] = useState({ category: '', description: '', amountAmd: '', date: todayStr() });
  const [adding, setAdding] = useState(false);
  // One expense row at a time is either being edited or being confirmed for
  // deletion — same inline pattern as Services, so the form sits under the row.
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [fin, exp, cats] = await Promise.all([
        api.getFinancials({ from, to }),
        api.getExpenses({ from, to }),
        api.getExpenseCategories(),
      ]);
      setFinancials(fin);
      setExpenses(exp);
      setCategories(cats);
    } catch (err) {
      if (!onAuthError(err)) setError('genericError');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  async function submitExpense(e) {
    e.preventDefault();
    const amount = Number(newExpense.amountAmd);
    if (!newExpense.category.trim() || !Number.isFinite(amount) || amount <= 0 || !newExpense.date) return;

    setAdding(true);
    setError(null);
    try {
      await api.createExpense({
        category: newExpense.category.trim(),
        description: newExpense.description.trim() || undefined,
        amountAmd: amount,
        date: newExpense.date,
      });
      setNewExpense({ category: '', description: '', amountAmd: '', date: todayStr() });
      await load();
    } catch (err) {
      if (!onAuthError(err)) setError('genericError');
    } finally {
      setAdding(false);
    }
  }

  function startEditExpense(exp) {
    setConfirmingDeleteId(null);
    setEditingId(exp.id);
    setEditForm({
      category: exp.category,
      description: exp.description || '',
      amountAmd: String(exp.amount_amd),
      date: exp.date,
    });
  }

  async function saveExpense() {
    const amount = Number(editForm.amountAmd);
    if (!editForm.category.trim() || !Number.isInteger(amount) || amount <= 0 || !editForm.date) {
      setError('genericError');
      return;
    }
    setSavingEdit(true);
    setError(null);
    try {
      await api.updateExpense(editingId, {
        category: editForm.category.trim(),
        description: editForm.description.trim(),
        amountAmd: amount,
        date: editForm.date,
      });
      setEditingId(null);
      await load();
    } catch (err) {
      if (!onAuthError(err)) setError('genericError');
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeExpense(id) {
    setError(null);
    try {
      await api.deleteExpense(id);
      setConfirmingDeleteId(null);
      if (editingId === id) setEditingId(null);
      await load();
    } catch (err) {
      if (!onAuthError(err)) setError('genericError');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ fontSize: 22, fontWeight: 500 }}>{T.dashboardTitle}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn-outline"
            onClick={() => {
              setFrom(startOfMonth());
              setTo(todayStr());
            }}
          >
            {T.thisMonth}
          </button>
          <button
            className="btn-outline"
            onClick={() => {
              setFrom(addDays(todayStr(), -30));
              setTo(todayStr());
            }}
          >
            {T.last30Days}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            {T.from}
            <input className="field-input" style={{ width: 145 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            {T.to}
            <input className="field-input" style={{ width: 145 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </div>

      {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--terracotta)' }}>{T[error]}</p>}

      {loading || !financials ? (
        <p style={{ color: 'var(--muted)' }}>{T.loading}</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <MetricCard label={T.metricIncome} value={formatPrice(financials.income.total, lang)} />
            <MetricCard label={T.metricExpenses} value={formatPrice(financials.expenses.total, lang)} />
            <MetricCard
              label={T.metricNet}
              value={formatPrice(financials.net, lang)}
              color={financials.net < 0 ? 'var(--terracotta)' : 'var(--sage)'}
            />
            <MetricCard label={T.metricBookingsCompleted} value={String(financials.bookingsCompleted)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <BreakdownCard
              title={T.incomeByService}
              rows={financials.income.byService.map((r) => ({ label: r[`name_${lang}`], value: r.total }))}
              lang={lang}
              noData={T.noData}
            />
            <BreakdownCard
              title={T.expensesByCategory}
              rows={financials.expenses.byCategory.map((r) => ({ label: r.category, value: r.total }))}
              lang={lang}
              noData={T.noData}
            />
          </div>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>{T.addExpense}</h3>
            <form onSubmit={submitExpense} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>{T.categoryLabel}</label>
                  <input
                    className="field-input"
                    list="expense-categories"
                    placeholder={T.categoryPlaceholder}
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                  />
                  <datalist id="expense-categories">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>{T.descriptionLabel}</label>
                  <input
                    className="field-input"
                    value={newExpense.description}
                    onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>{T.amountLabel}</label>
                  <input
                    className="field-input"
                    type="number"
                    value={newExpense.amountAmd}
                    onChange={(e) => setNewExpense({ ...newExpense, amountAmd: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>{T.dateLabel}</label>
                  <input
                    className="field-input"
                    type="date"
                    value={newExpense.date}
                    onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                  />
                </div>
              </div>
              <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start' }} disabled={adding}>
                {T.addBtn}
              </button>
            </form>

            <h3 style={{ fontSize: 16, fontWeight: 600 }}>{T.recentExpenses}</h3>
            {expenses.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>{T.noData}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {expenses.slice(0, 10).map((exp) => (
                  <div key={exp.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{exp.category}</span>
                        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                          {formatDate(parseLocalDate(exp.date), lang)}
                          {exp.description ? ` · ${exp.description}` : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--terracotta)' }}>
                          {formatPrice(exp.amount_amd, lang)}
                        </span>
                        {confirmingDeleteId === exp.id ? (
                          <>
                            <span style={{ fontSize: 12.5, color: 'var(--terracotta)' }}>{T.confirmDeleteExpense}</span>
                            <button className="btn-danger-outline" onClick={() => removeExpense(exp.id)}>
                              {T.confirmDeleteBtn}
                            </button>
                            <button className="btn-outline" onClick={() => setConfirmingDeleteId(null)}>
                              {T.cancelBtn}
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn-outline" onClick={() => startEditExpense(exp)} disabled={editingId === exp.id}>
                              {T.editBtn}
                            </button>
                            <button className="btn-danger-outline" onClick={() => setConfirmingDeleteId(exp.id)}>
                              {T.deleteBtn}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {editingId === exp.id && (
                      <div
                        className="card"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                          marginLeft: 16,
                          borderLeft: '3px solid var(--terracotta)',
                          background: 'var(--bg)',
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                          <ExpenseField
                            label={T.categoryLabel}
                            value={editForm.category}
                            onChange={(v) => setEditForm({ ...editForm, category: v })}
                          />
                          <ExpenseField
                            label={T.descriptionLabel}
                            value={editForm.description}
                            onChange={(v) => setEditForm({ ...editForm, description: v })}
                          />
                          <ExpenseField
                            label={T.amountLabel}
                            type="number"
                            value={editForm.amountAmd}
                            onChange={(v) => setEditForm({ ...editForm, amountAmd: v })}
                          />
                          <ExpenseField
                            label={T.dateLabel}
                            type="date"
                            value={editForm.date}
                            onChange={(v) => setEditForm({ ...editForm, date: v })}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button className="btn-primary" onClick={saveExpense} disabled={savingEdit}>
                            {T.saveBtn}
                          </button>
                          <button className="btn-outline" onClick={() => setEditingId(null)} disabled={savingEdit}>
                            {T.cancelBtn}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ExpenseField({ label, value, onChange, type = 'text' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</label>
      <input className="field-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function MetricCard({ label, value, color = 'var(--ink)' }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'Newsreader',serif" }}>{value}</span>
    </div>
  );
}

function BreakdownCard({ title, rows, lang, noData }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h3>
      {rows.length === 0 ? (
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{noData}</span>
      ) : (
        rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
            <span>{r.label}</span>
            <span style={{ fontWeight: 600 }}>{formatPrice(r.value, lang)}</span>
          </div>
        ))
      )}
    </div>
  );
}
