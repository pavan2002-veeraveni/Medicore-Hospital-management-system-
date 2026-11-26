'use client';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Home, Users, Heart, ClipboardList } from 'lucide-react';
const nav = [
  { href: '/nurse/dashboard', label: 'Dashboard', icon: Home },
  { href: '/nurse/patients', label: 'Assigned Patients', icon: Users },
  { href: '/nurse/vitals', label: 'Vital Signs', icon: Heart },
  { href: '/nurse/tasks', label: 'Care Tasks', icon: ClipboardList },
];
export default function NurseLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout role="NURSE" navItems={nav}>{children}</DashboardLayout>;
}
