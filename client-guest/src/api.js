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
  getProfile: () => request('/profile'),

  // Mariam's photo is served as raw bytes, not JSON — callers need the URL,
  // not the body. `version` comes from the profile and busts the cache when
  // she uploads a new photo.
  photoUrl: (version) => `${API_BASE}/profile/photo?v=${version}`,

  getCategories: () => request('/categories'),

  getHours: () => request('/hours'),

  getServices: () => request('/services'),

  // `hours` only means anything for a treatment priced by the hour: it decides
  // how much room a start time needs.
  getSlots: (serviceId, { excludeBookingId, hours } = {}) => {
    const params = new URLSearchParams();
    if (excludeBookingId) params.set('excludeBookingId', excludeBookingId);
    if (hours) params.set('hours', hours);
    const query = params.toString();
    return request(`/services/${serviceId}/slots${query ? `?${query}` : ''}`);
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
