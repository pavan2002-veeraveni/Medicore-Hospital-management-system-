'use client';

import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Home, Users, Shield, Building2, Settings, FileText, Activity, BarChart3 } from 'lucide-react';

const adminNav = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: Home },
  { href: '/admin/users', label: 'User Management', icon: Users },
  { href: '/admin/staff', label: 'Staff', icon: Users },
  { href: '/admin/departments', label: 'Departments', icon: Building2 },
  { href: '/admin/audit', label: 'Audit Logs', icon: Shield },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout role="HOSPITAL_ADMIN" navItems={adminNav}>{children}</DashboardLayout>;
}
