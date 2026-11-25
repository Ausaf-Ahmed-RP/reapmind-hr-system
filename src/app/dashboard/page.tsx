'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  Clock,
  CheckCircle,
  PauseCircle,
  XCircle,
  Search,
  Filter,
  Download,
  UserPlus,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Eye,
  QrCode,
  Briefcase,
} from 'lucide-react';
import Navbar from '@/components/Navbar';

interface Candidate {
  id: string;
  candidateId: string;
  fullName: string;
  mobile: string;
  email: string;
  position: string;
  source: string;
  status: string;
  createdAt: string;
  uploadedBy: { id: string; name: string };
  assignedTo?: { id: string; name: string } | null;
  files: { id: string; fileType: string; fileName: string }[];
  _count: { feedbacks: number };
}

interface Stats {
  totalCandidates: number;
  newToday: number;
  unassigned: number;
  interviewPending: number;
  interviewed: number;
  shortlisted: number;
  onHold: number;
  rejected: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [user, setUser] = useState<{ id: string; name: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'unassigned' | 'my'>('all');

  // Interviewers list for quick assign
  const [interviewers, setInterviewers] = useState<{ id: string; name: string }[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const fetchCandidates = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (positionFilter) params.set('position', positionFilter);
      if (sourceFilter) params.set('source', sourceFilter);
      if (activeTab === 'unassigned') params.set('unassigned', 'true');
      if (activeTab === 'my') params.set('myCandidates', 'true');

      const res = await fetch(`/api/candidates?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, positionFilter, sourceFilter, activeTab]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/dashboard/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMasterLists = async () => {
    try {
      const res = await fetch('/api/master-lists');
      if (res.ok) {
        const data = await res.json();
        setInterviewers(data.interviewers || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUser = async () => {
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

  useEffect(() => {
    fetchUser();
    fetchStats();
    fetchMasterLists();
  }, []);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  // Real-time updates via SSE
  useEffect(() => {
    const eventSource = new EventSource('/api/events');

    eventSource.addEventListener('candidate:created', () => {
      fetchStats();
      fetchCandidates();
    });

    eventSource.addEventListener('candidate:assigned', () => {
      fetchStats();
      fetchCandidates();
    });

    eventSource.addEventListener('feedback:added', () => {
      fetchStats();
      fetchCandidates();
    });

    return () => {
      eventSource.close();
    };
  }, [fetchCandidates]);

  const handleAssign = async (candidateId: string, assignedToId: string) => {
    setAssigningId(candidateId);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedToId, round: 'Screening' }),
      });
      if (res.ok) {
        fetchCandidates();
        fetchStats();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAssigningId(null);
    }
  };

  const statusBadgeColor: Record<string, string> = {
    New: 'bg-reapmind-blue/15 text-reapmind-blue border-reapmind-blue/30',
    Assigned: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    'Interview Pending': 'bg-reapmind-yellow/15 text-reapmind-yellow border-reapmind-yellow/30',
    Interviewed: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    Shortlisted: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    'On Hold': 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    Rejected: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col selection:bg-reapmind-blue selection:text-white">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-reapmind-yellow font-mono">
                REAPMIND OPERATIONS
              </span>
              <span className="text-neutral-500">•</span>
              <span className="text-xs text-neutral-400">Live Intake &amp; Interview Stream</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-0.5">
              Candidate Tracking Dashboard
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/apply"
              target="_blank"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white/[0.05] hover:bg-white/[0.1] text-neutral-300 border border-white/[0.1] rounded-full text-xs font-semibold transition"
              title="Open Public Candidate Apply Link"
            >
              <QrCode className="w-3.5 h-3.5 text-reapmind-yellow" />
              <span>Student Apply Link</span>
            </Link>

            {user?.role !== 'FRONT_DESK' && (
              <a
                href="/api/candidates/export"
                download
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white/[0.05] hover:bg-white/[0.1] text-neutral-300 border border-white/[0.1] rounded-full text-xs font-semibold transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </a>
            )}

            {(user?.role === 'FRONT_DESK' || user?.role === 'HR' || user?.role === 'ADMIN') && (
              <Link
                href="/intake"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-reapmind-blue hover:bg-reapmind-blue-hover text-white rounded-full text-xs font-bold shadow-lg shadow-reapmind-blue/25 transition transform active:scale-95"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add Candidate</span>
              </Link>
            )}
          </div>
        </div>

        {/* Metric Cards (DASH-1) */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-reapmind-header border border-white/[0.08] rounded-2xl p-4">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block font-mono">
                New Today
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-white mt-1 block font-mono">
                {stats.newToday}
              </span>
            </div>
            <div className="bg-reapmind-header border border-white/[0.08] rounded-2xl p-4">
              <span className="text-[10px] font-bold text-reapmind-yellow uppercase tracking-wider block font-mono">
                Unassigned
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-reapmind-yellow mt-1 block font-mono">
                {stats.unassigned}
              </span>
            </div>
            <div className="bg-reapmind-header border border-white/[0.08] rounded-2xl p-4">
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block font-mono">
                Int. Pending
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-purple-300 mt-1 block font-mono">
                {stats.interviewPending}
              </span>
            </div>
            <div className="bg-reapmind-header border border-white/[0.08] rounded-2xl p-4">
              <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider block font-mono">
                Interviewed
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-teal-300 mt-1 block font-mono">
                {stats.interviewed}
              </span>
            </div>
            <div className="bg-reapmind-header border border-white/[0.08] rounded-2xl p-4">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block font-mono">
                Shortlisted
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-1 block font-mono">
                {stats.shortlisted}
              </span>
            </div>
            <div className="bg-reapmind-header border border-white/[0.08] rounded-2xl p-4">
              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider block font-mono">
                On Hold
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-orange-300 mt-1 block font-mono">
                {stats.onHold}
              </span>
            </div>
            <div className="bg-reapmind-header border border-white/[0.08] rounded-2xl p-4">
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block font-mono">
                Rejected
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-rose-400 mt-1 block font-mono">
                {stats.rejected}
              </span>
            </div>
          </div>
        )}

        {/* Quick Views & Data Table Container */}
        <div className="bg-reapmind-header border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
            {/* Quick Views Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-2 rounded-full text-xs font-bold transition ${
                  activeTab === 'all'
                    ? 'bg-reapmind-blue text-white shadow'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                All Candidates ({stats?.totalCandidates ?? 0})
              </button>
              {user?.role !== 'FRONT_DESK' && (
                <>
                  <button
                    onClick={() => setActiveTab('unassigned')}
                    className={`px-4 py-2 rounded-full text-xs font-bold transition ${
                      activeTab === 'unassigned'
                        ? 'bg-reapmind-blue text-white shadow'
                        : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    Unassigned ({stats?.unassigned ?? 0})
                  </button>
                  <button
                    onClick={() => setActiveTab('my')}
                    className={`px-4 py-2 rounded-full text-xs font-bold transition ${
                      activeTab === 'my'
                        ? 'bg-reapmind-blue text-white shadow'
                        : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    My Candidates
                  </button>
                </>
              )}
            </div>

            <div className="text-xs text-neutral-400 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-reapmind-yellow opacity-80"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-reapmind-yellow"></span>
              </span>
              <span className="font-mono text-[11px]">Live WebSocket Sync Active</span>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-500 absolute left-4 top-3" />
              <input
                type="text"
                placeholder="Search name, phone, email, ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-black/60 border border-white/[0.1] rounded-full text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue"
              />
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2.5 bg-black/60 border border-white/[0.1] rounded-full text-xs text-white focus:outline-none focus:border-reapmind-blue"
              >
                <option value="" className="bg-neutral-900">All Statuses</option>
                <option value="New" className="bg-neutral-900">New</option>
                <option value="Assigned" className="bg-neutral-900">Assigned</option>
                <option value="Interview Pending" className="bg-neutral-900">Interview Pending</option>
                <option value="Interviewed" className="bg-neutral-900">Interviewed</option>
                <option value="Shortlisted" className="bg-neutral-900">Shortlisted</option>
                <option value="On Hold" className="bg-neutral-900">On Hold</option>
                <option value="Rejected" className="bg-neutral-900">Rejected</option>
              </select>
            </div>

            <div>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full px-4 py-2.5 bg-black/60 border border-white/[0.1] rounded-full text-xs text-white focus:outline-none focus:border-reapmind-blue"
              >
                <option value="" className="bg-neutral-900">All Sources</option>
                <option value="Walk-in" className="bg-neutral-900">Walk-in</option>
                <option value="Student Self-Apply" className="bg-neutral-900">Student Self-Apply</option>
                <option value="Referral" className="bg-neutral-900">Referral</option>
                <option value="Job portal" className="bg-neutral-900">Job portal</option>
                <option value="Consultant" className="bg-neutral-900">Consultant</option>
                <option value="Other" className="bg-neutral-900">Other</option>
              </select>
            </div>

            <div>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                  setPositionFilter('');
                  setSourceFilter('');
                  setActiveTab('all');
                }}
                className="w-full py-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-xs font-semibold rounded-full transition"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-black/60 border-b border-white/[0.08] text-neutral-400 font-semibold uppercase tracking-wider font-mono">
                  <th className="py-3 px-4">Candidate ID</th>
                  <th className="py-3 px-4">Name &amp; Contact</th>
                  <th className="py-3 px-4">Position</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Date Added</th>
                  <th className="py-3 px-4">Assigned Interviewer</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] bg-black/30">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-neutral-500">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-reapmind-blue" />
                      Loading candidate stream...
                    </td>
                  </tr>
                ) : candidates.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-neutral-500">
                      No candidates found.
                    </td>
                  </tr>
                ) : (
                  candidates.map((c) => (
                    <tr key={c.id} className="hover:bg-white/[0.03] transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-reapmind-yellow whitespace-nowrap">
                        <Link href={`/candidates/${c.id}`} className="hover:underline flex items-center gap-1.5">
                          <span>{c.candidateId}</span>
                          <ExternalLink className="w-3 h-3 text-neutral-500" />
                        </Link>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white text-sm">{c.fullName}</div>
                        <div className="text-[11px] text-neutral-400 mt-0.5">
                          +91 {c.mobile} • {c.email}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-200 font-medium">{c.position}</td>
                      <td className="py-3.5 px-4">
                        <span className="text-[10px] text-neutral-300 bg-white/[0.06] px-2.5 py-1 rounded-full border border-white/[0.08]">
                          {c.source}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-400 whitespace-nowrap">
                        <div>{new Date(c.createdAt).toLocaleDateString('en-IN')}</div>
                        <div className="text-[10px] text-neutral-500">by {c.uploadedBy?.name}</div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {user?.role !== 'FRONT_DESK' ? (
                          <select
                            value={c.assignedTo?.id || ''}
                            disabled={assigningId === c.id}
                            onChange={(e) => handleAssign(c.id, e.target.value)}
                            className="bg-black/70 border border-white/[0.12] rounded-full px-3 py-1 text-xs text-white focus:outline-none focus:border-reapmind-blue"
                          >
                            <option value="" className="bg-neutral-900">-- Unassigned --</option>
                            {interviewers.map((inv) => (
                              <option key={inv.id} value={inv.id} className="bg-neutral-900 text-white">
                                {inv.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-neutral-400 font-medium">
                            {c.assignedTo?.name || 'Unassigned'}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-3 py-1 rounded-full border tracking-wide uppercase font-mono ${
                            statusBadgeColor[c.status] || 'bg-white/5 text-neutral-400'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <Link
                          href={`/candidates/${c.id}`}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-reapmind-blue/20 hover:bg-reapmind-blue text-reapmind-blue hover:text-white border border-reapmind-blue/40 rounded-full font-bold transition text-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
