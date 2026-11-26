'use client';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Home, FlaskConical, TestTube, CheckCircle, List } from 'lucide-react';
const nav = [
  { href: '/laboratory/dashboard', label: 'Dashboard', icon: Home },
  { href: '/laboratory/orders', label: 'Lab Orders', icon: List },
  { href: '/laboratory/specimens', label: 'Specimens', icon: TestTube },
  { href: '/laboratory/results', label: 'Enter Results', icon: FlaskConical },
  { href: '/laboratory/validation', label: 'Validation', icon: CheckCircle },
];
export default function LabLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout role="LAB_TECHNICIAN" navItems={nav}>{children}</DashboardLayout>;
}
