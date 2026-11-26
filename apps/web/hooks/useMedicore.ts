'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { medicoreService } from '@/services/medicore';

export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: medicoreService.getProfile });
}

export function useMyPatient() {
  return useQuery({ queryKey: ['patient', 'me'], queryFn: medicoreService.getMyPatientProfile, retry: false });
}

export function usePatients(params?: Record<string, any>, enabled = true) {
  return useQuery({ queryKey: ['patients', params], queryFn: () => medicoreService.getPatients(params), enabled });
}

export function useDoctors() {
  return useQuery({ queryKey: ['doctors'], queryFn: () => medicoreService.getDoctors({ limit: 50 }) });
}

export function useDepartments() {
  return useQuery({ queryKey: ['departments'], queryFn: () => medicoreService.getDepartments({ limit: 50 }) });
}

export function useAppointments(params?: Record<string, any>) {
  return useQuery({ queryKey: ['appointments', params], queryFn: () => medicoreService.getAppointments(params) });
}

export function useAvailableSlots(doctorId: string, date: string) {
  return useQuery({
    queryKey: ['available-slots', doctorId, date],
    queryFn: () => medicoreService.getAvailableSlots(doctorId, date),
    enabled: Boolean(doctorId && date),
  });
}

export function useBookAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: medicoreService.bookAppointment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['available-slots'] });
    },
  });
}

export function useAppointmentAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: string; body?: any }) =>
      medicoreService.transitionAppointment(id, action, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['available-slots'] });
    },
  });
}

export function useEncounters(params?: Record<string, any>, enabled = true) {
  return useQuery({ queryKey: ['encounters', params], queryFn: () => medicoreService.getEncounters(params), enabled });
}

export function usePrescriptions(params?: Record<string, any>, enabled = true) {
  return useQuery({ queryKey: ['prescriptions', params], queryFn: () => medicoreService.getPrescriptions(params), enabled });
}

export function useMedications() {
  return useQuery({ queryKey: ['medications'], queryFn: () => medicoreService.getMedications() });
}

export function useLabTests() {
  return useQuery({ queryKey: ['lab-tests'], queryFn: () => medicoreService.getLabTests({ limit: 50 }) });
}

export function useLabOrders(params?: Record<string, any>, enabled = true) {
  return useQuery({ queryKey: ['lab-orders', params], queryFn: () => medicoreService.getLabOrders(params), enabled });
}

export function useLabResults(params?: Record<string, any>, enabled = true) {
  return useQuery({ queryKey: ['lab-results', params], queryFn: () => medicoreService.getLabResults(params), enabled });
}

export function useInvoices(params?: Record<string, any>, enabled = true) {
  return useQuery({ queryKey: ['invoices', params], queryFn: () => medicoreService.getInvoices(params), enabled });
}

export function useConsents(params?: Record<string, any>, enabled = true) {
  return useQuery({ queryKey: ['consents', params], queryFn: () => medicoreService.getConsents(params), enabled });
}

export function useUsers(params?: Record<string, any>, enabled = true) {
  return useQuery({ queryKey: ['users', params], queryFn: () => medicoreService.getUsers(params), enabled });
}

export function useAuditLogs(params?: Record<string, any>, enabled = true) {
  return useQuery({ queryKey: ['audit-logs', params], queryFn: () => medicoreService.getAuditLogs(params), enabled });
}

export function useNotifications() {
  return useQuery({ queryKey: ['notifications'], queryFn: () => medicoreService.getNotifications({ limit: 20 }) });
}

export function useUnreadNotificationCount() {
  return useQuery({ queryKey: ['notifications', 'unread'], queryFn: medicoreService.getUnreadCount, refetchInterval: 30000 });
}
