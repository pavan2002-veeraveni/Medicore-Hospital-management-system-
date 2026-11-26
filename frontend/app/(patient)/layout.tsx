'use client';

import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Calendar, Clock, FileText, FlaskConical, Receipt, User, Home, Settings } from 'lucide-react';

const patientNav = [
  { href: '/patient/dashboard', label: 'Dashboard', icon: Home },
  { href: '/patient/appointments', label: 'Appointments', icon: Calendar },
  { href: '/patient/records', label: 'Medical Records', icon: FileText },
  { href: '/patient/prescriptions', label: 'Prescriptions', icon: FileText },
  { href: '/patient/lab-results', label: 'Lab Results', icon: FlaskConical },
  { href: '/patient/billing', label: 'Billing', icon: Receipt },
  { href: '/patient/profile', label: 'Profile', icon: User },
];

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout role="PATIENT" navItems={patientNav}>{children}</DashboardLayout>;
}
