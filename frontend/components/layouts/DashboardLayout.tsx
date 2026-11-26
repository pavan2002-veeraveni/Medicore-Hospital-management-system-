'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Activity, Bell, LogOut, Menu, X, Check } from 'lucide-react';
import { useNotifications, useUnreadNotificationCount } from '@/hooks/useMedicore';
import { medicoreService } from '@/services/medicore';
import { useQueryClient } from '@tanstack/react-query';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
}

export default function DashboardLayout({
  children,
  role,
  navItems,
}: {
  children: React.ReactNode;
  role: string;
  navItems: { href: string; label: string; icon: React.ElementType }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) {
      qc.clear();
      router.push('/login');
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed.roles) || !parsed.roles.includes(role)) {
        qc.clear();
        router.push('/login');
        return;
      }
      setUser((prev) => (prev?.id === parsed.id ? prev : parsed));
    } catch {
      qc.clear();
      router.push('/login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const { data: unreadData } = useUnreadNotificationCount(Boolean(user));
  const { data: notifList } = useNotifications(Boolean(user));
  const unreadCount = unreadData?.unreadCount ?? 0;

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      if (refreshToken) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('accessToken') || ''}`,
          },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      // Ignore network errors during logout
    }
    qc.clear();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const handleMarkAllRead = async () => {
    try {
      await medicoreService.markAllNotificationsRead();
      qc.invalidateQueries({ queryKey: ['notifications'] });
    } catch {
      // Ignore transient failure
    }
  };

  const handleMarkRead = async (id: string, isRead: boolean) => {
    if (isRead) return;
    try {
      await medicoreService.markNotificationRead(id);
      qc.invalidateQueries({ queryKey: ['notifications'] });
    } catch {
      // Ignore transient failure
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-white border-r shadow-sm transition-transform duration-200 lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Sidebar Navigation"
      >
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <Activity className="h-7 w-7 text-sky-600" />
          <span className="text-xl font-bold text-gray-900">MediCore</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-4 space-y-1 px-3 pb-20">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-sky-50 text-sky-700'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t bg-white p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-5 w-5" /> Sign Out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white px-4 lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6 text-gray-600" />
          </button>

          <span className="hidden lg:inline-block rounded-md bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
            {role.replace(/_/g, ' ')} PORTAL
          </span>

          <div className="flex items-center gap-4 ml-auto relative">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-12 z-50 w-80 rounded-xl border bg-white shadow-lg">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <span className="text-sm font-semibold">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700"
                    >
                      <Check className="h-3.5 w-3.5" /> Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-64 divide-y overflow-y-auto">
                  {(notifList?.data || []).length === 0 ? (
                    <p className="p-4 text-xs text-gray-500 text-center">No notifications</p>
                  ) : (
                    (notifList?.data || []).map((n: any) => (
                      <div
                        key={n.id}
                        onClick={() => handleMarkRead(n.id, Boolean(n.isRead))}
                        className={`p-3 text-xs transition-colors ${n.isRead ? 'bg-white' : 'bg-sky-50/50 cursor-pointer hover:bg-sky-100/60'}`}
                      >
                        <p className="font-medium text-gray-900">{n.title}</p>
                        <p className="text-gray-600 mt-0.5">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-700 text-sm font-semibold">
                {user.firstName?.[0]}
                {user.lastName?.[0]}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
