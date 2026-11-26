import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

let refreshPromise: Promise<string> | null = null;

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor - handle token refresh cleanly without concurrent rotation races
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isRefreshEndpoint = typeof originalRequest?.url === 'string' && originalRequest.url.includes('/auth/refresh-token');
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isRefreshEndpoint) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = (async () => {
            const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
            if (!refreshToken) throw new Error('No refresh token');
            const { data } = await axios.post(`${API_URL}/auth/refresh-token`, { refreshToken });
            if (!data?.success) throw new Error('Refresh failed');
            if (typeof window !== 'undefined') {
              localStorage.setItem('accessToken', data.data.accessToken);
              localStorage.setItem('refreshToken', data.data.refreshToken);
            }
            return data.data.accessToken as string;
          })().finally(() => {
            refreshPromise = null;
          });
        }
        const newAccessToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;

/**
 * Round USD monetary deltas cleanly to 2 decimals to prevent IEEE-754 overshoot
 * against backend payment balance validation.
 */
export function roundCurrency(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Convert vital-sign string inputs into an API payload while omitting blank
 * optional measurements instead of sending Number('') === 0.
 */
export function buildVitalSignsPayload(fields: {
  temperature?: string;
  bpSystolic?: string;
  bpDiastolic?: string;
  heartRate?: string;
  respiratoryRate?: string;
  oxygenSaturation?: string;
  weight?: string;
  height?: string;
  notes?: string;
}) {
  const payload: Record<string, number | string> = {};
  const numericKeys = [
    'temperature',
    'bpSystolic',
    'bpDiastolic',
    'heartRate',
    'respiratoryRate',
    'oxygenSaturation',
    'weight',
    'height',
  ] as const;
  for (const key of numericKeys) {
    const raw = fields[key]?.trim();
    if (raw) payload[key] = Number(raw);
  }
  if (fields.notes?.trim()) {
    payload.notes = fields.notes.trim();
  }
  return payload;
}

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
