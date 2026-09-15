// Step 9 QA pass — integration tests against a running server + real database.
//
// Preconditions: the server must be running (npm run dev:server) with
// DATABASE_URL pointing at a real Postgres reachable from wherever this runs
// (e.g. via the SSH tunnel described in TODO.md), and an admin account must
// exist. Telegram notifications should be disabled for this run (unset
// TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID) since these tests create and cancel a
// number of bookings — delivery itself was already verified in Step 5.
//
// Run with:
//   QA_ADMIN_USERNAME=<username> QA_ADMIN_PASSWORD=<password> npm run test:qa
// (never hardcode real credentials here — this file is committed to a public repo)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const API = process.env.QA_API_URL || 'http://localhost:4000/api';
const ADMIN_USERNAME = process.env.QA_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD;

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  throw new Error(
    'Set QA_ADMIN_USERNAME and QA_ADMIN_PASSWORD (the admin account to run QA against) before running this suite — never hardcoded, since this file is committed to a public repo.'
  );
}

// Independent of the server's own time helpers, deliberately — a test that
// reuses the implementation's own date math could pass even if that math is
// wrong, since both sides would agree on the same bug.
const TZ_OFFSET_MIN = 4 * 60;
function yerevanNowPlusMinutes(minutes) {
  const target = new Date(Date.now() + minutes * 60000 + TZ_OFFSET_MIN * 60000);
  return { date: target.toISOString().slice(0, 10), time: target.toISOString().slice(11, 16) };
}
function dayOfWeekOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function adminApi(path, opts = {}) {
  return api(path, { ...opts, headers: { Authorization: `Bearer ${adminToken}` } });
}

let adminToken;
let services;
const createdBookingIds = [];
const createdExpenseIds = [];
let originalWeeklyHoursRow = null; // for the day we temporarily widen for cutoff tests

// Postgres returns TIME columns as 'HH:MM:SS' — the admin API's isValidTime
// only accepts 'HH:MM', so any restore call must trim the seconds first.
async function restoreWeeklyHoursRow(row) {
  const res = await adminApi(`/admin/availability/weekly/${row.day_of_week}`, {
    method: 'PUT',
    body: JSON.stringify({
      isOpen: row.is_open,
      startTime: row.start_time ? row.start_time.slice(0, 5) : null,
      endTime: row.end_time ? row.end_time.slice(0, 5) : null,
    }),
  });
  if (res.status !== 200) {
    console.error(`WARNING: failed to restore weekly_hours for day ${row.day_of_week}:`, res.status, res.body);
  }
  return res;
}

before(async () => {
  const login = await api('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  assert.equal(login.status, 200, 'admin login must succeed for QA setup');
  adminToken = login.body.token;

  const { body: allServices } = await adminApi('/admin/services');
  services = allServices.filter((s) => s.is_active);
  assert.ok(services.length >= 2, 'need at least 2 active services for QA');
});

after(async () => {
  // Best-effort cleanup: cancel every booking this run created, restore any
  // temporarily-widened weekly-hours row, and report — but never mask an
  // assertion failure with a cleanup failure.
  for (const id of createdBookingIds) {
    await api(`/bookings/${id}/cancel`, { method: 'POST' }).catch(() => {});
  }
  for (const id of createdExpenseIds) {
    await adminApi(`/admin/expenses/${id}`, { method: 'DELETE' }).catch(() => {});
  }
  if (originalWeeklyHoursRow) {
    await restoreWeeklyHoursRow(originalWeeklyHoursRow);
  }
  console.log(`\nQA cleanup: ${createdBookingIds.length} test bookings cancelled, ${createdExpenseIds.length} test expenses deleted.`);
});

// ---------------------------------------------------------------------------
// Double-booking race
// ---------------------------------------------------------------------------
test('two guests racing for the same slot — exactly one wins, the other gets a friendly 409', async () => {
  const service = services[0];
  const { body: slotsData } = await api(`/services/${service.id}/slots`);
  const day = slotsData.days.slice(1).find((d) => d.slots.length > 0); // skip today — avoid any edge-of-cutoff fragility
  assert.ok(day, 'need at least one open slot to test the race');
  const slot = day.slots[0];

  const payload = (phone) => ({
    serviceId: service.id,
    date: day.date,
    time: slot,
    customerName: 'Race Test',
    customerPhone: phone,
  });

  const [a, b] = await Promise.all([
    api('/bookings', { method: 'POST', body: JSON.stringify(payload('+37400010001')) }),
    api('/bookings', { method: 'POST', body: JSON.stringify(payload('+37400010002')) }),
  ]);

  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [201, 409], 'exactly one request should succeed and one should be rejected');

  const winner = a.status === 201 ? a : b;
  const loser = a.status === 201 ? b : a;
  assert.equal(loser.body.error, 'slot_taken', 'the rejected request should get the friendly slot_taken error, not a raw DB error');
  createdBookingIds.push(winner.body.id);
});

// ---------------------------------------------------------------------------
// 90-minute cutoff, right at the boundary — on both create and reschedule
// ---------------------------------------------------------------------------
test('90-minute cutoff: 89 minutes out is rejected, 91 minutes out is accepted (create)', async () => {
  // Widen "today" (in Yerevan time) to be open all day so this boundary test
  // is deterministic regardless of what real-world time QA happens to run at.
  // Stays widened through the reschedule and cancel-cutoff tests too (they
  // also need a valid near-term slot), and is restored at the end of the
  // cancel-cutoff test below — see the comment there.
  const { date: todayYerevan } = yerevanNowPlusMinutes(0);
  const dow = dayOfWeekOf(todayYerevan);
  const { body: hoursRows } = await adminApi('/admin/availability/weekly');
  originalWeeklyHoursRow = hoursRows.find((h) => h.day_of_week === dow);
  await adminApi(`/admin/availability/weekly/${dow}`, {
    method: 'PUT',
    body: JSON.stringify({ isOpen: true, startTime: '00:00', endTime: '23:59' }),
  });

  const service = services[0];

  const tooSoon = yerevanNowPlusMinutes(89);
  const tooSoonRes = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      serviceId: service.id,
      date: tooSoon.date,
      time: tooSoon.time,
      customerName: 'Cutoff Test',
      customerPhone: '+37400020001',
    }),
  });
  assert.equal(tooSoonRes.status, 400);
  assert.equal(tooSoonRes.body.error, 'too_soon');

  const okTime = yerevanNowPlusMinutes(91);
  const okRes = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      serviceId: service.id,
      date: okTime.date,
      time: okTime.time,
      customerName: 'Cutoff Test',
      customerPhone: '+37400020002',
    }),
  });
  assert.equal(okRes.status, 201, `91-minute booking should succeed, got ${okRes.status}: ${JSON.stringify(okRes.body)}`);
  // Cancelled immediately (not left for the global cleanup) so it can't
  // collide with the next test's own "now + ~91min" booking on the same
  // service — cancelled bookings don't hold the EXCLUDE constraint's slot.
  await api(`/bookings/${okRes.body.id}/cancel`, { method: 'POST' });
});

test('90-minute cutoff also applies to reschedule (same 89 vs 91 boundary)', async () => {
  const service = services[0];
  // A safely-future booking to reschedule (tomorrow's first open slot).
  const { body: slotsData } = await api(`/services/${service.id}/slots`);
  const futureDay = slotsData.days.slice(1).find((d) => d.slots.length > 0);
  assert.ok(futureDay, 'need an open slot on a future day to seed the reschedule test');

  const created = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      serviceId: service.id,
      date: futureDay.date,
      time: futureDay.slots[0],
      customerName: 'Reschedule Cutoff Test',
      customerPhone: '+37400030001',
    }),
  });
  assert.equal(created.status, 201);

  const tooSoon = yerevanNowPlusMinutes(89);
  const tooSoonRes = await api(`/bookings/${created.body.id}/reschedule`, {
    method: 'POST',
    body: JSON.stringify({ date: tooSoon.date, time: tooSoon.time }),
  });
  assert.equal(tooSoonRes.status, 400);
  assert.equal(tooSoonRes.body.error, 'too_soon');

  const okTime = yerevanNowPlusMinutes(91);
  const okRes = await api(`/bookings/${created.body.id}/reschedule`, {
    method: 'POST',
    body: JSON.stringify({ date: okTime.date, time: okTime.time }),
  });
  assert.equal(okRes.status, 200, `91-minute reschedule should succeed, got ${okRes.status}: ${JSON.stringify(okRes.body)}`);
  await api(`/bookings/${created.body.id}/cancel`, { method: 'POST' });
});

// ---------------------------------------------------------------------------
// Cancellation has no cutoff
// ---------------------------------------------------------------------------
test('cancellation works with no cutoff, even minutes before the appointment', async () => {
  const service = services[0];
  const soon = yerevanNowPlusMinutes(91); // just past the create cutoff, so it's a legal booking
  const created = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      serviceId: service.id,
      date: soon.date,
      time: soon.time,
      customerName: 'Cancel No Cutoff Test',
      customerPhone: '+37400040001',
    }),
  });
  assert.equal(created.status, 201);

  const cancelRes = await api(`/bookings/${created.body.id}/cancel`, { method: 'POST' });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.body.status, 'cancelled');

  // Done with all the near-term/cutoff tests that needed today widened open —
  // restore it now so every later test sees today's real hours again (and
  // isn't tempted to pick a today-slot sitting right at the cutoff edge).
  const restoreRes = await restoreWeeklyHoursRow(originalWeeklyHoursRow);
  assert.equal(restoreRes.status, 200, 'must be able to restore the widened day\'s original hours');
  originalWeeklyHoursRow = null;
});

// ---------------------------------------------------------------------------
// Phone lookup correctness
// ---------------------------------------------------------------------------
test('phone lookup returns only that number\'s own upcoming, non-cancelled, non-completed bookings', async () => {
  const [serviceA, serviceB] = services;
  const { body: slotsData } = await api(`/services/${serviceA.id}/slots`);
  const openDays = slotsData.days.filter((d) => d.slots.length > 0);
  assert.ok(openDays.length >= 2, 'need at least 2 open days for this test');

  const phoneA = '+37400050001';
  const phoneB = '+37400050002';

  // Two upcoming bookings for phone A (on different days so they don't collide)
  const a1 = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({ serviceId: serviceA.id, date: openDays[0].date, time: openDays[0].slots[0], customerName: 'Lookup A', customerPhone: phoneA }),
  });
  const a2 = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({ serviceId: serviceA.id, date: openDays[1].date, time: openDays[1].slots[0], customerName: 'Lookup A', customerPhone: phoneA }),
  });
  assert.equal(a1.status, 201);
  assert.equal(a2.status, 201);
  createdBookingIds.push(a1.body.id, a2.body.id);

  // A third booking for phone A that gets cancelled — should NOT show up
  const secondSlotDay0 = openDays[0].slots[1];
  if (secondSlotDay0) {
    const a3 = await api('/bookings', {
      method: 'POST',
      body: JSON.stringify({ serviceId: serviceA.id, date: openDays[0].date, time: secondSlotDay0, customerName: 'Lookup A Cancelled', customerPhone: phoneA }),
    });
    assert.equal(a3.status, 201);
    await api(`/bookings/${a3.body.id}/cancel`, { method: 'POST' });
  }

  // A booking for a different phone — should not appear in phone A's lookup
  const b1 = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({ serviceId: serviceB.id, date: openDays[0].date, time: openDays[0].slots[2] || openDays[0].slots[0], customerName: 'Lookup B', customerPhone: phoneB }),
  });
  if (b1.status === 201) createdBookingIds.push(b1.body.id);

  const lookupA = await api('/bookings/lookup', { method: 'POST', body: JSON.stringify({ phone: phoneA }) });
  assert.equal(lookupA.status, 200);
  assert.equal(lookupA.body.length, 2, `expected exactly 2 upcoming bookings for phone A, got ${lookupA.body.length}`);
  assert.ok(lookupA.body.every((b) => b.id === a1.body.id || b.id === a2.body.id));
});

// ---------------------------------------------------------------------------
// No-show doesn't block rebooking
// ---------------------------------------------------------------------------
test('marking a booking no-show does not block that phone number from booking again', async () => {
  const service = services[0];
  const { body: slotsData } = await api(`/services/${service.id}/slots`);
  const day = slotsData.days.slice(1).find((d) => d.slots.length > 0); // skip today — avoid any edge-of-cutoff fragility
  const phone = '+37400060001';

  const first = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({ serviceId: service.id, date: day.date, time: day.slots[0], customerName: 'No Show Test', customerPhone: phone }),
  });
  assert.equal(first.status, 201);
  createdBookingIds.push(first.body.id);

  const statusRes = await adminApi(`/admin/bookings/${first.body.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'no_show' }),
  });
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.body.status, 'no_show');

  const secondSlot = day.slots[1] || slotsData.days.find((d) => d !== day && d.slots.length > 0)?.slots[0];
  assert.ok(secondSlot, 'need a second open slot to test rebooking');
  const second = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({ serviceId: service.id, date: day.date, time: secondSlot, customerName: 'No Show Test', customerPhone: phone }),
  });
  assert.equal(second.status, 201, 'the same phone number should be able to book again after a no-show');
  createdBookingIds.push(second.body.id);
});

// ---------------------------------------------------------------------------
// Financial aggregation, and price_at_booking historical accuracy
// ---------------------------------------------------------------------------
test('financial aggregation matches hand-calculated totals, and price_at_booking preserves old income after a price change', async () => {
  const [serviceA, serviceB] = services;
  const today = yerevanNowPlusMinutes(0).date;

  // Two completed bookings for serviceA, one for serviceB. Slots are
  // re-fetched immediately before each booking (not snapshotted upfront) —
  // different services can share the same underlying time grid with
  // different durations, so an earlier booking in this same test can make an
  // originally-free slot no longer free by the time a later one is created.
  async function bookNextOpenSlot(service, phone) {
    const { body: slotsData } = await api(`/services/${service.id}/slots`);
    const day = slotsData.days.find((d) => d.slots.length > 0);
    assert.ok(day, `need an open slot for ${service.slug}`);
    const res = await api('/bookings', {
      method: 'POST',
      body: JSON.stringify({ serviceId: service.id, date: day.date, time: day.slots[0], customerName: 'Fin Test', customerPhone: phone }),
    });
    assert.equal(res.status, 201, `booking for ${service.slug} should succeed, got ${res.status}: ${JSON.stringify(res.body)}`);
    createdBookingIds.push(res.body.id);
    return { ...res, date: day.date };
  }

  const bk1 = await bookNextOpenSlot(serviceA, '+37400070001');
  const bk2 = await bookNextOpenSlot(serviceA, '+37400070002');
  const bk3 = await bookNextOpenSlot(serviceB, '+37400070003');
  const earliestDate = [bk1.date, bk2.date, bk3.date].sort()[0];
  const latestDate = [bk1.date, bk2.date, bk3.date].sort().at(-1);

  // Mark them completed with a completion date "today", regardless of which
  // future day the appointment itself landed on — financials filters by
  // appointment date, so to keep this test's expected period simple we only
  // assert on the *service breakdown totals*, not a date-bounded period.
  for (const bk of [bk1, bk2, bk3]) {
    const r = await adminApi(`/admin/bookings/${bk.body.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) });
    assert.equal(r.status, 200);
  }

  const category = `QA Test ${Date.now()}`;
  const exp1 = await adminApi('/admin/expenses', { method: 'POST', body: JSON.stringify({ category, amountAmd: 4000, date: today }) });
  const exp2 = await adminApi('/admin/expenses', { method: 'POST', body: JSON.stringify({ category, amountAmd: 2500, date: today }) });
  assert.equal(exp1.status, 201);
  assert.equal(exp2.status, 201);
  createdExpenseIds.push(exp1.body.id, exp2.body.id);

  const from = earliestDate < today ? earliestDate : today;
  const to = latestDate > today ? latestDate : today;
  const fin = await adminApi(`/admin/financials?from=${from}&to=${to}`);
  assert.equal(fin.status, 200);

  const expectedIncomeA = 2 * serviceA.price_amd;
  const expectedIncomeB = 1 * serviceB.price_amd;
  const rowA = fin.body.income.byService.find((r) => r.service_id === serviceA.id);
  const rowB = fin.body.income.byService.find((r) => r.service_id === serviceB.id);
  assert.equal(rowA.total, expectedIncomeA, 'income-by-service total for serviceA should be 2x its price');
  assert.equal(rowA.count, 2);
  assert.equal(rowB.total, expectedIncomeB, 'income-by-service total for serviceB should be 1x its price');

  const expenseRow = fin.body.expenses.byCategory.find((r) => r.category === category);
  assert.equal(expenseRow.total, 6500, 'expenses-by-category total should be the sum of the two test expenses');

  const expectedIncomeTotal = expectedIncomeA + expectedIncomeB;
  assert.equal(fin.body.income.total, expectedIncomeTotal);
  assert.equal(fin.body.expenses.total >= 6500, true, 'expenses total should include our test expenses (may include others in range)');
  assert.equal(fin.body.net, fin.body.income.total - fin.body.expenses.total);

  // --- price_at_booking historical accuracy ---
  const originalPrice = serviceA.price_amd;
  const newPrice = originalPrice + 5000;
  const priceChange = await adminApi(`/admin/services/${serviceA.id}`, { method: 'PATCH', body: JSON.stringify({ priceAmd: newPrice }) });
  assert.equal(priceChange.status, 200);

  try {
    const finAfterPriceChange = await adminApi(`/admin/financials?from=${from}&to=${to}`);
    const rowAAfter = finAfterPriceChange.body.income.byService.find((r) => r.service_id === serviceA.id);
    assert.equal(
      rowAAfter.total,
      expectedIncomeA,
      'historical income must stay based on price_at_booking, not the service\'s current price'
    );

    // A brand-new booking against the now-repriced service should snapshot the NEW price.
    const newDaySlots = (await api(`/services/${serviceA.id}/slots`)).body.days.find((d) => d.slots.length > 0);
    const freshBooking = await api('/bookings', {
      method: 'POST',
      body: JSON.stringify({ serviceId: serviceA.id, date: newDaySlots.date, time: newDaySlots.slots[0], customerName: 'Price Snapshot Test', customerPhone: '+37400070004' }),
    });
    assert.equal(freshBooking.status, 201);
    assert.equal(freshBooking.body.priceAtBooking, newPrice, 'a new booking should snapshot the current (new) price');
    createdBookingIds.push(freshBooking.body.id);
  } finally {
    await adminApi(`/admin/services/${serviceA.id}`, { method: 'PATCH', body: JSON.stringify({ priceAmd: originalPrice }) });
  }
});

// ---------------------------------------------------------------------------
// Multi-zone visits — a booking that covers several zones at once
// ---------------------------------------------------------------------------
test('a visit covering several zones runs as long as the sum and costs the sum', async () => {
  const [zoneA, zoneB] = services;
  const totalMinutes = zoneA.duration_minutes + zoneB.duration_minutes;

  // Asked for by length, since what decides which starts work is how long the
  // whole visit runs — not either zone on its own.
  const { body: slotsData } = await api(`/slots?durationMinutes=${totalMinutes}`);
  const day = slotsData.days.slice(1).find((d) => d.slots.length > 0);
  assert.ok(day, 'need an open slot long enough for both zones');

  const created = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      date: day.date,
      time: day.slots[0],
      customerName: 'Multi Zone Test',
      customerPhone: '+37400080001',
      items: [{ serviceId: zoneA.id }, { serviceId: zoneB.id }],
    }),
  });
  assert.equal(created.status, 201, `multi-zone booking should be created: ${JSON.stringify(created.body)}`);
  createdBookingIds.push(created.body.id);

  assert.equal(created.body.items.length, 2, 'both zones should be stored');
  assert.equal(
    created.body.priceAtBooking,
    zoneA.price_amd + zoneB.price_amd,
    'the visit costs the sum of its zones'
  );
  const runMinutes = Math.round(
    (new Date(created.body.endTime) - new Date(created.body.startTime)) / 60000
  );
  assert.equal(runMinutes, totalMinutes, 'the visit runs as long as its zones together');

  // Each zone keeps its own snapshot, which is what the financial split reads.
  const byId = new Map(created.body.items.map((i) => [i.service_id, i]));
  assert.equal(byId.get(zoneA.id).price_at_booking, zoneA.price_amd);
  assert.equal(byId.get(zoneB.id).duration_minutes, zoneB.duration_minutes);

  // The same slot must now be refused for anyone else.
  const clash = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      date: day.date,
      time: day.slots[0],
      customerName: 'Multi Zone Clash',
      customerPhone: '+37400080002',
      items: [{ serviceId: zoneA.id }],
    }),
  });
  assert.equal(clash.status, 409, 'a second booking over a multi-zone visit must be refused');
});

// ---------------------------------------------------------------------------
// Admin editing an existing booking
// ---------------------------------------------------------------------------
test('editing a booking recomputes its length and total, and refuses an overlapping move', async () => {
  const [zoneA, zoneB] = services;

  // The start has to have room for the *lengthened* visit, not just the short
  // one: booking into the last free half-hour before someone else's appointment
  // and then adding a zone is a genuine overlap, and the earlier tests in this
  // run leave exactly that kind of gap behind.
  const combined = zoneA.duration_minutes + zoneB.duration_minutes;
  const { body: longSlots } = await api(`/slots?durationMinutes=${combined}`);
  const openDays = longSlots.days.slice(1).filter((d) => d.slots.length >= 2);
  assert.ok(openDays.length > 0, 'need a day with room for a lengthened booking and a second one');
  const day = openDays[0];

  const first = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      date: day.date,
      time: day.slots[0],
      customerName: 'Edit Test',
      customerPhone: '+37400080003',
      items: [{ serviceId: zoneA.id }],
    }),
  });
  assert.equal(first.status, 201);
  createdBookingIds.push(first.body.id);

  // Adding a zone must lengthen the visit and raise the total.
  const widened = await adminApi(`/admin/bookings/${first.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ items: [{ serviceId: zoneA.id }, { serviceId: zoneB.id }] }),
  });
  assert.equal(widened.status, 200, `edit should succeed: ${JSON.stringify(widened.body)}`);
  assert.equal(widened.body.price_at_booking, zoneA.price_amd + zoneB.price_amd);
  const widenedMinutes = Math.round(
    (new Date(widened.body.end_time) - new Date(widened.body.start_time)) / 60000
  );
  assert.equal(widenedMinutes, zoneA.duration_minutes + zoneB.duration_minutes);
  assert.equal(
    widened.body.start_time,
    first.body.startTime,
    'an edit that only changes zones must not move the booking'
  );

  // A second booking later the same day, to try to collide with. Taken from a
  // fresh slot list so it can't land on top of the booking just widened.
  const laterSlots = (await api(`/slots?durationMinutes=${zoneA.duration_minutes}`)).body.days.find(
    (d) => d.date === day.date
  );
  assert.ok(laterSlots?.slots.length > 0, 'need a second free start on the same day');
  const freeLater = laterSlots.slots[laterSlots.slots.length - 1];
  const second = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      date: day.date,
      time: freeLater,
      customerName: 'Edit Clash Test',
      customerPhone: '+37400080004',
      items: [{ serviceId: zoneA.id }],
    }),
  });
  assert.equal(second.status, 201);
  createdBookingIds.push(second.body.id);

  const clash = await adminApi(`/admin/bookings/${first.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ date: day.date, time: freeLater }),
  });
  assert.equal(clash.status, 409, 'moving a booking onto another one must be refused');
  assert.equal(clash.body.error, 'slot_taken');

  // …and the refused edit must have changed nothing.
  const after = await adminApi(`/admin/bookings?from=${day.date}&to=${day.date}`);
  const unchanged = after.body.find((b) => b.id === first.body.id);
  assert.equal(unchanged.start_time, first.body.startTime, 'a refused move must leave the booking where it was');
  assert.equal(unchanged.items.length, 2, 'a refused move must leave the zones alone');
});
