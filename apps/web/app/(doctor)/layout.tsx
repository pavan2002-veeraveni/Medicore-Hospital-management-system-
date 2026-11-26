'use client';

import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Home, Calendar, Users, FileText, FlaskConical, ClipboardList, Stethoscope } from 'lucide-react';

const doctorNav = [
  { href: '/doctor/dashboard', label: 'Dashboard', icon: Home },
  { href: '/doctor/appointments', label: 'Appointments', icon: Calendar },
  { href: '/doctor/patients', label: 'Patients', icon: Users },
  { href: '/doctor/encounters', label: 'Encounters', icon: Stethoscope },
  { href: '/doctor/prescriptions', label: 'Prescriptions', icon: FileText },
  { href: '/doctor/lab-orders', label: 'Lab Orders', icon: FlaskConical },
  { href: '/doctor/schedule', label: 'My Schedule', icon: ClipboardList },
];

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout role="DOCTOR" navItems={doctorNav}>{children}</DashboardLayout>;
}
