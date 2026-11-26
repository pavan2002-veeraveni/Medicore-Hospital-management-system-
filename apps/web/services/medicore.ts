import api from '@/lib/api';

export const medicoreService = {
  // Auth & Profile
  getProfile: async () => (await api.get('/auth/profile')).data.data,

  // Patients
  getMyPatientProfile: async () => (await api.get('/patients/me')).data.data,
  getPatients: async (params?: Record<string, any>) => (await api.get('/patients', { params })).data,
  searchPatients: async (q: string) => (await api.get('/patients/search', { params: { q } })).data.data,
  createPatient: async (payload: any) => (await api.post('/patients', payload)).data.data,
  updatePatient: async (id: string, payload: any) => (await api.put(`/patients/${id}`, payload)).data.data,

  // Staff & Departments
  getDoctors: async (params?: Record<string, any>) => (await api.get('/staff/doctors', { params })).data,
  getStaff: async (params?: Record<string, any>) => (await api.get('/staff', { params })).data,
  getDepartments: async (params?: Record<string, any>) => (await api.get('/departments', { params })).data,
  createDepartment: async (payload: any) => (await api.post('/departments', payload)).data.data,

  // Appointments
  getAppointments: async (params?: Record<string, any>) => (await api.get('/appointments', { params })).data,
  getAvailableSlots: async (doctorId: string, date: string) =>
    (await api.get('/appointments/available-slots', { params: { doctorId, date } })).data.data,
  bookAppointment: async (payload: any) => (await api.post('/appointments', payload)).data.data,
  transitionAppointment: async (id: string, action: string, body?: any) =>
    (await api.patch(`/appointments/${id}/${action}`, body || {})).data.data,

  // Encounters, Vitals, Diagnoses
  getEncounters: async (params?: Record<string, any>) => (await api.get('/encounters', { params })).data,
  createEncounter: async (payload: any) => (await api.post('/encounters', payload)).data.data,
  recordVitals: async (encounterId: string, payload: any) =>
    (await api.post(`/encounters/${encounterId}/vitals`, payload)).data.data,
  completeEncounter: async (encounterId: string) =>
    (await api.patch(`/encounters/${encounterId}/complete`)).data.data,
  addDiagnosis: async (payload: any) => (await api.post('/diagnoses', payload)).data.data,

  // Prescriptions & Medications
  getMedications: async (search?: string) =>
    (await api.get('/prescriptions/medications', { params: { search } })).data.data,
  getPrescriptions: async (params?: Record<string, any>) => (await api.get('/prescriptions', { params })).data,
  createPrescription: async (payload: any) => (await api.post('/prescriptions', payload)).data.data,
  updatePrescriptionStatus: async (id: string, status: string) =>
    (await api.patch(`/prescriptions/${id}/status`, { status })).data.data,

  // Laboratories
  getLabTests: async (params?: Record<string, any>) => (await api.get('/laboratories', { params })).data,
  getLabOrders: async (params?: Record<string, any>) => (await api.get('/lab-orders', { params })).data,
  getLabResults: async (params?: Record<string, any>) => (await api.get('/lab-results', { params })).data,
  createLabOrder: async (payload: any) => (await api.post('/lab-orders', payload)).data.data,
  collectSpecimens: async (orderId: string) => (await api.post(`/lab-orders/${orderId}/collect`, {})).data.data,
  recordLabResult: async (orderId: string, payload: any) =>
    (await api.post(`/lab-orders/${orderId}/results`, payload)).data.data,
  validateLabResult: async (resultId: string) =>
    (await api.patch(`/lab-orders/results/${resultId}/validate`)).data.data,

  // Billing & Payments
  getInvoices: async (params?: Record<string, any>) => (await api.get('/billing', { params })).data,
  createInvoice: async (payload: any) => (await api.post('/billing', payload)).data.data,
  issueInvoice: async (id: string) => (await api.patch(`/billing/${id}/issue`, {})).data.data,
  getPayments: async (params?: Record<string, any>) => (await api.get('/payments', { params })).data,
  recordPayment: async (payload: any) => (await api.post('/payments', payload)).data.data,

  // Consents
  getConsents: async (params?: Record<string, any>) => (await api.get('/consents', { params })).data,
  grantConsent: async (payload: any) => (await api.post('/consents', payload)).data.data,
  revokeConsent: async (id: string, reason: string) =>
    (await api.patch(`/consents/${id}/revoke`, { reason })).data.data,

  // Admin: Users & Audit
  getUsers: async (params?: Record<string, any>) => (await api.get('/users', { params })).data,
  updateUser: async (id: string, payload: any) => (await api.put(`/users/${id}`, payload)).data.data,
  deactivateUser: async (id: string) => (await api.patch(`/users/${id}/deactivate`)).data.data,
  getAuditLogs: async (params?: Record<string, any>) => (await api.get('/audit-logs', { params })).data,

  // Notifications
  getNotifications: async (params?: Record<string, any>) => (await api.get('/notifications', { params })).data,
  getUnreadCount: async () => (await api.get('/notifications/unread-count')).data.data,
  markNotificationRead: async (id: string) => (await api.patch(`/notifications/${id}/read`)).data.data,
  markAllNotificationsRead: async () => (await api.patch('/notifications/read-all')).data.data,

  // Health & Analytics
  getApiHealth: async () => {
    const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace('/api/v1', '');
    const res = await fetch(`${base}/health`);
    return res.json();
  },
  getAnalyticsUtilization: async () =>
    (await api.get('/analytics/appointment-utilization')).data.data,
  getAnalyticsWaitTimes: async () =>
    (await api.get('/analytics/waiting-times')).data.data,
};
