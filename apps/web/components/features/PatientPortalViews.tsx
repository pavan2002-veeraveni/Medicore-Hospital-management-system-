'use client';

import { buildAppointmentIdempotencyKey, getApiErrorMessage } from '@/lib/api';

import React, { useState } from 'react';
import { Calendar, FileText, FlaskConical, Receipt, ShieldCheck, Plus, XCircle } from 'lucide-react';
import {
  useAppointments,
  useAvailableSlots,
  useBookAppointment,
  useAppointmentAction,
  useConsents,
  useDoctors,
  useInvoices,
  useLabResults,
  useMyPatient,
  usePrescriptions,
  useProfile,
} from '@/hooks/useMedicore';
import { medicoreService } from '@/services/medicore';
import { useQueryClient } from '@tanstack/react-query';
import {
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Modal,
  StatCard,
  StatusBadge,
} from '@/components/ui/primitives';

export function PatientDashboardView() {
  const { data: profile } = useProfile();
  const { data: patient } = useMyPatient();
  const { data: apptsRes, isLoading: loadingAppts, error: apptsErr, refetch: refetchAppts } = useAppointments({ limit: 10 });
  const { data: rxRes } = usePrescriptions({ limit: 5 });
  const { data: labRes } = useLabResults({ limit: 5 });
  const { data: invRes } = useInvoices({ limit: 5 });
  const [bookingOpen, setBookingOpen] = useState(false);

  const appointments = apptsRes?.data || [];
  const prescriptions = rxRes?.data || [];
  const labResults = labRes?.data || [];
  const invoices = invRes?.data || [];
  const outstanding = invoices
    .filter((i: any) => i.status !== 'PAID' && i.status !== 'CANCELLED')
    .reduce((sum: number, i: any) => sum + Math.max(0, (i.totalAmount || 0) - (i.paidAmount || 0)), 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {profile?.firstName || 'Patient'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {patient?.registrationNumber ? `Registration #${patient.registrationNumber} • ` : ''}
            Synthetic Patient Care Portal
          </p>
        </div>
        <Button onClick={() => setBookingOpen(true)}>
          <Plus className="h-4 w-4" /> Book Appointment
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Calendar} label="Appointments" value={apptsRes?.meta?.total ?? appointments.length} color="bg-sky-500" />
        <StatCard icon={FileText} label="Prescriptions" value={rxRes?.meta?.total ?? prescriptions.length} color="bg-teal-500" />
        <StatCard icon={FlaskConical} label="Lab Results" value={labRes?.meta?.total ?? labResults.length} color="bg-amber-500" />
        <StatCard icon={Receipt} label="Outstanding Balance" value={`$${outstanding.toFixed(2)}`} color="bg-rose-500" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming & Recent Appointments</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingAppts ? (
            <LoadingSkeleton rows={3} />
          ) : apptsErr ? (
            <ErrorState message="Could not load appointments" onRetry={() => refetchAppts()} />
          ) : appointments.length === 0 ? (
            <EmptyState title="No appointments yet" description="Book an appointment with one of our doctors." />
          ) : (
            <div className="space-y-3">
              {appointments.slice(0, 5).map((apt: any) => (
                <div key={apt.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 hover:bg-gray-50">
                  <div>
                    <p className="font-medium text-gray-900">
                      Dr. {apt.doctor?.user?.firstName} {apt.doctor?.user?.lastName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {apt.doctor?.department?.name || 'General'} • {apt.type}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(apt.scheduledStart).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(apt.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <StatusBadge status={apt.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <BookAppointmentModal open={bookingOpen} onClose={() => setBookingOpen(false)} patientId={patient?.id} />
    </div>
  );
}

export function BookAppointmentModal({
  open,
  onClose,
  patientId,
}: {
  open: boolean;
  onClose: () => void;
  patientId?: string;
}) {
  const { data: doctorsRes } = useDoctors();
  const doctors = doctorsRes?.data || [];
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [selectedSlot, setSelectedSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const { data: slots, isLoading: loadingSlots } = useAvailableSlots(doctorId, date);
  const bookMutation = useBookAppointment();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!patientId) {
      setError('Patient profile is required before booking.');
      return;
    }
    if (!selectedSlot) {
      setError('Please select an available time slot.');
      return;
    }
    try {
      await bookMutation.mutateAsync({
        patientId,
        doctorId,
        scheduledStart: selectedSlot.startTime,
        scheduledEnd: selectedSlot.endTime,
        type: 'CONSULTATION',
        reason: reason.trim() || 'Scheduled consultation',
        idempotencyKey: buildAppointmentIdempotencyKey(patientId, doctorId, selectedSlot.startTime),
      });
      onClose();
      setSelectedSlot(null);
      setReason('');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Booking failed'));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Book Appointment">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorState message={error} />}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Doctor</label>
          <select
            value={doctorId}
            onChange={(e) => {
              setDoctorId(e.target.value);
              setSelectedSlot(null);
            }}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Choose a doctor...</option>
            {doctors.map((d: any) => (
              <option key={d.id} value={d.id}>
                Dr. {d.user?.firstName} {d.user?.lastName} ({d.specialization || d.department?.name})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Date (UTC)</label>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSelectedSlot(null);
            }}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {doctorId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Available Slots</label>
            {loadingSlots ? (
              <LoadingSkeleton rows={2} />
            ) : !slots || slots.length === 0 ? (
              <p className="text-xs text-gray-500">No available slots on this date.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                {slots.map((s: any) => {
                  const active = selectedSlot?.startTime === s.startTime;
                  return (
                    <button
                      type="button"
                      key={s.startTime}
                      onClick={() => setSelectedSlot(s)}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                        active ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {new Date(s.startTime).toISOString().slice(11, 16)} UTC
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Visit</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Brief description..."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={bookMutation.isPending}>
            Confirm Request
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function PatientAppointmentsView() {
  const { data: patient } = useMyPatient();
  const { data, isLoading, error, refetch } = useAppointments({ limit: 50 });
  const actionMutation = useAppointmentAction();
  const [bookingOpen, setBookingOpen] = useState(false);

  const appointments = data?.data || [];

  const handleCancel = async (id: string) => {
    await actionMutation.mutateAsync({ id, action: 'cancel', body: { reason: 'Cancelled by patient' } });
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/patient/dashboard' }, { label: 'Appointments' }]} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Appointments</h1>
        <Button onClick={() => setBookingOpen(true)}>
          <Plus className="h-4 w-4" /> Book Appointment
        </Button>
      </div>
      <Card>
        <CardContent>
          {isLoading ? (
            <LoadingSkeleton />
          ) : error ? (
            <ErrorState onRetry={() => refetch()} />
          ) : appointments.length === 0 ? (
            <EmptyState title="No appointments found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Doctor</th>
                    <th className="pb-3 font-medium">Date & Time</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {appointments.map((a: any) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="py-3 font-medium">
                        Dr. {a.doctor?.user?.firstName} {a.doctor?.user?.lastName}
                      </td>
                      <td className="py-3 text-gray-600">{new Date(a.scheduledStart).toLocaleString()}</td>
                      <td className="py-3 text-gray-600">{a.type}</td>
                      <td className="py-3"><StatusBadge status={a.status} /></td>
                      <td className="py-3 text-right">
                        {(a.status === 'REQUESTED' || a.status === 'CONFIRMED') && (
                          <Button size="sm" variant="outline" onClick={() => handleCancel(a.id)} loading={actionMutation.isPending}>
                            <XCircle className="h-3.5 w-3.5 text-red-600" /> Cancel
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <BookAppointmentModal open={bookingOpen} onClose={() => setBookingOpen(false)} patientId={patient?.id} />
    </div>
  );
}

export function PatientRecordsAndConsentsView() {
  const { data: patient } = useMyPatient();
  const { data: consentsRes, isLoading, refetch } = useConsents({ limit: 20 });
  const qc = useQueryClient();
  const [category, setCategory] = useState('DATA_SHARING');
  const [purpose, setPurpose] = useState('FHIR interoperability exchange');

  const consents = consentsRes?.data || [];

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient?.id) return;
    await medicoreService.grantConsent({ patientId: patient.id, category, purpose });
    qc.invalidateQueries({ queryKey: ['consents'] });
    refetch();
  };

  const handleRevoke = async (id: string) => {
    await medicoreService.revokeConsent(id, 'Revoked via patient portal');
    qc.invalidateQueries({ queryKey: ['consents'] });
    refetch();
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/patient/dashboard' }, { label: 'Records & Consent' }]} />
      <h1 className="text-2xl font-bold text-gray-900">Medical Records & Consent Preferences</h1>

      {patient && (
        <Card>
          <CardHeader><CardTitle>Clinical Summary</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
            <div><span className="text-gray-500">Registration #:</span> <span className="font-medium">{patient.registrationNumber}</span></div>
            <div><span className="text-gray-500">Blood Type:</span> <span className="font-medium">{patient.bloodType || 'Not recorded'}</span></div>
            <div><span className="text-gray-500">Gender:</span> <span className="font-medium">{patient.gender}</span></div>
            <div className="sm:col-span-3"><span className="text-gray-500">Allergies:</span> <span className="font-medium">{patient.allergies || 'None recorded'}</span></div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-teal-600" /> Consent Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleGrant} className="grid gap-3 sm:grid-cols-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="TREATMENT">Treatment</option>
                <option value="DATA_SHARING">Data Sharing (FHIR)</option>
                <option value="RESEARCH">Research (Synthetic)</option>
                <option value="COMMUNICATION">Communication</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Purpose</label>
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
            <Button type="submit">Grant Consent</Button>
          </form>

          {isLoading ? (
            <LoadingSkeleton rows={2} />
          ) : consents.length === 0 ? (
            <EmptyState title="No consent records" />
          ) : (
            <div className="divide-y rounded-lg border">
              {consents.map((c: any) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{c.category} — {c.purpose}</p>
                    <p className="text-xs text-gray-500">Granted {new Date(c.grantedAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={c.status} />
                    {c.status === 'GRANTED' && (
                      <Button size="sm" variant="danger" onClick={() => handleRevoke(c.id)}>Revoke</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function PatientPrescriptionsView() {
  const { data, isLoading, error, refetch } = usePrescriptions({ limit: 20 });
  const list = data?.data || [];
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/patient/dashboard' }, { label: 'Prescriptions' }]} />
      <h1 className="text-2xl font-bold text-gray-900">My Prescriptions</h1>
      <Card>
        <CardContent>
          {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : list.length === 0 ? <EmptyState title="No prescriptions" /> : (
            <div className="divide-y">
              {list.map((rx: any) => (
                <div key={rx.id} className="py-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">Prescribed {new Date(rx.prescribedAt).toLocaleDateString()}</p>
                    <StatusBadge status={rx.status} />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(rx.items || []).map((item: any) => (
                      <div key={item.id} className="rounded-lg bg-gray-50 p-3 text-xs">
                        <p className="font-semibold text-gray-900">{item.medication?.name}</p>
                        <p className="text-gray-600">{item.dosage} • {item.frequency} • {item.duration}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function PatientLabResultsView() {
  const { data, isLoading, error, refetch } = useLabResults({ limit: 20 });
  const list = data?.data || [];
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/patient/dashboard' }, { label: 'Lab Results' }]} />
      <h1 className="text-2xl font-bold text-gray-900">Laboratory Results</h1>
      <Card>
        <CardContent>
          {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : list.length === 0 ? <EmptyState title="No lab results yet" /> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500"><th className="pb-3">Test</th><th className="pb-3">Value</th><th className="pb-3">Reference</th><th className="pb-3">Flag</th><th className="pb-3">Validated</th></tr></thead>
              <tbody className="divide-y">
                {list.map((r: any) => (
                  <tr key={r.id}>
                    <td className="py-3 font-medium">{r.labOrderItem?.test?.name || 'Lab Test'}</td>
                    <td className="py-3">{r.value} {r.unit}</td>
                    <td className="py-3 text-gray-500">{r.referenceRange || '-'}</td>
                    <td className="py-3">{r.isAbnormal ? <StatusBadge status={r.abnormalFlag || 'HIGH'} /> : <span className="text-emerald-600 text-xs font-medium">Normal</span>}</td>
                    <td className="py-3 text-xs text-gray-500">{r.validatedAt ? new Date(r.validatedAt).toLocaleDateString() : 'Pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function PatientBillingView() {
  const { data, isLoading, error, refetch } = useInvoices({ limit: 20 });
  const invoices = data?.data || [];
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/patient/dashboard' }, { label: 'Billing' }]} />
      <h1 className="text-2xl font-bold text-gray-900">Invoices & Billing</h1>
      <Card>
        <CardContent>
          {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : invoices.length === 0 ? <EmptyState title="No invoices found" /> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500"><th className="pb-3">Invoice #</th><th className="pb-3">Total</th><th className="pb-3">Paid</th><th className="pb-3">Status</th><th className="pb-3">Date</th></tr></thead>
              <tbody className="divide-y">
                {invoices.map((inv: any) => (
                  <tr key={inv.id}>
                    <td className="py-3 font-mono">{inv.invoiceNumber}</td>
                    <td className="py-3 font-medium">${Number(inv.totalAmount).toFixed(2)}</td>
                    <td className="py-3 text-gray-600">${Number(inv.paidAmount).toFixed(2)}</td>
                    <td className="py-3"><StatusBadge status={inv.status} /></td>
                    <td className="py-3 text-gray-500">{new Date(inv.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function PatientProfileView() {
  const { data: user } = useProfile();
  const { data: patient } = useMyPatient();
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/patient/dashboard' }, { label: 'Profile' }]} />
      <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
      <Card>
        <CardHeader><CardTitle>Account & Demographics</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
          <div><p className="text-gray-500">Full Name</p><p className="font-medium">{user?.firstName} {user?.lastName}</p></div>
          <div><p className="text-gray-500">Email</p><p className="font-medium">{user?.email}</p></div>
          <div><p className="text-gray-500">Phone</p><p className="font-medium">{user?.phone || '-'}</p></div>
          <div><p className="text-gray-500">Registration Number</p><p className="font-medium">{patient?.registrationNumber || 'Pending registration'}</p></div>
          <div><p className="text-gray-500">Address</p><p className="font-medium">{patient?.address ? `${patient.address}, ${patient.city || ''}` : '-'}</p></div>
          <div><p className="text-gray-500">Date of Birth</p><p className="font-medium">{patient?.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : '-'}</p></div>
        </CardContent>
      </Card>
    </div>
  );
}
