'use client';

import React, { useState } from 'react';
import {
  useAppointments,
  useAppointmentAction,
  useAvailableSlots,
  useBookAppointment,
  useDoctors,
  useInvoices,
  useLabOrders,
  useLabResults,
  useLabTests,
  usePatients,
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
  StatCard,
  StatusBadge,
} from '@/components/ui/primitives';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CheckCircle, Clock, CreditCard, Receipt, TrendingUp } from 'lucide-react';

export function ReceptionistAppointmentsView() {
  const { data: apptsRes, isLoading, error, refetch } = useAppointments({ limit: 40 });
  const { data: patientsRes } = usePatients({ limit: 50 });
  const { data: doctorsRes } = useDoctors();
  const bookMutation = useBookAppointment();
  const actionMutation = useAppointmentAction();

  const [patientId, setPatientId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [type, setType] = useState('CONSULTATION');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const { data: slots } = useAvailableSlots(doctorId, date);
  const appointments = apptsRes?.data || [];
  const patients = patientsRes?.data || [];
  const doctors = doctorsRes?.data || [];

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('');
    setErrMsg('');
    if (!selectedSlot) {
      setErrMsg('Please choose an available slot');
      return;
    }
    const slot = JSON.parse(selectedSlot);
    try {
      await bookMutation.mutateAsync({ patientId, doctorId, scheduledStart: slot.start, scheduledEnd: slot.end, type, reason });
      setFeedback('Appointment booked cleanly');
      setSelectedSlot('');
      setReason('');
    } catch (err: any) {
      setErrMsg(err?.response?.data?.message || 'Booking failed');
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/receptionist/dashboard' }, { label: 'Appointments' }]} />
      <h1 className="text-2xl font-bold text-gray-900">Reception Appointment Desk</h1>

      {feedback && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">{feedback}</div>}
      {errMsg && <ErrorState message={errMsg} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Schedule Appointment</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleBook} className="space-y-3">
              <select value={patientId} onChange={(e) => setPatientId(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="">Select patient...</option>
                {patients.map((p: any) => <option key={p.id} value={p.id}>{p.user?.firstName} {p.user?.lastName} ({p.registrationNumber})</option>)}
              </select>
              <select value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setSelectedSlot(''); }} required className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="">Select doctor...</option>
                {doctors.map((d: any) => <option key={d.id} value={d.id}>Dr. {d.user?.firstName} {d.user?.lastName}</option>)}
              </select>
              <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSelectedSlot(''); }} required className="w-full rounded-lg border px-3 py-2 text-sm" />
              <select value={selectedSlot} onChange={(e) => setSelectedSlot(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="">Select open time slot...</option>
                {(slots || []).filter((s: any) => s.available).map((s: any, idx: number) => (
                  <option key={idx} value={JSON.stringify(s)}>{new Date(s.start).toISOString().slice(11, 16)} UTC</option>
                ))}
              </select>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="CONSULTATION">CONSULTATION</option>
                <option value="FOLLOW_UP">FOLLOW UP</option>
                <option value="CHECKUP">CHECKUP</option>
              </select>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Visit reason" className="w-full rounded-lg border px-3 py-2 text-sm" />
              <Button type="submit" className="w-full" loading={bookMutation.isPending}>Book Slot</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Scheduled Visits</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : appointments.length === 0 ? <EmptyState title="No appointments" /> : (
              <div className="divide-y">
                {appointments.map((a: any) => (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{a.patient?.user?.firstName} {a.patient?.user?.lastName}</p>
                      <p className="text-xs text-gray-500">Dr. {a.doctor?.user?.firstName} {a.doctor?.user?.lastName} • {new Date(a.scheduledStart).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={a.status} />
                      {a.status === 'REQUESTED' && <Button size="sm" onClick={() => actionMutation.mutate({ id: a.id, action: 'confirm' })}>Confirm</Button>}
                      {a.status === 'CONFIRMED' && <Button size="sm" variant="secondary" onClick={() => actionMutation.mutate({ id: a.id, action: 'check-in' })}>Check In</Button>}
                      {['REQUESTED', 'CONFIRMED'].includes(a.status) && (
                        <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ id: a.id, action: 'cancel', body: { reason: 'Front desk cancelled' } })}>Cancel</Button>
                      )}
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

export function ReceptionistQueueView({ mode }: { mode: 'check-in' | 'waiting' }) {
  const { data: apptsRes, isLoading, error, refetch } = useAppointments({ limit: 50 });
  const actionMutation = useAppointmentAction();
  const all = apptsRes?.data || [];

  const filtered =
    mode === 'check-in'
      ? all.filter((a: any) => ['REQUESTED', 'CONFIRMED'].includes(a.status))
      : all.filter((a: any) => ['CHECKED_IN', 'IN_PROGRESS'].includes(a.status));

  const title = mode === 'check-in' ? 'Patient Check-In Desk' : 'Live Waiting Room Queue';
  const crumb = mode === 'check-in' ? 'Check-In' : 'Waiting List';

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/receptionist/dashboard' }, { label: crumb }]} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500">
            {mode === 'check-in' ? 'Confirm pending visits and check patients in on arrival' : 'Checked-in patients waiting or currently in room with physician'}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Refresh</Button>
      </div>

      <Card>
        <CardContent>
          {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : filtered.length === 0 ? (
            <EmptyState title={mode === 'check-in' ? 'No patients pending check-in' : 'Waiting room is empty'} />
          ) : (
            <div className="divide-y">
              {filtered.map((a: any) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-4 py-3.5">
                  <div>
                    <p className="font-medium text-gray-900">{a.patient?.user?.firstName} {a.patient?.user?.lastName}</p>
                    <p className="text-xs text-gray-500">
                      Dr. {a.doctor?.user?.firstName} {a.doctor?.user?.lastName} • Scheduled {new Date(a.scheduledStart).toLocaleString()}
                      {a.checkedInAt && ` • Checked in at ${new Date(a.checkedInAt).toLocaleTimeString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={a.status} />
                    {mode === 'check-in' && a.status === 'REQUESTED' && (
                      <Button size="sm" onClick={() => actionMutation.mutate({ id: a.id, action: 'confirm' })}>Confirm</Button>
                    )}
                    {mode === 'check-in' && a.status === 'CONFIRMED' && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => actionMutation.mutate({ id: a.id, action: 'check-in' })}>Check In</Button>
                        <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ id: a.id, action: 'no-show' })}>No Show</Button>
                      </>
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

export function LaboratorySubView({ mode }: { mode: 'orders' | 'specimens' | 'results' | 'validation' }) {
  const qc = useQueryClient();
  const { data: ordersRes, isLoading, error, refetch } = useLabOrders({ limit: 50 });
  const { data: resultsRes, isLoading: loadingResults } = useLabResults({ limit: 50 });
  const { data: testsRes } = useLabTests();

  const [activeItem, setActiveItem] = useState<{ orderId: string; itemId: string; testName: string } | null>(null);
  const [val, setVal] = useState('');
  const [numVal, setNumVal] = useState('');
  const [msg, setMsg] = useState('');

  const orders = ordersRes?.data || [];
  const results = resultsRes?.data || [];
  const tests = testsRes?.data || [];

  const handleCollect = async (orderId: string) => {
    await medicoreService.collectSpecimens(orderId);
    setMsg('Specimen collected');
    qc.invalidateQueries({ queryKey: ['lab-orders'] });
  };

  const handleRecordResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;
    await medicoreService.recordLabResult(activeItem.orderId, {
      labOrderItemId: activeItem.itemId,
      value: val,
      numericValue: numVal ? Number(numVal) : undefined,
    });
    setActiveItem(null);
    setVal('');
    setNumVal('');
    setMsg('Result entered cleanly');
    qc.invalidateQueries({ queryKey: ['lab-orders'] });
    qc.invalidateQueries({ queryKey: ['lab-results'] });
  };

  const handleValidate = async (resultId: string) => {
    await medicoreService.validateLabResult(resultId);
    setMsg('Result validated');
    qc.invalidateQueries({ queryKey: ['lab-orders'] });
    qc.invalidateQueries({ queryKey: ['lab-results'] });
  };

  const titles = {
    orders: 'All Laboratory Orders & Test Catalog',
    specimens: 'Specimen Collection Workbench',
    results: 'Enter Laboratory Results',
    validation: 'Result Validation Queue',
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/laboratory/dashboard' }, { label: titles[mode] }]} />
      <h1 className="text-2xl font-bold text-gray-900">{titles[mode]}</h1>

      {msg && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">{msg}</div>}

      {mode === 'specimens' && (
        <Card>
          <CardHeader><CardTitle>Pending Specimen Collection</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : (
              <div className="space-y-3">
                {orders.filter((o: any) => ['ORDERED', 'SPECIMEN_COLLECTED'].includes(o.status)).length === 0 ? (
                  <EmptyState title="No orders awaiting specimen collection" />
                ) : (
                  orders.filter((o: any) => ['ORDERED', 'SPECIMEN_COLLECTED'].includes(o.status)).map((o: any) => (
                    <div key={o.id} className="rounded-lg border p-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{o.patient?.user?.firstName} {o.patient?.user?.lastName}</p>
                        <p className="text-xs text-gray-500">Tests: {(o.items || []).map((i: any) => `${i.test?.name} (${i.test?.sampleType || 'BLOOD'})`).join(', ')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={o.priority} />
                        <StatusBadge status={o.status} />
                        {o.status === 'ORDERED' && <Button size="sm" onClick={() => handleCollect(o.id)}>Collect Specimen</Button>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mode === 'results' && (
        <>
          {activeItem && (
            <Card>
              <CardHeader><CardTitle>Enter Result: {activeItem.testName}</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleRecordResult} className="flex flex-wrap gap-3 items-end">
                  <div><label className="block text-xs text-gray-600 mb-1">Result Value</label><input value={val} onChange={(e) => setVal(e.target.value)} required className="rounded-lg border px-3 py-2 text-sm" placeholder="e.g. 92 mg/dL" /></div>
                  <div><label className="block text-xs text-gray-600 mb-1">Numeric Value</label><input type="number" step="0.01" value={numVal} onChange={(e) => setNumVal(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" placeholder="92" /></div>
                  <Button type="submit">Save Result</Button>
                  <Button type="button" variant="outline" onClick={() => setActiveItem(null)}>Cancel</Button>
                </form>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Collected Orders Awaiting Results</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? <LoadingSkeleton /> : orders.filter((o: any) => ['SPECIMEN_COLLECTED', 'PROCESSING'].includes(o.status)).length === 0 ? (
                <EmptyState title="No collected specimens awaiting results" />
              ) : (
                <div className="space-y-3">
                  {orders.filter((o: any) => ['SPECIMEN_COLLECTED', 'PROCESSING'].includes(o.status)).map((o: any) => (
                    <div key={o.id} className="rounded-lg border p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{o.patient?.user?.firstName} {o.patient?.user?.lastName}</span>
                        <StatusBadge status={o.status} />
                      </div>
                      {(o.items || []).map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between text-xs bg-gray-50 rounded p-2">
                          <span>{item.test?.name} ({item.test?.referenceMin ?? '-'}–{item.test?.referenceMax ?? '-'} {item.test?.unit})</span>
                          {!item.result ? (
                            <Button size="sm" onClick={() => setActiveItem({ orderId: o.id, itemId: item.id, testName: item.test?.name })}>Enter Result</Button>
                          ) : <span className="font-medium">{item.result.value}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {mode === 'validation' && (
        <Card>
          <CardHeader><CardTitle>Results Pending Technician Validation</CardTitle></CardHeader>
          <CardContent>
            {loadingResults ? <LoadingSkeleton /> : results.length === 0 ? <EmptyState title="No lab results recorded yet" /> : (
              <div className="divide-y">
                {results.map((r: any) => (
                  <div key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium">{r.labOrderItem?.test?.name} — {r.labOrderItem?.labOrder?.patient?.user?.firstName} {r.labOrderItem?.labOrder?.patient?.user?.lastName}</p>
                      <p className="text-xs text-gray-500">Value: <strong>{r.value}</strong> {r.unit} • Ref: {r.referenceRange || 'N/A'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.isAbnormal && <StatusBadge status={r.abnormalFlag || 'HIGH'} />}
                      {r.validatedAt ? (
                        <span className="text-xs text-emerald-700 font-medium flex items-center gap-1"><CheckCircle className="h-4 w-4" /> Validated</span>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => handleValidate(r.id)}>Validate Result</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mode === 'orders' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>All Laboratory Orders</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? <LoadingSkeleton /> : orders.length === 0 ? <EmptyState title="No orders" /> : (
                <div className="divide-y">
                  {orders.map((o: any) => (
                    <div key={o.id} className="py-3 flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{o.patient?.user?.firstName} {o.patient?.user?.lastName}</p>
                        <p className="text-xs text-gray-500">{(o.items || []).map((i: any) => i.test?.code).join(', ')} • {new Date(o.orderedAt).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2"><StatusBadge status={o.priority} /><StatusBadge status={o.status} /></div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Test Reference Catalog</CardTitle></CardHeader>
            <CardContent>
              <div className="divide-y text-xs">
                {tests.map((t: any) => (
                  <div key={t.id} className="py-2 flex justify-between">
                    <span className="font-medium">{t.name} ({t.code})</span>
                    <span className="text-gray-500">{t.turnaroundHours}h</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export function BillingSubView({ mode }: { mode: 'invoices' | 'payments' | 'reports' }) {
  const qc = useQueryClient();
  const { data: invRes, isLoading, error, refetch } = useInvoices({ limit: 50 });
  const { data: patientsRes } = usePatients({ limit: 50 });
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [patientId, setPatientId] = useState('');
  const [desc, setDesc] = useState('Outpatient Consultation');
  const [amount, setAmount] = useState('150');
  const [payMethod, setPayMethod] = useState('CARD');
  const [msg, setMsg] = useState('');

  const invoices = invRes?.data || [];
  const patients = patientsRes?.data || [];

  const totalBilled = invoices.reduce((s: number, i: any) => s + Number(i.totalAmount || 0), 0);
  const totalCollected = invoices.reduce((s: number, i: any) => s + Number(i.paidAmount || 0), 0);
  const outstanding = Math.max(0, totalBilled - totalCollected);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await medicoreService.createInvoice({
      patientId,
      items: [{ description: desc, category: 'CONSULTATION', quantity: 1, unitPrice: Number(amount) }],
      taxRate: 0,
      discountAmount: 0,
    });
    setMsg('Draft invoice created');
    qc.invalidateQueries({ queryKey: ['invoices'] });
  };

  const handlePay = async (inv: any) => {
    const remaining = Math.max(0, Number(inv.totalAmount) - Number(inv.paidAmount));
    if (remaining <= 0) return;
    await medicoreService.recordPayment({
      invoiceId: inv.id,
      amount: remaining,
      method: payMethod,
      reference: `SANDBOX-${Date.now()}`,
    });
    setMsg(`Sandbox payment settled for ${inv.invoiceNumber}`);
    qc.invalidateQueries({ queryKey: ['invoices'] });
  };

  const crumbs = { invoices: 'Invoices', payments: 'Payments', reports: 'Financial Reports' };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/billing/dashboard' }, { label: crumbs[mode] }]} />
      <h1 className="text-2xl font-bold text-gray-900">{crumbs[mode]}</h1>

      {msg && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">{msg}</div>}

      {mode === 'invoices' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Create Draft Invoice</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-3">
                <select value={patientId} onChange={(e) => setPatientId(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="">Select patient...</option>
                  {patients.map((p: any) => <option key={p.id} value={p.id}>{p.user?.firstName} {p.user?.lastName} ({p.registrationNumber})</option>)}
                </select>
                <input value={desc} onChange={(e) => setDesc(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Line item description" />
                <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" />
                <Button type="submit" className="w-full">Create Draft</Button>
              </form>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Invoice Ledger</CardTitle>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm">
                {['ALL', 'DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </CardHeader>
            <CardContent>
              {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : (
                <div className="divide-y text-sm">
                  {invoices.filter((i: any) => statusFilter === 'ALL' || i.status === statusFilter).map((inv: any) => (
                    <div key={inv.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-mono font-medium">{inv.invoiceNumber}</p>
                        <p className="text-xs text-gray-500">{inv.patient?.user?.firstName} {inv.patient?.user?.lastName} • Total ${Number(inv.totalAmount).toFixed(2)} • Paid ${Number(inv.paidAmount).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={inv.status} />
                        {inv.status === 'DRAFT' && (
                          <Button size="sm" onClick={() => medicoreService.issueInvoice(inv.id).then(() => qc.invalidateQueries({ queryKey: ['invoices'] }))}>Issue</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {mode === 'payments' && (
        <Card>
          <CardHeader>
            <CardTitle>Payable Invoices (Sandbox Settlement)</CardTitle>
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm">
              <option value="CARD">CARD</option>
              <option value="CASH">CASH</option>
              <option value="INSURANCE">INSURANCE</option>
              <option value="BANK_TRANSFER">BANK_TRANSFER</option>
            </select>
          </CardHeader>
          <CardContent>
            {isLoading ? <LoadingSkeleton /> : invoices.filter((i: any) => ['ISSUED', 'PARTIALLY_PAID'].includes(i.status)).length === 0 ? (
              <EmptyState title="No outstanding issued invoices" />
            ) : (
              <div className="divide-y text-sm">
                {invoices.filter((i: any) => ['ISSUED', 'PARTIALLY_PAID'].includes(i.status)).map((inv: any) => (
                  <div key={inv.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-mono font-medium">{inv.invoiceNumber} — {inv.patient?.user?.firstName} {inv.patient?.user?.lastName}</p>
                      <p className="text-xs text-gray-500">Balance Due: ${(Number(inv.totalAmount) - Number(inv.paidAmount)).toFixed(2)}</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => handlePay(inv)}>Settle via {payMethod}</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mode === 'reports' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Receipt} label="Total Invoices" value={invoices.length} color="bg-sky-500" />
            <StatCard icon={TrendingUp} label="Total Billed" value={`$${totalBilled.toFixed(2)}`} color="bg-indigo-500" />
            <StatCard icon={CreditCard} label="Collected" value={`$${totalCollected.toFixed(2)}`} color="bg-emerald-500" />
            <StatCard icon={Clock} label="Collection Rate" value={`${totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0}%`} color="bg-teal-500" />
          </div>
          <Card>
            <CardHeader><CardTitle>Revenue Breakdown ($ USD)</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: 'Billed', amount: totalBilled },
                  { name: 'Collected', amount: totalCollected },
                  { name: 'Outstanding', amount: outstanding },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="amount" fill="#0284c7" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
