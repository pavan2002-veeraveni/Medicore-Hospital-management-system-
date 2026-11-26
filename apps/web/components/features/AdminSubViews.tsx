'use client';

import React, { useState } from 'react';
import { useAuditLogs, useDepartments, usePatients, useUsers } from '@/hooks/useMedicore';
import { medicoreService } from '@/services/medicore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  StatusBadge,
} from '@/components/ui/primitives';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export function PatientsDirectoryView({ allowRegister = false }: { allowRegister?: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const { data, isLoading, error, refetch } = usePatients({ search: search || undefined, limit: 30 });
  const [userId, setUserId] = useState('');
  const [dob, setDob] = useState('1990-01-01');
  const [gender, setGender] = useState('FEMALE');
  const [bloodType, setBloodType] = useState('O+');
  const [errMsg, setErrMsg] = useState('');

  const patients = data?.data || [];

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg('');
    try {
      await medicoreService.createPatient({ userId: userId || undefined, dateOfBirth: dob, gender, bloodType });
      qc.invalidateQueries({ queryKey: ['patients'] });
      setUserId('');
    } catch (err: any) {
      setErrMsg(err?.response?.data?.message || 'Registration failed');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Patient Directory</h1>
      {allowRegister && (
        <Card>
          <CardHeader><CardTitle>Register Patient Profile</CardTitle></CardHeader>
          <CardContent>
            {errMsg && <div className="mb-3"><ErrorState message={errMsg} /></div>}
            <form onSubmit={handleRegister} className="grid gap-3 sm:grid-cols-4 items-end">
              <div><label className="text-xs text-gray-600">User UUID</label><input value={userId} onChange={(e) => setUserId(e.target.value)} required placeholder="User UUID" className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
              <div><label className="text-xs text-gray-600">Date of Birth</label><input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
              <div><label className="text-xs text-gray-600">Gender</label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option>
                </select>
              </div>
              <Button type="submit">Register Patient</Button>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Patients</CardTitle>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or MED-..." className="rounded-lg border px-3 py-1.5 text-sm w-64" />
        </CardHeader>
        <CardContent>
          {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : patients.length === 0 ? <EmptyState title="No patients found" /> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500"><th className="pb-3">Reg #</th><th className="pb-3">Name</th><th className="pb-3">Gender</th><th className="pb-3">Blood Type</th><th className="pb-3">DOB</th></tr></thead>
              <tbody className="divide-y">
                {patients.map((p: any) => (
                  <tr key={p.id}>
                    <td className="py-3 font-mono">{p.registrationNumber}</td>
                    <td className="py-3 font-medium">{p.user?.firstName} {p.user?.lastName}</td>
                    <td className="py-3">{p.gender}</td>
                    <td className="py-3">{p.bloodType || '-'}</td>
                    <td className="py-3 text-gray-500">{new Date(p.dateOfBirth).toLocaleDateString()}</td>
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

export function AdminUsersView() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useUsers({ limit: 50 });
  const users = data?.data || [];
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Users' }]} />
      <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
      <Card>
        <CardContent>
          {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : users.length === 0 ? <EmptyState /> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500"><th className="pb-3">Name</th><th className="pb-3">Email</th><th className="pb-3">Roles</th><th className="pb-3">Status</th><th className="pb-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y">
                {users.map((u: any) => (
                  <tr key={u.id}>
                    <td className="py-3 font-medium">{u.firstName} {u.lastName}</td>
                    <td className="py-3 text-gray-600">{u.email}</td>
                    <td className="py-3">{(u.roles || []).join(', ')}</td>
                    <td className="py-3"><StatusBadge status={u.isActive ? 'ACTIVE' : 'CANCELLED'} /></td>
                    <td className="py-3 text-right">
                      {u.isActive && (
                        <Button size="sm" variant="outline" onClick={() => medicoreService.deactivateUser(u.id).then(() => qc.invalidateQueries({ queryKey: ['users'] }))}>
                          Deactivate
                        </Button>
                      )}
                    </td>
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

export function AdminDepartmentsView() {
  const qc = useQueryClient();
  const { data, isLoading } = useDepartments();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const depts = data?.data || [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await medicoreService.createDepartment({ name, code });
    setName('');
    setCode('');
    qc.invalidateQueries({ queryKey: ['departments'] });
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Departments' }]} />
      <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
      <Card>
        <CardHeader><CardTitle>Add Department</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-wrap gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Department Name" required className="rounded-lg border px-3 py-2 text-sm" />
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (e.g. RAD)" required className="rounded-lg border px-3 py-2 text-sm" />
            <Button type="submit">Create Department</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          {isLoading ? <LoadingSkeleton /> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {depts.map((d: any) => (
                <div key={d.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900">{d.name}</p>
                    <span className="font-mono text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded">{d.code}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{d.description || 'Hospital clinical department'}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminAuditLogsView() {
  const [resourceType, setResourceType] = useState('');
  const { data, isLoading, error, refetch } = useAuditLogs({ limit: 50, resourceType: resourceType || undefined });
  const logs = data?.data || [];
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Audit Logs' }]} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Immutable Audit Logs</h1>
        <select value={resourceType} onChange={(e) => setResourceType(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
          <option value="">All Resources</option>
          <option value="AUTH">Auth</option>
          <option value="PATIENT">Patient</option>
          <option value="APPOINTMENT">Appointment</option>
          <option value="ENCOUNTER">Encounter</option>
          <option value="PRESCRIPTION">Prescription</option>
          <option value="LAB_ORDER">Lab Order</option>
          <option value="INVOICE">Invoice</option>
          <option value="CONSENT">Consent</option>
        </select>
      </div>
      <Card>
        <CardContent>
          {isLoading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => refetch()} /> : logs.length === 0 ? <EmptyState /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-gray-500"><th className="pb-2">Timestamp</th><th className="pb-2">Actor</th><th className="pb-2">Action</th><th className="pb-2">Resource</th><th className="pb-2">Outcome</th></tr></thead>
                <tbody className="divide-y">
                  {logs.map((l: any) => (
                    <tr key={l.id}>
                      <td className="py-2.5 text-gray-500">{new Date(l.createdAt).toLocaleString()}</td>
                      <td className="py-2.5">{l.actor?.email || 'Anonymous'}</td>
                      <td className="py-2.5 font-medium">{l.action}</td>
                      <td className="py-2.5">{l.resourceType}</td>
                      <td className="py-2.5"><StatusBadge status={l.outcome} /></td>
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

export function AdminAnalyticsView() {
  const { data: waitData, isLoading, error } = useQuery({
    queryKey: ['analytics', 'wait-times'],
    queryFn: () => medicoreService.getAnalyticsWaitTimes(),
    retry: false,
  });
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Analytics' }]} />
      <h1 className="text-2xl font-bold text-gray-900">Operational Analytics (FastAPI)</h1>
      <Card>
        <CardHeader><CardTitle>Average Waiting Times by Department (Minutes)</CardTitle></CardHeader>
        <CardContent className="h-72">
          {isLoading ? <LoadingSkeleton /> : error ? <ErrorState message="Analytics service unreachable on port 8000" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waitData?.by_department || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="avg_minutes" name="Avg Wait (min)" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminStaffAndSettingsView({ mode }: { mode: 'staff' | 'settings' }) {
  const { data: health } = useQuery({ queryKey: ['api-health'], queryFn: medicoreService.getApiHealth, retry: false });
  const { data: staffRes, isLoading } = useQuery({ queryKey: ['staff'], queryFn: () => medicoreService.getStaff({ limit: 50 }), enabled: mode === 'staff' });

  if (mode === 'settings') {
    return (
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'System Health' }]} />
        <h1 className="text-2xl font-bold text-gray-900">Operational Settings & Health</h1>
        <Card>
          <CardHeader><CardTitle>Service Status</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Express Backend API: <StatusBadge status={health?.success ? 'SUCCESS' : 'PENDING'} /></p>
            <p>Mode: <strong>Educational Synthetic Data Environment</strong></p>
            <p>Notifications & Payments: <strong>Sandbox Mode</strong></p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const staff = staffRes?.data || [];
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Staff' }]} />
      <h1 className="text-2xl font-bold text-gray-900">Staff Directory</h1>
      <Card>
        <CardContent>
          {isLoading ? <LoadingSkeleton /> : staff.length === 0 ? <EmptyState /> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500"><th className="pb-3">Employee ID</th><th className="pb-3">Name</th><th className="pb-3">Department</th><th className="pb-3">Specialization</th></tr></thead>
              <tbody className="divide-y">
                {staff.map((s: any) => (
                  <tr key={s.id}>
                    <td className="py-3 font-mono">{s.employeeId}</td>
                    <td className="py-3 font-medium">{s.user?.firstName} {s.user?.lastName}</td>
                    <td className="py-3">{s.department?.name}</td>
                    <td className="py-3 text-gray-600">{s.specialization || '-'}</td>
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
