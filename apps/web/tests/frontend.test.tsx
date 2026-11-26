import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from '@/app/(auth)/login/page';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { StatusBadge, EmptyState, ErrorState } from '@/components/ui/primitives';
import { PatientDashboardView } from '@/components/features/PatientPortalViews';
import { Calendar, Home } from 'lucide-react';
import { medicoreService } from '@/services/medicore';
import {
  buildAppointmentIdempotencyKey,
  buildVitalSignsPayload,
  getApiErrorMessage,
  roundCurrency,
} from '@/lib/api';
import { ToastProvider, useToast } from '@/components/ui/toaster';

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('MediCore Frontend Component & Role Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders StatusBadge, EmptyState, and ErrorState with retry', () => {
    const onRetry = vi.fn();
    render(
      <div>
        <StatusBadge status="SPECIMEN_COLLECTED" />
        <EmptyState title="Nothing here" />
        <ErrorState message="Load failed" onRetry={onRetry} />
      </div>
    );
    expect(screen.getByText('SPECIMEN COLLECTED')).toBeInTheDocument();
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Load failed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('handles login form submission and displays safe error on invalid credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      json: async () => ({ success: false, message: 'Invalid email or password' }),
    } as any);

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('you@medicore.local'), {
      target: { value: 'patient1@medicore.local' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
      target: { value: 'WrongPass!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
    });
  });

  it('blocks unauthorized role in DashboardLayout and renders allowed role navigation', async () => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 'u-1', email: 'pat@m.local', firstName: 'Alice', lastName: 'J', roles: ['PATIENT'] })
    );
    vi.spyOn(medicoreService, 'getUnreadCount').mockResolvedValue({ unreadCount: 2 });
    vi.spyOn(medicoreService, 'getNotifications').mockResolvedValue({ data: [] });

    const nav = [
      { href: '/patient/dashboard', label: 'Dashboard', icon: Home },
      { href: '/patient/appointments', label: 'Appointments', icon: Calendar },
    ];

    const { rerender } = renderWithQuery(
      <DashboardLayout role="DOCTOR" navItems={nav}>
        <div>Doctor Secret Area</div>
      </DashboardLayout>
    );
    expect(screen.queryByText('Doctor Secret Area')).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <DashboardLayout role="PATIENT" navItems={nav}>
          <div>Patient Workspace</div>
        </DashboardLayout>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Patient Workspace')).toBeInTheDocument();
      expect(screen.getByText('PATIENT PORTAL')).toBeInTheDocument();
    });
  });

  it('renders PatientDashboardView with live API data from medicoreService', async () => {
    vi.spyOn(medicoreService, 'getProfile').mockResolvedValue({ firstName: 'Alice', lastName: 'Johnson' });
    vi.spyOn(medicoreService, 'getMyPatientProfile').mockResolvedValue({ id: 'p-1', registrationNumber: 'MED-000001' });
    vi.spyOn(medicoreService, 'getAppointments').mockResolvedValue({
      data: [
        {
          id: 'apt-1',
          scheduledStart: '2026-11-30T10:00:00Z',
          type: 'CONSULTATION',
          status: 'CONFIRMED',
          doctor: { user: { firstName: 'John', lastName: 'Smith' }, department: { name: 'Cardiology' } },
        },
      ],
      meta: { total: 1 },
    });
    vi.spyOn(medicoreService, 'getPrescriptions').mockResolvedValue({ data: [], meta: { total: 0 } });
    vi.spyOn(medicoreService, 'getLabResults').mockResolvedValue({ data: [], meta: { total: 0 } });
    vi.spyOn(medicoreService, 'getInvoices').mockResolvedValue({ data: [{ totalAmount: 175, paidAmount: 0, status: 'ISSUED' }], meta: { total: 1 } });

    renderWithQuery(<PatientDashboardView />);

    await waitFor(() => {
      expect(screen.getByText(/Welcome back, Alice/i)).toBeInTheDocument();
      expect(screen.getByText(/Dr. John Smith/i)).toBeInTheDocument();
      expect(screen.getByText('$175.00')).toBeInTheDocument();
    });
  });

  it('builds compact <=100-char idempotency keys and formats API validation details', () => {
    const patientUuid = 'a1b2c3d4-e5f6-4789-abcd-1234567890ef';
    const doctorUuid = 'ba155f50-d57b-4c17-ac5f-84d3489ac5d3';
    const slotStart = '2026-11-27T13:00:00.000Z';

    const key = buildAppointmentIdempotencyKey(patientUuid, doctorUuid, slotStart, 'attempt-01');
    expect(key).toBe('book-a1b2c3d4-ba155f50-2026-11-27T13:00-attempt-01');
    expect(key.length).toBeLessThanOrEqual(100);
    expect(buildAppointmentIdempotencyKey(patientUuid, doctorUuid, slotStart).length).toBeLessThanOrEqual(100);

    const formatted = getApiErrorMessage(
      {
        response: {
          data: {
            message: 'Request validation failed',
            error: { details: [{ message: 'Invalid slot' }, { message: 'Reason cannot be empty' }] },
          },
        },
      },
      'Booking failed'
    );
    expect(formatted).toBe('Request validation failed: Invalid slot, Reason cannot be empty');
    expect(getApiErrorMessage({}, 'Booking failed')).toBe('Booking failed');

    expect(roundCurrency(35.1 - 10.2)).toBe(24.9);
    expect(
      buildVitalSignsPayload({ temperature: '37.2', bpSystolic: '', weight: '72', notes: '  Stable  ' })
    ).toEqual({ temperature: 37.2, weight: 72, notes: 'Stable' });
  });

  it('provides working ToastContext through ToastProvider', () => {
    function Trigger() {
      const { toast } = useToast();
      return <button onClick={() => toast({ title: 'Saved', description: 'Vitals updated' })}>Fire Toast</button>;
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Fire Toast'));
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Vitals updated')).toBeInTheDocument();
  });
});
