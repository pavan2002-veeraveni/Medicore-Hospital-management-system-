import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${API_URL}/auth/refresh-token`, { refreshToken });
        if (data.success) {
          localStorage.setItem('accessToken', data.data.accessToken);
          localStorage.setItem('refreshToken', data.data.refreshToken);
          originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
          return api(originalRequest);
        }
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        if (typeof window !== 'undefined') window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

/**
 * Build an idempotency key within the API's 100-char limit, scoped per patient,
 * doctor, UTC slot start time, and submission attempt (or explicit attemptId).
 */
export function buildAppointmentIdempotencyKey(
  patientId: string,
  doctorId: string,
  scheduledStart: string,
  attemptId?: string
): string {
  const nonce =
    attemptId ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 12)
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  return `book-${patientId.slice(0, 8)}-${doctorId.slice(0, 8)}-${scheduledStart.slice(0, 16)}-${nonce}`.slice(
    0,
    100
  );
}

/**
 * Extract a user-facing message from an Axios API error response, appending any
 * backend Zod validation detail messages when present.
 */
export function getApiErrorMessage(err: any, fallback = 'Request failed'): string {
  const details = Array.isArray(err?.response?.data?.error?.details)
    ? err.response.data.error.details
        .map((d: { message?: string }) => d?.message)
        .filter(Boolean)
        .join(', ')
    : '';
  const baseMsg = err?.response?.data?.message || fallback;
  return details ? `${baseMsg}: ${details}` : baseMsg;
}
