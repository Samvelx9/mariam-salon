// In production this is expected to be same-origin behind a reverse proxy
// (Step 8); for local dev it points straight at the Express server.
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `request_failed_${status}`);
    this.status = status;
    this.code = body?.error;
    this.body = body;
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new ApiError(0, { error: 'network_error' });
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body;
}

export const api = {
  getServices: () => request('/services'),

  getSlots: (serviceId, { excludeBookingId } = {}) => {
    const query = excludeBookingId ? `?excludeBookingId=${excludeBookingId}` : '';
    return request(`/services/${serviceId}/slots${query}`);
  },

  createBooking: (payload) =>
    request('/bookings', { method: 'POST', body: JSON.stringify(payload) }),

  lookupBookings: (phone) =>
    request('/bookings/lookup', { method: 'POST', body: JSON.stringify({ phone }) }),

  cancelBooking: (id) => request(`/bookings/${id}/cancel`, { method: 'POST' }),

  rescheduleBooking: (id, payload) =>
    request(`/bookings/${id}/reschedule`, { method: 'POST', body: JSON.stringify(payload) }),
};

export { ApiError };
