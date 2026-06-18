import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

const api = axios.create({
  baseURL:         '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request: attach access token ──────────────────────────────────
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response: auto-refresh on 401 ────────────────────────────────
let refreshing = false;
let queue = [];

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      if (refreshing) {
        return new Promise((resolve, reject) =>
          queue.push({ resolve, reject })
        ).then(() => api(original)).catch((e) => Promise.reject(e));
      }
      original._retry = true;
      refreshing = true;
      try {
        const { data } = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true });
        useAuthStore.getState().setToken(data.data.accessToken);
        queue.forEach(({ resolve }) => resolve());
        queue = [];
        return api(original);
      } catch {
        queue.forEach(({ reject }) => reject(err));
        queue = [];
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(err);
      } finally {
        refreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Auth ─────────────────────────────────────────────────────────
export const authApi = {
  register:       (data)  => api.post('/auth/register', data),
  login:          (data)  => api.post('/auth/login', data),
  logout:         ()      => api.post('/auth/logout'),
  me:             ()      => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword:  (data)  => api.post('/auth/reset-password', data),
  changePassword: (data)  => api.patch('/auth/change-password', data),
  verifyEmail:    (token) => api.post('/auth/verify-email', { token }),
};

// ── Assessments ───────────────────────────────────────────────────
export const assessmentApi = {
  getQuestions:     (params) => api.get('/assessments/questions', { params }),
  start:            (data)   => api.post('/assessments/start', data),
  submitResponse:   (id, data) => api.patch(`/assessments/${id}/answer`, data),
  submit:           (id)     => api.post(`/assessments/${id}/submit`),
  getOne:           (id)     => api.get(`/assessments/${id}`),
  getMy:            (params) => api.get('/assessments/my', { params }),
  retryScoring:     (id)     => api.post(`/assessments/${id}/retry-scoring`),
};

// ── Reports ───────────────────────────────────────────────────────
export const reportApi = {
  getMy:          (params) => api.get('/reports/my', { params }),
  getOne:         (id)     => api.get(`/reports/${id}`),
  getPdfUrl:      (id)     => api.get(`/reports/${id}/pdf`),
  updateVisibility:(id, v) => api.patch(`/reports/${id}/visibility`, { visibility: v }),
  addAnnotation:  (id, d)  => api.post(`/reports/${id}/annotations`, d),
  anchor:         (id)     => api.post(`/reports/${id}/anchor`),
  verify:         (id, h)  => api.get(`/reports/${id}/verify`, { params: { hash: h } }),
};

// ── Permissions ───────────────────────────────────────────────────
export const permissionApi = {
  grant:          (reportId, data) => api.post(`/permissions/report/${reportId}`, data),
  revoke:         (id, reason)     => api.delete(`/permissions/${id}`, { data: { reason } }),
  listForReport:  (reportId)       => api.get(`/permissions/report/${reportId}`),
  sharedWithMe:   ()               => api.get('/permissions/shared-with-me'),
  update:         (id, data)       => api.patch(`/permissions/${id}`, data),
};

// ── Dashboard ─────────────────────────────────────────────────────
export const dashboardApi = {
  get:   () => api.get('/dashboard'),
  trends:(params) => api.get('/dashboard/trends', { params }),
};

// ── Notifications ──────────────────────────────────────────────────
export const notificationApi = {
  getAll:     (params) => api.get('/notifications', { params }),
  markRead:   (id)     => api.patch(`/notifications/${id}/read`),
  markAllRead:()       => api.patch('/notifications/read-all'),
  dismiss:    (id)     => api.patch(`/notifications/${id}/dismiss`),
};

// ── Users ────────────────────────────────────────────────────────
export const userApi = {
  getMe:         ()     => api.get('/users/me'),
  updateProfile: (data) => api.patch('/users/me', data),
};
