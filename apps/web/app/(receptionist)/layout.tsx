'use client';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Home, Calendar, Users, UserCheck, Clock } from 'lucide-react';
const nav = [
  { href: '/receptionist/dashboard', label: 'Dashboard', icon: Home },
  { href: '/receptionist/patients', label: 'Patient Registration', icon: Users },
  { href: '/receptionist/appointments', label: 'Appointments', icon: Calendar },
  { href: '/receptionist/check-in', label: 'Check-In', icon: UserCheck },
  { href: '/receptionist/waiting', label: 'Waiting List', icon: Clock },
];
export default function ReceptionistLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout role="RECEPTIONIST" navItems={nav}>{children}</DashboardLayout>;
}
