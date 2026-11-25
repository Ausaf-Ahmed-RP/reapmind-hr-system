'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  LogOut,
  User,
  Shield,
  Layers,
  UserPlus,
  LayoutDashboard,
  Settings,
  ExternalLink,
  QrCode,
  CheckCircle,
  X,
} from 'lucide-react';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  candidateId?: string;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<{ id: string; name: string; email: string; role: string } | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showBellDropdown, setShowBellDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchSession();
    fetchNotifications();

    const eventSource = new EventSource('/api/events');

    eventSource.addEventListener('candidate:created', () => {
      fetchNotifications();
    });

    eventSource.addEventListener('candidate:assigned', () => {
      fetchNotifications();
    });

    eventSource.addEventListener('feedback:added', () => {
      fetchNotifications();
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount((data.notifications || []).filter((n: NotificationItem) => !n.read).length);
      }
    } catch (e) {
      // ignore
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications', { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const roleStyles: Record<string, string> = {
    FRONT_DESK: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    HR: 'bg-reapmind-blue/20 text-reapmind-blue border-reapmind-blue/40',
    DIRECTOR: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    CEO: 'bg-reapmind-yellow/10 text-reapmind-yellow border-reapmind-yellow/30',
    ADMIN: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  };

  return (
    <header className="sticky top-0 z-40 bg-reapmind-header/90 backdrop-blur-md border-b border-white/[0.08]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between py-2.5">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/reapmind-logo.png"
              alt="ReapMind Innovations"
              className="h-10 sm:h-11 w-auto object-contain brightness-0 invert transition-opacity group-hover:opacity-90"
            />
            <div className="hidden sm:block pl-3 border-l border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-reapmind-yellow block font-mono">
                HR OPERATIONS
              </span>
              <span className="text-xs text-reapmind-muted block -mt-0.5">
                Talent &amp; Interview Portal
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5">
            <Link
              href="/dashboard"
              className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
                pathname === '/dashboard'
                  ? 'bg-reapmind-blue text-white shadow-lg shadow-reapmind-blue/20'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </Link>

            {(user?.role === 'FRONT_DESK' || user?.role === 'HR' || user?.role === 'ADMIN') && (
              <Link
                href="/intake"
                className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
                  pathname === '/intake'
                    ? 'bg-reapmind-blue text-white shadow-lg shadow-reapmind-blue/20'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Front Desk Intake</span>
              </Link>
            )}

            {/* Student Self-Apply Portal Link */}
            <Link
              href="/apply"
              target="_blank"
              className="px-3.5 py-1.5 rounded-full text-xs font-medium text-reapmind-yellow-soft bg-reapmind-yellow/10 border border-reapmind-yellow/20 hover:bg-reapmind-yellow/20 transition flex items-center gap-1.5"
              title="Open Public Candidate / Student Application Form"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Student Apply Link</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </Link>

            {user?.role === 'ADMIN' && (
              <Link
                href="/admin"
                className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
                  pathname === '/admin'
                    ? 'bg-reapmind-blue text-white shadow-lg shadow-reapmind-blue/20'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Administration</span>
              </Link>
            )}
          </nav>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-3">
          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setShowBellDropdown((prev) => !prev)}
              className="relative p-2.5 text-neutral-400 hover:text-white rounded-full hover:bg-white/[0.05] transition"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-reapmind-yellow opacity-80"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-reapmind-yellow"></span>
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showBellDropdown && (
              <div className="absolute right-0 mt-3 w-84 bg-reapmind-card border border-white/[0.12] rounded-2xl shadow-2xl p-4 z-50 backdrop-blur-xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                  <span className="text-xs font-bold text-white tracking-wide uppercase font-mono">
                    Notifications {unreadCount > 0 && `(${unreadCount})`}
                  </span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-[11px] text-reapmind-blue hover:underline font-semibold"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.06] mt-2">
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center text-xs text-reapmind-muted">No new alerts.</div>
                  ) : (
                    notifications.slice(0, 10).map((n) => (
                      <div
                        key={n.id}
                        className={`py-2.5 px-2 text-xs transition ${
                          n.read ? 'opacity-60' : 'bg-reapmind-blue/10 rounded-xl'
                        }`}
                      >
                        <div className="font-semibold text-white">{n.title}</div>
                        <div className="text-neutral-400 mt-0.5 line-clamp-2">{n.message}</div>
                        <div className="text-[10px] text-reapmind-muted mt-1 font-mono">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile */}
          {user && (
            <div className="flex items-center gap-2.5 pl-3 border-l border-white/[0.08]">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-white">{user.name}</div>
                <div className="text-[10px] text-reapmind-muted truncate max-w-[130px]">{user.email}</div>
              </div>
              <span
                className={`text-[10px] font-bold px-3 py-1 rounded-full border tracking-wide uppercase font-mono ${
                  roleStyles[user.role] || 'bg-white/5 text-neutral-300'
                }`}
              >
                {user.role}
              </span>
            </div>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="p-2.5 text-neutral-400 hover:text-rose-400 rounded-full hover:bg-white/[0.05] transition"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
