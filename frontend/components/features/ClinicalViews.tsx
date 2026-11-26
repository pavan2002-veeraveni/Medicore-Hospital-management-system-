'use client';

import React, { useState } from 'react';
import { Calendar, Users, Stethoscope, FileText, FlaskConical, Heart, ClipboardList } from 'lucide-react';
import {
  useAppointments,
  useAppointmentAction,
  useEncounters,
  useLabOrders,
  useLabTests,
  useMedications,
  usePatients,
  usePrescriptions,
} from '@/hooks/useMedicore';
import { medicoreService } from '@/services/medicore';
import { buildVitalSignsPayload, getApiErrorMessage } from '@/lib/api';
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

export function DoctorDashboardView() {
  const { data: apptsRes, isLoading, error, refetch } = useAppointments({ limit: 20 });
  const { data: encRes } = useEncounters({ limit: 20 });
  const { data: labRes } = useLabOrders({ limit: 20 });
  const actionMutation = useAppointmentAction();
  const [actionErr, setActionErr] = useState('');

  const appointments = apptsRes?.data || [];
  const encounters = encRes?.data || [];
  const labOrders = labRes?.data || [];

  const handleAction = async (id: string, action: string) => {
    setActionErr('');
    try {
      await actionMutation.mutateAsync({ id, action });
    } catch (err: any) {
      setActionErr(getApiErrorMessage(err, 'Appointment update failed'));
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Doctor Dashboard</h1>
        <p className="text-sm text-gray-500">Assigned appointments, active encounters, and clinical orders</p>
      </div>

      {actionErr && <ErrorState message={actionErr} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Calendar} label="Appointments" value={apptsRes?.meta?.total ?? appointments.length} color="bg-sky-500" />
        <StatCard icon={Users} label="Checked-In Queue" value={appointments.filter((a: any) => a.status === 'CHECKED_IN').length} color="bg-teal-500" />
        <StatCard icon={FlaskConical} label="Lab Orders" value={labRes?.meta?.total ?? labOrders.length} color="bg-amber-500" />
        <StatCard icon={Stethoscope} label="Encounters" value={encRes?.meta?.total ?? encounters.length} color="bg-indigo-500" />
      </div>

      <Card>
        <CardHeader><CardTitle>Appointment Queue</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : appointments.length === 0 ? <EmptyState title="No appointments scheduled" /> : (
            <div className="divide-y">
              {appointments.map((apt: any) => (
                <div key={apt.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{apt.patient?.user?.firstName} {apt.patient?.user?.lastName}</p>
                    <p className="text-xs text-gray-500">{new Date(apt.scheduledStart).toLocaleString()} • {apt.type}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={apt.status} />
                    {apt.status === 'REQUESTED' && (
                      <Button size="sm" onClick={() => handleAction(apt.id, 'confirm')}>Confirm</Button>
                    )}
                    {apt.status === 'CHECKED_IN' && (
                      <Button size="sm" onClick={() => handleAction(apt.id, 'start')}>Start</Button>
                    )}
                    {apt.status === 'IN_PROGRESS' && (
                      <Button size="sm" variant="secondary" onClick={() => handleAction(apt.id, 'complete')}>Complete</Button>
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

export function ClinicalEncountersWorkbench() {
  const qc = useQueryClient();
  const { data: patientsRes } = usePatients({ limit: 50 });
  const { data: apptsRes } = useAppointments({ limit: 40 });
  const { data: encRes, isLoading, error, refetch } = useEncounters({ limit: 30 });
  const { data: meds } = useMedications();
  const { data: testsRes } = useLabTests();

  const [patientId, setPatientId] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [selectedEncounterId, setSelectedEncounterId] = useState('');
  const [diagCode, setDiagCode] = useState('I10');
  const [diagDesc, setDiagDesc] = useState('Essential hypertension (synthetic)');
  const [medId, setMedId] = useState('');
  const [dosage, setDosage] = useState('10mg');
  const [testId, setTestId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const patients = patientsRes?.data || [];
  const appointments = (apptsRes?.data || []).filter(
    (a: any) => ['CHECKED_IN', 'IN_PROGRESS'].includes(a.status) && (!patientId || a.patientId === patientId)
  );
  const encounters = encRes?.data || [];
  const tests = testsRes?.data || [];
  const selectedEnc = encounters.find((x: any) => x.id === selectedEncounterId);

  const handleCreateEncounter = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('');
    setErrMsg('');
    try {
      const enc = await medicoreService.createEncounter({
        patientId,
        appointmentId: appointmentId || undefined,
        type: 'OUTPATIENT',
        chiefComplaint,
      });
      setSelectedEncounterId(enc.id);
      setAppointmentId('');
      setChiefComplaint('');
      setFeedback('Encounter started');
      qc.invalidateQueries({ queryKey: ['encounters'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
    } catch (err: any) {
      setErrMsg(getApiErrorMessage(err, 'Failed to start encounter'));
    }
  };

  const handleCompleteEncounter = async (encId: string) => {
    setFeedback('');
    setErrMsg('');
    try {
      await medicoreService.completeEncounter(encId);
      if (selectedEncounterId === encId) setSelectedEncounterId('');
      setFeedback('Encounter completed');
      qc.invalidateQueries({ queryKey: ['encounters'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
    } catch (err: any) {
      setErrMsg(getApiErrorMessage(err, 'Failed to complete encounter'));
    }
  };

  const handleAddDiagnosis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEncounterId) return;
    setFeedback('');
    setErrMsg('');
    try {
      await medicoreService.addDiagnosis({ encounterId: selectedEncounterId, code: diagCode, description: diagDesc, type: 'PRIMARY' });
      setFeedback('Diagnosis recorded');
      refetch();
    } catch (err: any) {
      setErrMsg(getApiErrorMessage(err, 'Failed to record diagnosis'));
    }
  };

  const handlePrescribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const enc = encounters.find((x: any) => x.id === selectedEncounterId);
    if (!enc || !medId) return;
    setFeedback('');
    setErrMsg('');
    try {
      await medicoreService.createPrescription({
        encounterId: enc.id,
        patientId: enc.patientId,
        items: [{ medicationId: medId, dosage, frequency: 'Once daily', duration: '30 days', quantity: 30 }],
      });
      setFeedback('Prescription created');
      qc.invalidateQueries({ queryKey: ['prescriptions'] });
    } catch (err: any) {
      setErrMsg(getApiErrorMessage(err, 'Failed to create prescription'));
    }
  };

  const handleOrderLab = async (e: React.FormEvent) => {
    e.preventDefault();
    const enc = encounters.find((x: any) => x.id === selectedEncounterId);
    if (!enc || !testId) return;
    setFeedback('');
    setErrMsg('');
    try {
      await medicoreService.createLabOrder({ patientId: enc.patientId, encounterId: enc.id, items: [{ testId }], priority: 'ROUTINE' });
      setFeedback('Lab order submitted');
      qc.invalidateQueries({ queryKey: ['lab-orders'] });
    } catch (err: any) {
      setErrMsg(getApiErrorMessage(err, 'Failed to submit lab order'));
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/doctor/dashboard' }, { label: 'Encounters' }]} />
      <h1 className="text-2xl font-bold text-gray-900">Clinical Encounters Workbench</h1>
      {feedback && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">{feedback}</div>}
      {errMsg && <ErrorState message={errMsg} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Start New Encounter</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreateEncounter} className="space-y-3">
              <select value={patientId} onChange={(e) => { setPatientId(e.target.value); setAppointmentId(''); }} required className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="">Select patient...</option>
                {patients.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.user?.firstName} {p.user?.lastName} ({p.registrationNumber})</option>
                ))}
              </select>
              <select value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="">Optional: Link checked-in appointment...</option>
                {appointments.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.patient?.user?.firstName} {a.patient?.user?.lastName} — {new Date(a.scheduledStart).toLocaleString()}</option>
                ))}
              </select>
              <input value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} placeholder="Chief complaint" required className="w-full rounded-lg border px-3 py-2 text-sm" />
              <Button type="submit">Start Encounter</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Active & Recent Encounters</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <LoadingSkeleton rows={3} /> : error ? <ErrorState onRetry={() => refetch()} /> : encounters.length === 0 ? <EmptyState title="No encounters" /> : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {encounters.map((enc: any) => (
                  <div
                    key={enc.id}
                    onClick={() => enc.status === 'IN_PROGRESS' && setSelectedEncounterId(enc.id)}
                    className={`rounded-lg border p-3 text-sm flex items-center justify-between ${enc.status === 'IN_PROGRESS' ? 'cursor-pointer ' : 'opacity-75 '}${selectedEncounterId === enc.id ? 'border-sky-500 bg-sky-50' : 'hover:bg-gray-50'}`}
                  >
                    <div>
                      <p className="font-medium">{enc.patient?.user?.firstName} {enc.patient?.user?.lastName}</p>
                      <p className="text-xs text-gray-500">{enc.chiefComplaint || enc.type}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={enc.status} />
                      {enc.status === 'IN_PROGRESS' && (
                        <Button size="sm" variant="outline" onClick={(ev) => { ev.stopPropagation(); handleCompleteEncounter(enc.id); }}>
                          Complete
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

      {selectedEnc?.status === 'IN_PROGRESS' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Add Diagnosis</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleAddDiagnosis} className="space-y-3">
                <input value={diagCode} onChange={(e) => setDiagCode(e.target.value)} placeholder="Code (e.g. I10)" required className="w-full rounded-lg border px-3 py-2 text-sm" />
                <input value={diagDesc} onChange={(e) => setDiagDesc(e.target.value)} placeholder="Description" required className="w-full rounded-lg border px-3 py-2 text-sm" />
                <Button type="submit" size="sm">Save Diagnosis</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Prescribe Medication</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handlePrescribe} className="space-y-3">
                <select value={medId} onChange={(e) => setMedId(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="">Select medication...</option>
                  {(meds || []).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <input value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="Dosage" required className="w-full rounded-lg border px-3 py-2 text-sm" />
                <Button type="submit" size="sm">Create Prescription</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Order Lab Investigation</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleOrderLab} className="space-y-3">
                <select value={testId} onChange={(e) => setTestId(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="">Select lab test...</option>
                  {tests.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
                </select>
                <Button type="submit" size="sm">Submit Lab Order</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export function NurseDashboardView() {
  const { data: encRes, isLoading, error, refetch } = useEncounters({ status: 'IN_PROGRESS', limit: 20 });
  const [selectedEncId, setSelectedEncId] = useState('');
  const [temp, setTemp] = useState('36.8');
  const [sys, setSys] = useState('120');
  const [dia, setDia] = useState('80');
  const [hr, setHr] = useState('72');
  const [weight, setWeight] = useState('70');
  const [height, setHeight] = useState('172');
  const [savedMsg, setSavedMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const encounters = encRes?.data || [];

  const handleSaveVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedMsg('');
    setErrMsg('');
    if (!selectedEncId) return;
    try {
      const res = await medicoreService.recordVitals(
        selectedEncId,
        buildVitalSignsPayload({ temperature: temp, bpSystolic: sys, bpDiastolic: dia, heartRate: hr, weight, height })
      );
      setSavedMsg(`Vitals recorded (BMI: ${res.bmi ?? 'N/A'})`);
      refetch();
    } catch (err: any) {
      setErrMsg(getApiErrorMessage(err, 'Failed to save vital signs'));
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nursing Dashboard</h1>
        <p className="text-sm text-gray-500">In-progress patient encounters and vital signs monitoring</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Active Encounters" value={encounters.length} color="bg-sky-500" />
        <StatCard icon={Heart} label="Vitals Station" value="Ready" color="bg-rose-500" />
        <StatCard icon={ClipboardList} label="Care Observations" value="Live" color="bg-teal-500" />
      </div>

      {savedMsg && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">{savedMsg}</div>}
      {errMsg && <ErrorState message={errMsg} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Active Encounters</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : encounters.length === 0 ? <EmptyState title="No active encounters" /> : (
              <div className="space-y-2">
                {encounters.map((enc: any) => (
                  <div
                    key={enc.id}
                    onClick={() => setSelectedEncId(enc.id)}
                    className={`cursor-pointer rounded-lg border p-4 flex items-center justify-between ${selectedEncId === enc.id ? 'border-sky-600 bg-sky-50' : 'hover:bg-gray-50'}`}
                  >
                    <div>
                      <p className="font-medium">{enc.patient?.user?.firstName} {enc.patient?.user?.lastName}</p>
                      <p className="text-xs text-gray-500">Dr. {enc.doctor?.user?.firstName} {enc.doctor?.user?.lastName}</p>
                    </div>
                    <StatusBadge status={enc.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Record Vital Signs</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSaveVitals} className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Encounter</label>
                <select value={selectedEncId} onChange={(e) => setSelectedEncId(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="">Select active encounter...</option>
                  {encounters.map((enc: any) => (
                    <option key={enc.id} value={enc.id}>{enc.patient?.user?.firstName} {enc.patient?.user?.lastName}</option>
                  ))}
                </select>
              </div>
              <div><label className="text-xs text-gray-600">Temp (°C)</label><input type="number" step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" /></div>
              <div><label className="text-xs text-gray-600">Heart Rate</label><input type="number" value={hr} onChange={(e) => setHr(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" /></div>
              <div><label className="text-xs text-gray-600">BP Systolic</label><input type="number" value={sys} onChange={(e) => setSys(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" /></div>
              <div><label className="text-xs text-gray-600">BP Diastolic</label><input type="number" value={dia} onChange={(e) => setDia(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" /></div>
              <div><label className="text-xs text-gray-600">Weight (kg)</label><input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" /></div>
              <div><label className="text-xs text-gray-600">Height (cm)</label><input type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" /></div>
              <div className="col-span-2 pt-2"><Button type="submit">Save Vital Signs</Button></div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
