'use client';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Home, Receipt, CreditCard, TrendingUp, FileText } from 'lucide-react';
const nav = [
  { href: '/billing/dashboard', label: 'Dashboard', icon: Home },
  { href: '/billing/invoices', label: 'Invoices', icon: Receipt },
  { href: '/billing/payments', label: 'Payments', icon: CreditCard },
  { href: '/billing/reports', label: 'Reports', icon: TrendingUp },
];
export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout role="BILLING_OFFICER" navItems={nav}>{children}</DashboardLayout>;
}
