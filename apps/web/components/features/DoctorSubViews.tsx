'use client';

import React, { useEffect, useState } from 'react';
import {
  useAppointments,
  useAppointmentAction,
  useAvailableSlots,
  useDoctors,
  useEncounters,
  useLabOrders,
  useLabTests,
  useMedications,
  usePatients,
  usePrescriptions,
} from '@/hooks/useMedicore';
import { medicoreService } from '@/services/medicore';
import { getApiErrorMessage } from '@/lib/api';
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
  StatCard,
  StatusBadge,
} from '@/components/ui/primitives';
import { Calendar, Clock, FileText, FlaskConical, Heart, ClipboardList } from 'lucide-react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function DoctorAppointmentsView() {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const { data, isLoading, error, refetch } = useAppointments({
    limit: 50,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
  });
  const actionMutation = useAppointmentAction();
  const [errMsg, setErrMsg] = useState('');
  const appointments = data?.data || [];

  const handleAction = async (id: string, action: string, body?: any) => {
    setErrMsg('');
    try {
      await actionMutation.mutateAsync({ id, action, body });
    } catch (err: any) {
      setErrMsg(getApiErrorMessage(err, 'Action failed'));
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/doctor/dashboard' }, { label: 'Appointments' }]} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Doctor Appointments</h1>
          <p className="text-sm text-gray-500">Filter your queue and manage consultation workflow transitions</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border bg-white px-3 py-2 text-sm"
        >
          {['ALL', 'REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {errMsg && <ErrorState message={errMsg} />}

      <Card>
        <CardContent>
          {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : appointments.length === 0 ? <EmptyState title="No appointments match filter" /> : (
            <div className="divide-y">
              {appointments.map((apt: any) => (
                <div key={apt.id} className="flex flex-wrap items-center justify-between gap-4 py-3.5">
                  <div>
                    <p className="font-medium text-gray-900">
                      {apt.patient?.user?.firstName} {apt.patient?.user?.lastName}
                      <span className="ml-2 font-mono text-xs text-gray-500">{apt.patient?.registrationNumber}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(apt.scheduledStart).toLocaleString()} – {new Date(apt.scheduledEnd).toLocaleTimeString()} • {apt.type}
                    </p>
                    {apt.reason && <p className="text-xs text-gray-600 mt-0.5">{apt.reason}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={apt.status} />
                    {apt.status === 'REQUESTED' && (
                      <Button size="sm" onClick={() => handleAction(apt.id, 'confirm')}>Confirm</Button>
                    )}
                    {apt.status === 'CHECKED_IN' && (
                      <Button size="sm" onClick={() => handleAction(apt.id, 'start')}>Start Visit</Button>
                    )}
                    {apt.status === 'IN_PROGRESS' && (
                      <Button size="sm" variant="secondary" onClick={() => handleAction(apt.id, 'complete')}>Complete</Button>
                    )}
                    {['REQUESTED', 'CONFIRMED'].includes(apt.status) && (
                      <Button size="sm" variant="outline" onClick={() => handleAction(apt.id, 'cancel', { reason: 'Cancelled by doctor' })}>
                        Cancel
                      </Button>
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

export function DoctorPrescriptionsView() {
  const qc = useQueryClient();
  const { data: rxRes, isLoading, error, refetch } = usePrescriptions({ limit: 30 });
  const { data: encRes } = useEncounters({ status: 'IN_PROGRESS', limit: 30 });
  const { data: meds } = useMedications();

  const [encounterId, setEncounterId] = useState('');
  const [medId, setMedId] = useState('');
  const [dosage, setDosage] = useState('10mg');
  const [frequency, setFrequency] = useState('Once daily');
  const [duration, setDuration] = useState('30 days');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const prescriptions = rxRes?.data || [];
  const encounters = encRes?.data || [];

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErrMsg('');
    const enc = encounters.find((x: any) => x.id === encounterId);
    if (!enc) {
      setErrMsg('Please select an in-progress encounter');
      return;
    }
    try {
      await medicoreService.createPrescription({
        encounterId: enc.id,
        patientId: enc.patientId,
        notes: notes || undefined,
        items: [{ medicationId: medId, dosage, frequency, duration, quantity: 30 }],
      });
      setMsg('Prescription created successfully');
      setNotes('');
      qc.invalidateQueries({ queryKey: ['prescriptions'] });
    } catch (err: any) {
      setErrMsg(getApiErrorMessage(err, 'Failed to create prescription'));
    }
  };

  const handleStatus = async (id: string, status: string) => {
    setMsg('');
    setErrMsg('');
    try {
      await medicoreService.updatePrescriptionStatus(id, status);
      setMsg(`Prescription marked ${status.toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ['prescriptions'] });
    } catch (err: any) {
      setErrMsg(getApiErrorMessage(err, 'Failed to update prescription status'));
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/doctor/dashboard' }, { label: 'Prescriptions' }]} />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Prescriptions & Medication Orders</h1>
        <p className="text-sm text-gray-500">Issue medication orders linked to active encounters and manage dispensation status</p>
      </div>

      {msg && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">{msg}</div>}
      {errMsg && <ErrorState message={errMsg} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Issue Prescription</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleIssue} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Active Encounter</label>
                <select value={encounterId} onChange={(e) => setEncounterId(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="">Select in-progress encounter...</option>
                  {encounters.map((enc: any) => (
                    <option key={enc.id} value={enc.id}>
                      {enc.patient?.user?.firstName} {enc.patient?.user?.lastName} — {enc.chiefComplaint || enc.type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Medication</label>
                <select value={medId} onChange={(e) => setMedId(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="">Select medication...</option>
                  {(meds || []).map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.strength || m.form})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="Dosage" required className="rounded-lg border px-3 py-2 text-sm" />
                <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Duration" required className="rounded-lg border px-3 py-2 text-sm" />
              </div>
              <input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="Frequency" required className="w-full rounded-lg border px-3 py-2 text-sm" />
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instructions / clinical notes" className="w-full rounded-lg border px-3 py-2 text-sm" />
              <Button type="submit" className="w-full">Issue Prescription</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Issued Prescriptions</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : prescriptions.length === 0 ? <EmptyState title="No prescriptions yet" /> : (
              <div className="space-y-3">
                {prescriptions.map((rx: any) => (
                  <div key={rx.id} className="rounded-lg border p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900">{rx.patient?.user?.firstName} {rx.patient?.user?.lastName}</p>
                        <p className="text-xs text-gray-500">Prescribed {new Date(rx.prescribedAt).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={rx.status} />
                        {rx.status === 'ACTIVE' && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => handleStatus(rx.id, 'DISPENSED')}>Mark Dispensed</Button>
                            <Button size="sm" variant="outline" onClick={() => handleStatus(rx.id, 'CANCELLED')}>Cancel</Button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1 text-xs text-gray-700 bg-gray-50 rounded p-2.5">
                      {(rx.items || []).map((item: any) => (
                        <p key={item.id}>
                          <FileText className="inline h-3.5 w-3.5 mr-1 text-sky-600" />
                          <strong>{item.medication?.name}</strong> — {item.dosage}, {item.frequency} ({item.duration})
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function DoctorLabOrdersView() {
  const qc = useQueryClient();
  const { data: ordersRes, isLoading, error, refetch } = useLabOrders({ limit: 30 });
  const { data: patientsRes } = usePatients({ limit: 50 });
  const { data: encRes } = useEncounters({ status: 'IN_PROGRESS', limit: 30 });
  const { data: testsRes } = useLabTests();

  const [patientId, setPatientId] = useState('');
  const [encounterId, setEncounterId] = useState('');
  const [testId, setTestId] = useState('');
  const [priority, setPriority] = useState('ROUTINE');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const orders = ordersRes?.data || [];
  const patients = patientsRes?.data || [];
  const encounters = encRes?.data || [];
  const tests = testsRes?.data || [];

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErrMsg('');
    try {
      await medicoreService.createLabOrder({
        patientId,
        encounterId: encounterId || undefined,
        priority,
        clinicalNotes: notes || undefined,
        items: [{ testId }],
      });
      setMsg('Laboratory order submitted cleanly');
      setNotes('');
      qc.invalidateQueries({ queryKey: ['lab-orders'] });
    } catch (err: any) {
      setErrMsg(err?.response?.data?.message || 'Failed to submit lab order');
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/doctor/dashboard' }, { label: 'Lab Orders' }]} />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Doctor Laboratory Orders & Results</h1>
        <p className="text-sm text-gray-500">Order diagnostic investigations and review verified laboratory results</p>
      </div>

      {msg && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">{msg}</div>}
      {errMsg && <ErrorState message={errMsg} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>New Lab Order</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleOrder} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Patient</label>
                <select value={patientId} onChange={(e) => setPatientId(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="">Select patient...</option>
                  {patients.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.user?.firstName} {p.user?.lastName} ({p.registrationNumber})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Encounter (Optional)</label>
                <select value={encounterId} onChange={(e) => setEncounterId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="">None / Outpatient standalone</option>
                  {encounters.filter((enc: any) => !patientId || enc.patientId === patientId).map((enc: any) => (
                    <option key={enc.id} value={enc.id}>{enc.patient?.user?.firstName} — {enc.chiefComplaint || enc.type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Laboratory Test</label>
                <select value={testId} onChange={(e) => setTestId(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="">Select test...</option>
                  {tests.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="ROUTINE">ROUTINE</option>
                  <option value="URGENT">URGENT</option>
                  <option value="STAT">STAT</option>
                </select>
              </div>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical notes" className="w-full rounded-lg border px-3 py-2 text-sm" />
              <Button type="submit" className="w-full">Submit Lab Order</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Ordered Investigations</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : orders.length === 0 ? <EmptyState title="No lab orders placed" /> : (
              <div className="space-y-3">
                {orders.map((order: any) => (
                  <div key={order.id} className="rounded-lg border p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900">{order.patient?.user?.firstName} {order.patient?.user?.lastName}</p>
                        <p className="text-xs text-gray-500">Ordered {new Date(order.orderedAt).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={order.priority} />
                        <StatusBadge status={order.status} />
                      </div>
                    </div>
                    <div className="divide-y rounded bg-gray-50 px-3 text-xs">
                      {(order.items || []).map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between py-2">
                          <span className="font-medium flex items-center gap-1.5">
                            <FlaskConical className="h-3.5 w-3.5 text-teal-600" />
                            {item.test?.name} ({item.test?.code})
                          </span>
                          {item.result ? (
                            <span className="flex items-center gap-2">
                              <strong>{item.result.value}</strong>
                              {item.result.isAbnormal && <StatusBadge status={item.result.abnormalFlag || 'HIGH'} />}
                              {item.result.validatedAt && <StatusBadge status="COMPLETED" />}
                            </span>
                          ) : (
                            <StatusBadge status={item.status} />
                          )}
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
    </div>
  );
}

export function DoctorScheduleView() {
  const { data: doctorsRes, isLoading } = useDoctors();
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [currentUserId, setCurrentUserId] = useState('');

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      if (u?.id) setCurrentUserId(u.id);
    } catch {
      // Ignore parse errors
    }
  }, []);

  const doctors = doctorsRes?.data || [];
  const activeDoctor = doctors.find((d: any) => d.id === selectedDoctorId) || doctors.find((d: any) => d.userId === currentUserId) || doctors[0];

  const { data: slotsData, isLoading: loadingSlots } = useAvailableSlots(activeDoctor?.id || '', date);

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/doctor/dashboard' }, { label: 'My Schedule' }]} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Provider Schedule & Slot Availability</h1>
          <p className="text-sm text-gray-500">Weekly shift roster and real-time conflict-free slot inspector</p>
        </div>
        <select
          value={activeDoctor?.id || ''}
          onChange={(e) => setSelectedDoctorId(e.target.value)}
          className="rounded-lg border bg-white px-3 py-2 text-sm"
        >
          {doctors.map((d: any) => (
            <option key={d.id} value={d.id}>
              Dr. {d.user?.firstName} {d.user?.lastName} ({d.department?.name})
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Weekly Hours — {activeDoctor ? `Dr. ${activeDoctor.user?.firstName} ${activeDoctor.user?.lastName}` : 'Provider'}</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <LoadingSkeleton /> : !(activeDoctor?.schedules?.length) ? <EmptyState title="No schedule configured" /> : (
              <div className="divide-y text-sm">
                {activeDoctor.schedules.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between py-2.5">
                    <span className="font-medium text-gray-900">{DAYS[s.dayOfWeek] || `Day ${s.dayOfWeek}`}</span>
                    <span className="text-gray-600">{s.startTime} – {s.endTime} ({s.slotDuration} min slots)</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Slot Availability</CardTitle>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm" />
          </CardHeader>
          <CardContent>
            {loadingSlots ? <LoadingSkeleton rows={3} /> : !Array.isArray(slotsData) || slotsData.length === 0 ? (
              <EmptyState title="No slots generated for selected date" />
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slotsData.map((slot: any) => (
                  <div
                    key={slot.startTime}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-2 py-2 text-center text-xs"
                  >
                    <Clock className="inline h-3 w-3 mr-1" />
                    {new Date(slot.startTime).toISOString().slice(11, 16)} UTC
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function NurseVitalsView() {
  const { data: encRes, isLoading, error, refetch } = useEncounters({ limit: 30 });
  const [selectedEncId, setSelectedEncId] = useState('');
  const [temp, setTemp] = useState('36.8');
  const [sys, setSys] = useState('120');
  const [dia, setDia] = useState('80');
  const [hr, setHr] = useState('72');
  const [rr, setRr] = useState('16');
  const [spo2, setSpo2] = useState('98');
  const [weight, setWeight] = useState('70');
  const [height, setHeight] = useState('172');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const encounters = encRes?.data || [];
  const inProgress = encounters.filter((e: any) => e.status === 'IN_PROGRESS');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErrMsg('');
    if (!selectedEncId) {
      setErrMsg('Please select an in-progress encounter');
      return;
    }
    try {
      const payload: Record<string, any> = {};
      if (temp.trim()) payload.temperature = Number(temp);
      if (sys.trim()) payload.bpSystolic = Number(sys);
      if (dia.trim()) payload.bpDiastolic = Number(dia);
      if (hr.trim()) payload.heartRate = Number(hr);
      if (rr.trim()) payload.respiratoryRate = Number(rr);
      if (spo2.trim()) payload.oxygenSaturation = Number(spo2);
      if (weight.trim()) payload.weight = Number(weight);
      if (height.trim()) payload.height = Number(height);
      if (notes.trim()) payload.notes = notes.trim();
      const res = await medicoreService.recordVitals(selectedEncId, payload);
      setMsg(`Vital signs saved cleanly (BMI: ${res.bmi ?? 'N/A'})`);
      setNotes('');
      refetch();
    } catch (err: any) {
      setErrMsg(getApiErrorMessage(err, 'Failed to save vital signs'));
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/nurse/dashboard' }, { label: 'Vital Signs' }]} />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Vital Signs Station</h1>
        <p className="text-sm text-gray-500">Capture patient vitals with automatic BMI calculation and review historical observations</p>
      </div>

      {msg && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">{msg}</div>}
      {errMsg && <ErrorState message={errMsg} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Record Measurements</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Active Encounter</label>
                <select value={selectedEncId} onChange={(e) => setSelectedEncId(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="">Select active encounter...</option>
                  {inProgress.map((enc: any) => (
                    <option key={enc.id} value={enc.id}>{enc.patient?.user?.firstName} {enc.patient?.user?.lastName} — {enc.chiefComplaint || enc.type}</option>
                  ))}
                </select>
              </div>
              <div><label className="text-xs text-gray-600">Temp (°C)</label><input type="number" step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" /></div>
              <div><label className="text-xs text-gray-600">Heart Rate (bpm)</label><input type="number" value={hr} onChange={(e) => setHr(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" /></div>
              <div><label className="text-xs text-gray-600">BP Systolic</label><input type="number" value={sys} onChange={(e) => setSys(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" /></div>
              <div><label className="text-xs text-gray-600">BP Diastolic</label><input type="number" value={dia} onChange={(e) => setDia(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" /></div>
              <div><label className="text-xs text-gray-600">Resp Rate</label><input type="number" value={rr} onChange={(e) => setRr(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" /></div>
              <div><label className="text-xs text-gray-600">SpO₂ (%)</label><input type="number" step="0.1" value={spo2} onChange={(e) => setSpo2(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" /></div>
              <div><label className="text-xs text-gray-600">Weight (kg)</label><input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" /></div>
              <div><label className="text-xs text-gray-600">Height (cm)</label><input type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" /></div>
              <div className="col-span-2"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nursing triage note" className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
              <div className="col-span-2"><Button type="submit">Save Vital Signs</Button></div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recorded Encounter Vitals</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : encounters.length === 0 ? <EmptyState title="No encounters" /> : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {encounters.map((enc: any) => (
                  <div key={enc.id} className="rounded-lg border p-3.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-gray-900">{enc.patient?.user?.firstName} {enc.patient?.user?.lastName}</span>
                      <StatusBadge status={enc.status} />
                    </div>
                    {(enc.vitalSigns || []).length === 0 ? (
                      <p className="text-gray-400">No vital signs recorded yet</p>
                    ) : (
                      enc.vitalSigns.map((v: any) => (
                        <div key={v.id} className="rounded bg-gray-50 p-2 flex flex-wrap gap-3 text-gray-700">
                          <span><Heart className="inline h-3 w-3 text-rose-500 mr-1" />HR {v.heartRate ?? '-'}</span>
                          <span>BP {v.bloodPressureSystolic ?? '-'}/{v.bloodPressureDiastolic ?? '-'}</span>
                          <span>Temp {v.temperature ?? '-'}°C</span>
                          <span>SpO₂ {v.oxygenSaturation ?? '-'}%</span>
                          <span>BMI {v.bmi ?? '-'}</span>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function NurseTasksView() {
  const { data: apptsRes, isLoading, refetch } = useAppointments({ limit: 30 });
  const { data: encRes } = useEncounters({ status: 'IN_PROGRESS', limit: 30 });
  const { data: rxRes } = usePrescriptions({ status: 'ACTIVE', limit: 20 });

  const checkedIn = (apptsRes?.data || []).filter((a: any) => a.status === 'CHECKED_IN');
  const activeEncs = encRes?.data || [];
  const activeRx = rxRes?.data || [];

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/nurse/dashboard' }, { label: 'Care Tasks' }]} />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nursing Care Tasks & Triage Queue</h1>
        <p className="text-sm text-gray-500">Checked-in arrivals awaiting assessment and active medication orders</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Calendar} label="Checked-In Triage Queue" value={checkedIn.length} color="bg-amber-500" />
        <StatCard icon={Heart} label="In-Progress Encounters" value={activeEncs.length} color="bg-rose-500" />
        <StatCard icon={ClipboardList} label="Active Medications" value={activeRx.length} color="bg-teal-500" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Triage Arrival Queue (Checked In)</CardTitle><Button size="sm" variant="outline" onClick={() => refetch()}>Refresh</Button></CardHeader>
          <CardContent>
            {isLoading ? <LoadingSkeleton /> : checkedIn.length === 0 ? <EmptyState title="No patients waiting for triage" /> : (
              <div className="divide-y">
                {checkedIn.map((a: any) => (
                  <div key={a.id} className="py-3 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{a.patient?.user?.firstName} {a.patient?.user?.lastName}</p>
                      <p className="text-xs text-gray-500">Dr. {a.doctor?.user?.firstName} {a.doctor?.user?.lastName} • Checked in {a.checkedInAt ? new Date(a.checkedInAt).toLocaleTimeString() : 'Recently'}</p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Active Medications to Monitor</CardTitle></CardHeader>
          <CardContent>
            {activeRx.length === 0 ? <EmptyState title="No active prescriptions" /> : (
              <div className="divide-y text-sm">
                {activeRx.map((rx: any) => (
                  <div key={rx.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{rx.patient?.user?.firstName} {rx.patient?.user?.lastName}</span>
                      <StatusBadge status={rx.status} />
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {(rx.items || []).map((i: any) => `${i.medication?.name} (${i.dosage})`).join(', ')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
