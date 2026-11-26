'use client';

import React, { useState } from 'react';
import {
  Building2,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  FlaskConical,
  Receipt,
  Shield,
  TestTube,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  useAppointments,
  useAppointmentAction,
  useAuditLogs,
  useDepartments,
  useInvoices,
  useLabOrders,
  usePatients,
  useUsers,
} from '@/hooks/useMedicore';
import { medicoreService } from '@/services/medicore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
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

export function ReceptionistDashboardView() {
  const { data: apptsRes, isLoading, error, refetch } = useAppointments({ limit: 30 });
  const { data: patientsRes } = usePatients({ limit: 30 });
  const actionMutation = useAppointmentAction();

  const appointments = apptsRes?.data || [];
  const patients = patientsRes?.data || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reception Dashboard</h1>
        <p className="text-sm text-gray-500">Patient registration, appointment confirmation, and check-in</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Calendar} label="Total Appointments" value={apptsRes?.meta?.total ?? appointments.length} color="bg-sky-500" />
        <StatCard icon={UserCheck} label="Checked In" value={appointments.filter((a: any) => a.status === 'CHECKED_IN').length} color="bg-emerald-500" />
        <StatCard icon={Clock} label="Pending Confirmation" value={appointments.filter((a: any) => a.status === 'REQUESTED').length} color="bg-amber-500" />
        <StatCard icon={Users} label="Registered Patients" value={patientsRes?.meta?.total ?? patients.length} color="bg-indigo-500" />
      </div>

      <Card>
        <CardHeader><CardTitle>Appointment Desk Queue</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : appointments.length === 0 ? <EmptyState title="No appointments" /> : (
            <div className="divide-y">
              {appointments.map((a: any) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{a.patient?.user?.firstName} {a.patient?.user?.lastName}</p>
                    <p className="text-xs text-gray-500">
                      Dr. {a.doctor?.user?.firstName} {a.doctor?.user?.lastName} • {new Date(a.scheduledStart).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={a.status} />
                    {a.status === 'REQUESTED' && (
                      <Button size="sm" onClick={() => actionMutation.mutate({ id: a.id, action: 'confirm' })}>Confirm</Button>
                    )}
                    {a.status === 'CONFIRMED' && (
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

export function LaboratoryDashboardView() {
  const qc = useQueryClient();
  const { data: ordersRes, isLoading, error, refetch } = useLabOrders({ limit: 30 });
  const [activeItem, setActiveItem] = useState<{ orderId: string; itemId: string; testName: string } | null>(null);
  const [val, setVal] = useState('');
  const [numVal, setNumVal] = useState('');

  const orders = ordersRes?.data || [];

  const handleCollect = async (orderId: string) => {
    await medicoreService.collectSpecimens(orderId);
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
    qc.invalidateQueries({ queryKey: ['lab-orders'] });
  };

  const handleValidate = async (resultId: string) => {
    await medicoreService.validateLabResult(resultId);
    qc.invalidateQueries({ queryKey: ['lab-orders'] });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Laboratory Dashboard</h1>
        <p className="text-sm text-gray-500">Order queue, specimen collection, result entry, and validation</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FlaskConical} label="Total Orders" value={ordersRes?.meta?.total ?? orders.length} color="bg-sky-500" />
        <StatCard icon={TestTube} label="Pending Collection" value={orders.filter((o: any) => o.status === 'ORDERED').length} color="bg-amber-500" />
        <StatCard icon={Clock} label="Collected / Processing" value={orders.filter((o: any) => o.status === 'SPECIMEN_COLLECTED' || o.status === 'PROCESSING').length} color="bg-teal-500" />
        <StatCard icon={CheckCircle} label="Completed" value={orders.filter((o: any) => o.status === 'COMPLETED').length} color="bg-indigo-500" />
      </div>

      {activeItem && (
        <Card>
          <CardHeader><CardTitle>Record Result: {activeItem.testName}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleRecordResult} className="flex flex-wrap gap-3 items-end">
              <div><label className="block text-xs text-gray-600 mb-1">Result Value</label><input value={val} onChange={(e) => setVal(e.target.value)} required className="rounded-lg border px-3 py-2 text-sm" placeholder="e.g. 95 mg/dL" /></div>
              <div><label className="block text-xs text-gray-600 mb-1">Numeric Value</label><input type="number" step="0.01" value={numVal} onChange={(e) => setNumVal(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" placeholder="95" /></div>
              <Button type="submit">Submit Result</Button>
              <Button type="button" variant="outline" onClick={() => setActiveItem(null)}>Cancel</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Laboratory Orders</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : orders.length === 0 ? <EmptyState title="No lab orders" /> : (
            <div className="space-y-4">
              {orders.map((order: any) => (
                <div key={order.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{order.patient?.user?.firstName} {order.patient?.user?.lastName}</p>
                      <p className="text-xs text-gray-500">Ordered {new Date(order.orderedAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={order.priority} />
                      <StatusBadge status={order.status} />
                      {order.status === 'ORDERED' && (
                        <Button size="sm" onClick={() => handleCollect(order.id)}>Collect Specimen</Button>
                      )}
                    </div>
                  </div>
                  <div className="divide-y rounded bg-gray-50 px-3">
                    {(order.items || []).map((item: any) => (
                      <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                        <span className="font-medium">{item.test?.name} ({item.test?.code})</span>
                        <div className="flex items-center gap-2">
                          {item.result ? (
                            <>
                              <span>Result: <strong>{item.result.value}</strong></span>
                              {item.result.isAbnormal && <StatusBadge status={item.result.abnormalFlag || 'HIGH'} />}
                              {!item.result.validatedAt ? (
                                <Button size="sm" variant="secondary" onClick={() => handleValidate(item.result.id)}>Validate</Button>
                              ) : (
                                <span className="text-emerald-700 font-medium">Validated</span>
                              )}
                            </>
                          ) : order.status !== 'ORDERED' && order.status !== 'CANCELLED' ? (
                            <Button size="sm" variant="outline" onClick={() => setActiveItem({ orderId: order.id, itemId: item.id, testName: item.test?.name })}>
                              Enter Result
                            </Button>
                          ) : (
                            <StatusBadge status={item.status} />
                          )}
                        </div>
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

export function BillingDashboardView() {
  const qc = useQueryClient();
  const { data: invRes, isLoading, error, refetch } = useInvoices({ limit: 30 });
  const { data: patientsRes } = usePatients({ limit: 30 });
  const [patientId, setPatientId] = useState('');
  const [desc, setDesc] = useState('Outpatient Consultation');
  const [amount, setAmount] = useState('150');

  const invoices = invRes?.data || [];
  const patients = patientsRes?.data || [];

  const totalBilled = invoices.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0);
  const totalCollected = invoices.reduce((s: number, i: any) => s + (i.paidAmount || 0), 0);

  const chartData = [
    { name: 'Billed', amount: totalBilled },
    { name: 'Collected', amount: totalCollected },
    { name: 'Outstanding', amount: Math.max(0, totalBilled - totalCollected) },
  ];

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) return;
    await medicoreService.createInvoice({
      patientId,
      items: [{ description: desc, category: 'CONSULTATION', quantity: 1, unitPrice: Number(amount) }],
      taxRate: 0,
      discountAmount: 0,
    });
    qc.invalidateQueries({ queryKey: ['invoices'] });
  };

  const handlePayFull = async (inv: any) => {
    const remaining = Math.max(0, inv.totalAmount - inv.paidAmount);
    if (remaining <= 0) return;
    await medicoreService.recordPayment({ invoiceId: inv.id, amount: remaining, method: 'CARD', reference: `SANDBOX-${Date.now()}` });
    qc.invalidateQueries({ queryKey: ['invoices'] });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing Dashboard (Sandbox Mode)</h1>
        <p className="text-sm text-gray-500">Invoice generation, issuance, and sandbox payment tracking</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Receipt} label="Total Invoices" value={invRes?.meta?.total ?? invoices.length} color="bg-sky-500" />
        <StatCard icon={TrendingUp} label="Total Billed" value={`$${totalBilled.toFixed(2)}`} color="bg-indigo-500" />
        <StatCard icon={CreditCard} label="Collected" value={`$${totalCollected.toFixed(2)}`} color="bg-emerald-500" />
        <StatCard icon={Clock} label="Outstanding" value={`$${Math.max(0, totalBilled - totalCollected).toFixed(2)}`} color="bg-rose-500" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Create Draft Invoice</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreateInvoice} className="space-y-3">
              <select value={patientId} onChange={(e) => setPatientId(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="">Select patient...</option>
                {patients.map((p: any) => <option key={p.id} value={p.id}>{p.user?.firstName} {p.user?.lastName} ({p.registrationNumber})</option>)}
              </select>
              <input value={desc} onChange={(e) => setDesc(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Service description" />
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Amount ($)" />
              <Button type="submit">Create Draft Invoice</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Financial Summary</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
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

      <Card>
        <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : invoices.length === 0 ? <EmptyState title="No invoices" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-gray-500"><th className="pb-3">Invoice #</th><th className="pb-3">Patient</th><th className="pb-3">Total</th><th className="pb-3">Paid</th><th className="pb-3">Status</th><th className="pb-3 text-right">Actions</th></tr></thead>
                <tbody className="divide-y">
                  {invoices.map((inv: any) => (
                    <tr key={inv.id}>
                      <td className="py-3 font-mono">{inv.invoiceNumber}</td>
                      <td className="py-3">{inv.patient?.user?.firstName} {inv.patient?.user?.lastName}</td>
                      <td className="py-3 font-medium">${Number(inv.totalAmount).toFixed(2)}</td>
                      <td className="py-3">${Number(inv.paidAmount).toFixed(2)}</td>
                      <td className="py-3"><StatusBadge status={inv.status} /></td>
                      <td className="py-3 text-right space-x-2">
                        {inv.status === 'DRAFT' && (
                          <Button size="sm" onClick={() => medicoreService.issueInvoice(inv.id).then(() => qc.invalidateQueries({ queryKey: ['invoices'] }))}>Issue</Button>
                        )}
                        {(inv.status === 'ISSUED' || inv.status === 'PARTIALLY_PAID') && (
                          <Button size="sm" variant="secondary" onClick={() => handlePayFull(inv)}>Record Payment</Button>
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
    </div>
  );
}

export function AdminDashboardView() {
  const { data: usersRes } = useUsers({ limit: 20 });
  const { data: deptsRes } = useDepartments();
  const { data: apptsRes } = useAppointments({ limit: 20 });
  const { data: auditRes, isLoading: loadingAudit } = useAuditLogs({ limit: 10 });
  const { data: analyticsData } = useQuery({
    queryKey: ['analytics', 'utilization'],
    queryFn: () => medicoreService.getAnalyticsUtilization(),
    retry: false,
  });

  const departments = deptsRes?.data || [];
  const auditLogs = auditRes?.data || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hospital Administration</h1>
        <p className="text-sm text-gray-500">Operational metrics, user governance, and audit logs</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Registered Users" value={usersRes?.meta?.total ?? (usersRes?.data?.length || 0)} color="bg-sky-500" />
        <StatCard icon={Building2} label="Departments" value={deptsRes?.meta?.total ?? departments.length} color="bg-teal-500" />
        <StatCard icon={Calendar} label="Appointments" value={apptsRes?.meta?.total ?? (apptsRes?.data?.length || 0)} color="bg-indigo-500" />
        <StatCard icon={Shield} label="Audit Events" value={auditRes?.meta?.total ?? auditLogs.length} color="bg-amber-500" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Department Utilization Analytics</CardTitle></CardHeader>
          <CardContent className="h-64">
            {analyticsData?.by_department ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData.by_department}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="utilization_rate" name="Utilization %" fill="#0284c7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="Analytics data unavailable" description="Ensure the FastAPI analytics microservice is running and reachable from the backend API." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent Audit Activity</CardTitle></CardHeader>
          <CardContent>
            {loadingAudit ? <LoadingSkeleton rows={4} /> : auditLogs.length === 0 ? <EmptyState title="No audit events" /> : (
              <div className="divide-y max-h-64 overflow-y-auto">
                {auditLogs.map((log: any) => (
                  <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-medium text-gray-900">{log.action} • {log.resourceType}</p>
                      <p className="text-gray-500">{log.actor?.email || 'System'} • {new Date(log.createdAt).toLocaleString()}</p>
                    </div>
                    <StatusBadge status={log.outcome} />
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
