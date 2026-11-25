'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Settings,
  ShieldAlert,
  UserPlus,
  CheckCircle,
  XCircle,
  Search,
  Filter,
  Lock,
  RefreshCw,
  Plus,
  Shield,
  QrCode,
  Printer,
  ExternalLink,
} from 'lucide-react';
import Navbar from '@/components/Navbar';

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  mobile?: string;
  isActive: boolean;
  lastLogin?: string;
  _count: { feedbacks: number; uploadedCandidates: number };
}

interface AuditLogItem {
  id: string;
  userName?: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
  createdAt: string;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'settings' | 'audit' | 'kiosk'>('users');
  const [loading, setLoading] = useState(true);

  // Users State
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('HR');
  const [newUserPassword, setNewUserPassword] = useState('Password@123');
  const [newUserMobile, setNewUserMobile] = useState('');
  const [userActionLoading, setUserActionLoading] = useState(false);

  // Settings State
  const [frontDeskAssign, setFrontDeskAssign] = useState(false);
  const [retentionMonths, setRetentionMonths] = useState('12');
  const [newPosition, setNewPosition] = useState('');
  const [newSource, setNewSource] = useState('');

  // Audit Logs State
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');

  useEffect(() => {
    fetchUsers();
    fetchSettings();
    fetchAuditLogs();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      if (res.ok) {
        const data = await res.json();
        const fd = data.settings.find((s: any) => s.key === 'FRONT_DESK_ASSIGNMENT_ALLOWED');
        const ret = data.settings.find((s: any) => s.key === 'RETENTION_PERIOD_MONTHS');
        if (fd) setFrontDeskAssign(fd.value === 'true');
        if (ret) setRetentionMonths(ret.value);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (auditActionFilter) params.set('action', auditActionFilter);
      if (auditSearch) params.set('search', auditSearch);
      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleUserActive = async (userId: string, currentActive: boolean) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isActive: !currentActive }),
      });
      if (res.ok) fetchUsers();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (res.ok) fetchUsers();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserActionLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          role: newUserRole,
          password: newUserPassword,
          mobile: newUserMobile,
        }),
      });
      if (res.ok) {
        setIsNewUserModalOpen(false);
        setNewUserName('');
        setNewUserEmail('');
        setNewUserMobile('');
        fetchUsers();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: [
            { key: 'FRONT_DESK_ASSIGNMENT_ALLOWED', value: frontDeskAssign ? 'true' : 'false' },
            { key: 'RETENTION_PERIOD_MONTHS', value: retentionMonths },
          ],
        }),
      });
      alert('Settings saved successfully!');
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddMasterItem = async (category: string, label: string) => {
    if (!label.trim()) return;
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newMasterItem: { category, label },
        }),
      });
      if (category === 'POSITION') setNewPosition('');
      if (category === 'SOURCE') setNewSource('');
      alert(`New ${category.toLowerCase()} added!`);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col selection:bg-reapmind-blue selection:text-white">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Admin Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <Shield className="w-7 h-7 text-rose-500" />
              <span>System Administration</span>
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1">
              Account RBAC, student kiosk settings, master lists, and DPDP Act 2023 tamper-proof audit trail.
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 bg-reapmind-header border border-white/[0.08] p-1.5 rounded-full">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                activeTab === 'users' ? 'bg-reapmind-blue text-white shadow' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Accounts
            </button>
            <button
              onClick={() => setActiveTab('kiosk')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                activeTab === 'kiosk' ? 'bg-reapmind-blue text-white shadow' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Reception Kiosk / QR
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                activeTab === 'settings' ? 'bg-reapmind-blue text-white shadow' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Lists &amp; Rules
            </button>
            <button
              onClick={() => {
                setActiveTab('audit');
                fetchAuditLogs();
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                activeTab === 'audit' ? 'bg-reapmind-blue text-white shadow' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Audit Trail
            </button>
          </div>
        </div>

        {/* TAB 1: USERS & ROLES */}
        {activeTab === 'users' && (
          <div className="bg-reapmind-header border border-white/[0.08] rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div>
                <h3 className="text-base font-bold text-white">System Accounts &amp; Permissions</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Manage logins for Front Desk, HR, Directors, CEO, and Admins.
                </p>
              </div>

              <button
                onClick={() => setIsNewUserModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-bold rounded-full shadow-lg shadow-reapmind-blue/20 transition"
              >
                <UserPlus className="w-4 h-4" /> Add User
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-black/60 text-neutral-400 border-b border-white/[0.08] uppercase tracking-wider font-mono">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Last Login</th>
                    <th className="py-3 px-4">Activity Count</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] bg-black/30">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white text-sm">{u.name}</div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">{u.email}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className="bg-black/80 border border-white/[0.12] rounded-full px-3 py-1 text-xs text-white"
                        >
                          <option value="FRONT_DESK" className="bg-neutral-900">FRONT_DESK</option>
                          <option value="HR" className="bg-neutral-900">HR</option>
                          <option value="DIRECTOR" className="bg-neutral-900">DIRECTOR</option>
                          <option value="CEO" className="bg-neutral-900">CEO</option>
                          <option value="ADMIN" className="bg-neutral-900">ADMIN</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-3 py-0.5 rounded-full text-[10px] font-bold border font-mono uppercase tracking-wide ${
                            u.isActive
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {u.isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-400 font-mono">
                        {u.lastLogin ? new Date(u.lastLogin).toLocaleString('en-IN') : 'Never'}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-400">
                        {u._count.feedbacks} reviews • {u._count.uploadedCandidates} intakes
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleToggleUserActive(u.id, u.isActive)}
                          className={`text-xs font-semibold px-4 py-1 rounded-full border transition ${
                            u.isActive
                              ? 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10'
                              : 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10'
                          }`}
                        >
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: RECEPTION KIOSK & QR CODE */}
        {activeTab === 'kiosk' && (
          <div className="bg-reapmind-header border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-reapmind-yellow font-mono">
                  FRONT DESK SELF-APPLY KIOSK
                </span>
                <h3 className="text-xl font-bold text-white mt-1">Candidate Reception QR Code</h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-xl">
                  Display this link on a front desk tablet or print the QR card for candidates to scan with their phones.
                </p>
              </div>

              <Link
                href="/apply"
                target="_blank"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-bold rounded-full shadow transition"
              >
                <span>Launch Kiosk View</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* Printable Standee Card */}
              <div className="bg-white text-black p-8 rounded-3xl shadow-2xl text-center max-w-sm mx-auto w-full border-4 border-neutral-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/reapmind-logo.png"
                  alt="ReapMind Innovations"
                  className="h-10 w-auto object-contain mx-auto mb-4"
                />
                <span className="text-[11px] font-black uppercase tracking-wider text-reapmind-blue font-mono block">
                  WALK-IN CANDIDATE CHECK-IN
                </span>
                <h4 className="text-xl font-extrabold text-neutral-900 mt-1 mb-4">
                  Scan to Submit Your Resume
                </h4>

                <div className="w-48 h-48 bg-neutral-100 border-2 border-dashed border-neutral-300 rounded-2xl flex flex-col items-center justify-center mx-auto mb-4 p-4">
                  <QrCode className="w-32 h-32 text-neutral-800 mb-1" />
                  <span className="text-[10px] font-mono font-bold text-neutral-500">http://localhost:3000/apply</span>
                </div>

                <p className="text-xs text-neutral-600 leading-relaxed">
                  Open your camera, point at the QR code, fill out your details, and take a seat!
                </p>
              </div>

              {/* Instructions */}
              <div className="space-y-4">
                <div className="bg-black/60 border border-white/[0.08] p-5 rounded-2xl">
                  <h5 className="text-sm font-bold text-white mb-2">How It Works at Reception:</h5>
                  <ol className="list-decimal pl-4 space-y-2 text-xs text-neutral-300">
                    <li>Place the printed QR code on the reception desk or tablet stand.</li>
                    <li>Students and walk-ins scan the code with their mobile cameras.</li>
                    <li>They fill in their name, mobile, email, college, and take a photo of their resume.</li>
                    <li>The submission appears instantly in the Front Desk Queue for verification and assignment.</li>
                  </ol>
                </div>

                <div className="bg-black/60 border border-white/[0.08] p-5 rounded-2xl">
                  <h5 className="text-sm font-bold text-white mb-1">Direct URL for Reception Tablets:</h5>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      readOnly
                      value="http://localhost:3000/apply"
                      className="flex-1 px-4 py-2 bg-neutral-900 border border-white/[0.1] rounded-full text-xs text-neutral-300 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText('http://localhost:3000/apply')}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-semibold"
                    >
                      Copy URL
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: MASTER LISTS & SYSTEM SETTINGS */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-reapmind-header border border-white/[0.08] rounded-3xl p-6 shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-white">System Policies</h3>
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between p-4 bg-black/60 border border-white/[0.08] rounded-2xl">
                  <div>
                    <strong className="text-xs text-white block">Allow Front Desk Candidate Assignment</strong>
                    <span className="text-[11px] text-neutral-400">
                      When enabled, Front Desk executive can assign interviewer during intake.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={frontDeskAssign}
                    onChange={(e) => setFrontDeskAssign(e.target.checked)}
                    className="w-4 h-4 rounded text-reapmind-blue focus:ring-reapmind-blue"
                  />
                </div>

                <div className="p-4 bg-black/60 border border-white/[0.08] rounded-2xl">
                  <label className="block text-xs font-semibold text-white mb-1">
                    Candidate Data Retention (Months)
                  </label>
                  <span className="text-[11px] text-neutral-400 block mb-3">
                    Retention window for rejected candidate personal data under DPDP Act 2023.
                  </span>
                  <input
                    type="number"
                    value={retentionMonths}
                    onChange={(e) => setRetentionMonths(e.target.value)}
                    className="w-32 px-4 py-2 bg-neutral-900 border border-white/[0.1] rounded-full text-xs text-white"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-6 py-2.5 bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-bold rounded-full transition shadow-lg shadow-reapmind-blue/20"
                >
                  Save System Policies
                </button>
              </div>
            </div>

            <div className="bg-reapmind-header border border-white/[0.08] rounded-3xl p-6 shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-white">Master List Additions</h3>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Add New Job Position</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. AI Prompt Engineer"
                      value={newPosition}
                      onChange={(e) => setNewPosition(e.target.value)}
                      className="flex-1 px-4 py-2 bg-black/60 border border-white/[0.1] rounded-full text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddMasterItem('POSITION', newPosition)}
                      className="px-5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-full transition"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Add Candidate Source</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Campus Placement"
                      value={newSource}
                      onChange={(e) => setNewSource(e.target.value)}
                      className="flex-1 px-4 py-2 bg-black/60 border border-white/[0.1] rounded-full text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddMasterItem('SOURCE', newSource)}
                      className="px-5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-full transition"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: AUDIT TRAIL LEDGER */}
        {activeTab === 'audit' && (
          <div className="bg-reapmind-header border border-white/[0.08] rounded-3xl p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">Tamper-Proof DPDP Audit Ledger</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Append-only immutable event record of views, downloads, logins, and interview evaluations.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="px-4 py-2 bg-black/60 border border-white/[0.1] rounded-full text-xs text-white"
                />
                <button
                  type="button"
                  onClick={fetchAuditLogs}
                  className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition"
                  title="Refresh Audit Logs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="bg-black/60 text-neutral-400 border-b border-white/[0.08] uppercase tracking-wider">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Entity</th>
                    <th className="py-3 px-4">Details</th>
                    <th className="py-3 px-4">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] bg-black/30">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-neutral-500 font-sans">
                        No audit records found.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-white/[0.02] transition">
                        <td className="py-3.5 px-4 text-neutral-400 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3.5 px-4 text-white font-sans">{log.userName || 'System'}</td>
                        <td className="py-3.5 px-4">
                          <span className="text-reapmind-yellow bg-reapmind-yellow/10 px-2.5 py-0.5 rounded-full border border-reapmind-yellow/20 font-bold">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-neutral-300">{log.entity}</td>
                        <td className="py-3.5 px-4 text-neutral-300 font-sans max-w-xs truncate" title={log.details || ''}>
                          {log.details || '-'}
                        </td>
                        <td className="py-3.5 px-4 text-neutral-500 whitespace-nowrap">{log.ipAddress || '127.0.0.1'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CREATE USER MODAL */}
        {isNewUserModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="bg-reapmind-header border border-white/[0.12] rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-4">Create System Account</h3>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-black/60 border border-white/[0.1] rounded-full text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full px-4 py-2.5 bg-black/60 border border-white/[0.1] rounded-full text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">Role</label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="w-full px-4 py-2.5 bg-black/60 border border-white/[0.1] rounded-full text-xs text-white"
                  >
                    <option value="FRONT_DESK" className="bg-neutral-900">FRONT_DESK</option>
                    <option value="HR" className="bg-neutral-900">HR</option>
                    <option value="DIRECTOR" className="bg-neutral-900">DIRECTOR</option>
                    <option value="CEO" className="bg-neutral-900">CEO</option>
                    <option value="ADMIN" className="bg-neutral-900">ADMIN</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">Default Password</label>
                  <input
                    type="text"
                    required
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-black/60 border border-white/[0.1] rounded-full text-xs text-white"
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsNewUserModalOpen(false)}
                    className="px-4 py-2 text-xs text-neutral-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={userActionLoading}
                    className="px-6 py-2.5 bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-bold rounded-full"
                  >
                    {userActionLoading ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
