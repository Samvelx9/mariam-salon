const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `request_failed_${status}`);
    this.status = status;
    this.code = body?.error;
    this.body = body;
  }
}

let authToken = null;
export function setAuthToken(token) {
  authToken = token;
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
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
  login: (username, password) =>
    request('/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  getProfile: () => request('/admin/profile'),
  updateProfile: (payload) =>
    request('/admin/profile', { method: 'PUT', body: JSON.stringify(payload) }),

  // The photo goes up as a raw body typed by the file itself — not JSON and
  // not multipart (the endpoint takes one file and nothing else).
  uploadPhoto: (file) =>
    request('/admin/profile/photo', {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    }),
  deletePhoto: () => request('/admin/profile/photo', { method: 'DELETE' }),
  photoUrl: (version) => `${API_BASE}/profile/photo?v=${version}`,

  getCategories: () => request('/admin/categories'),
  createCategory: (payload) =>
    request('/admin/categories', { method: 'POST', body: JSON.stringify(payload) }),
  updateCategory: (id, payload) =>
    request(`/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteCategory: (id) => request(`/admin/categories/${id}`, { method: 'DELETE' }),

  getServices: () => request('/admin/services'),
  createService: (payload) =>
    request('/admin/services', { method: 'POST', body: JSON.stringify(payload) }),
  updateService: (id, payload) =>
    request(`/admin/services/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteService: (id) => request(`/admin/services/${id}`, { method: 'DELETE' }),

  getWeeklyHours: () => request('/admin/availability/weekly'),
  updateWeeklyHours: (dayOfWeek, payload) =>
    request(`/admin/availability/weekly/${dayOfWeek}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  getBlocks: (from, to) => request(`/admin/availability/blocks?from=${from}&to=${to}`),
  createBlock: (payload) =>
    request('/admin/availability/blocks', { method: 'POST', body: JSON.stringify(payload) }),
  deleteBlock: (id) => request(`/admin/availability/blocks/${id}`, { method: 'DELETE' }),

  getBookings: ({ from, to, status } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (status) params.set('status', status);
    const qs = params.toString();
    return request(`/admin/bookings${qs ? `?${qs}` : ''}`);
  },
  updateBookingStatus: (id, status) =>
    request(`/admin/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  getExpenses: ({ from, to, category } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (category) params.set('category', category);
    const qs = params.toString();
    return request(`/admin/expenses${qs ? `?${qs}` : ''}`);
  },
  getExpenseCategories: () => request('/admin/expenses/categories'),
  createExpense: (payload) =>
    request('/admin/expenses', { method: 'POST', body: JSON.stringify(payload) }),

  getFinancials: ({ from, to } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return request(`/admin/financials${qs ? `?${qs}` : ''}`);
  },
};

export { ApiError };
