'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Upload,
  Camera,
  CheckCircle2,
  AlertTriangle,
  FileText,
  UserPlus,
  RefreshCw,
  QrCode,
  ExternalLink,
  ShieldCheck,
  FileCheck,
  Eye,
  Clock,
  UserCheck,
} from 'lucide-react';
import CameraScannerModal from '@/components/CameraScannerModal';
import Navbar from '@/components/Navbar';

interface MasterItem {
  id: string;
  category: string;
  label: string;
  value: string;
}

interface PendingCandidate {
  id: string;
  candidateId: string;
  fullName: string;
  mobile: string;
  email: string;
  position: string;
  source: string;
  createdAt: string;
  remarks?: string | null;
}

export default function CandidateIntakePage() {
  const router = useRouter();

  // Form fields
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [source, setSource] = useState('Walk-in');
  const [remarks, setRemarks] = useState('');
  const [consent, setConsent] = useState(true);

  // Resume
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [cameraPages, setCameraPages] = useState<{ pageNumber: number; dataUrl: string }[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // Master lists
  const [positions, setPositions] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);

  // Self-Applied Queue
  const [pendingQueue, setPendingQueue] = useState<PendingCandidate[]>([]);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Duplicate Check
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [duplicateReason, setDuplicateReason] = useState('');
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  // Status & Confirmation
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCandidate, setCreatedCandidate] = useState<{
    id: string;
    candidateId: string;
    fullName: string;
    position: string;
  } | null>(null);

  useEffect(() => {
    fetchMasterLists();
    fetchPendingQueue();

    // Listen for live SSE self-applied walk-in events
    const eventSource = new EventSource('/api/events');
    eventSource.addEventListener('candidate:created', () => {
      fetchPendingQueue();
    });
    return () => {
      eventSource.close();
    };
  }, []);

  const fetchMasterLists = async () => {
    try {
      const res = await fetch('/api/master-lists');
      if (res.ok) {
        const data = await res.json();
        const pos = data.items.filter((i: MasterItem) => i.category === 'POSITION').map((i: MasterItem) => i.label);
        const src = data.items.filter((i: MasterItem) => i.category === 'SOURCE').map((i: MasterItem) => i.label);
        setPositions(pos.length > 0 ? pos : ['Software Engineer', 'Full Stack Developer', 'QA Engineer', 'UI Designer']);
        setSources(src.length > 0 ? src : ['Walk-in', 'Referral', 'Job portal', 'Consultant', 'Other']);
        if (pos.length > 0) setPosition(pos[0]);
      }
    } catch (e) {
      console.error('Failed to load master lists:', e);
    }
  };

  const fetchPendingQueue = async () => {
    try {
      const res = await fetch('/api/candidates?source=Student%20Self-Apply&limit=10');
      if (res.ok) {
        const data = await res.json();
        setPendingQueue(data.candidates || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        setError('Resume file size exceeds the 10 MB limit.');
        return;
      }
      setResumeFile(file);
      setCameraPages([]);
      setError(null);
    }
  };

  const handleCameraPagesSaved = (pages: { pageNumber: number; dataUrl: string }[]) => {
    setCameraPages(pages);
    setResumeFile(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent, forceDuplicate = false) => {
    e.preventDefault();
    setError(null);

    const cleanPhone = mobile.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (!resumeFile && cameraPages.length === 0) {
      setError('Please upload a resume file or scan pages using the camera.');
      return;
    }

    if (!consent) {
      setError('Candidate consent under the DPDP Act 2023 must be confirmed.');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('fullName', fullName);
      formData.append('mobile', cleanPhone);
      formData.append('email', email);
      formData.append('position', position);
      formData.append('source', source);
      formData.append('remarks', remarks);
      formData.append('consent', 'true');

      if (forceDuplicate) {
        formData.append('ignoreDuplicate', 'true');
        formData.append('duplicateReason', duplicateReason || 'Re-application confirmed at front desk');
      }

      if (resumeFile) {
        formData.append('resumeFile', resumeFile);
      } else if (cameraPages.length > 0) {
        formData.append('cameraPages', JSON.stringify(cameraPages));
      }

      const res = await fetch('/api/candidates', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.status === 409 && data.duplicateFound) {
        setDuplicateWarning(data.message);
        setShowDuplicateModal(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save candidate.');
      }

      setCreatedCandidate(data.candidate);
      setShowDuplicateModal(false);
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFullName('');
    setMobile('');
    setEmail('');
    setRemarks('');
    setResumeFile(null);
    setCameraPages([]);
    setCreatedCandidate(null);
    setDuplicateWarning(null);
    setDuplicateReason('');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col selection:bg-reapmind-blue selection:text-white">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* RECEPTION QR CODE / STUDENT SELF-APPLY BANNER */}
        <div className="bg-gradient-to-r from-reapmind-header to-reapmind-card border border-reapmind-yellow/30 rounded-3xl p-6 sm:p-7 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-reapmind-yellow/10 border border-reapmind-yellow/30 flex items-center justify-center text-reapmind-yellow flex-shrink-0">
                <QrCode className="w-8 h-8" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-reapmind-yellow font-mono block">
                  WALK-IN SELF-SERVICE KIOSK ACTIVE
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-white mt-0.5">
                  Let Students Apply from Their Own Phones
                </h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-xl leading-relaxed">
                  Avoid crowds and lines at the front desk. Ask candidates to open or scan the QR code to fill out their
                  details and upload their resume in 2 minutes while seated.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <Link
                href="/apply"
                target="_blank"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-reapmind-yellow hover:bg-reapmind-yellow-soft text-black font-bold text-xs rounded-full shadow-lg transition"
              >
                <span>Open Student Form</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* SELF-APPLIED QUEUE (If any students checked in) */}
        {pendingQueue.length > 0 && (
          <div className="bg-reapmind-header border border-white/[0.08] rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Self-Applied Student Queue ({pendingQueue.length} Waiting)
                </h3>
              </div>
              <span className="text-xs text-reapmind-yellow font-mono">Live Reception Queue</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pendingQueue.map((c) => (
                <div
                  key={c.id}
                  className="bg-black/60 border border-white/[0.08] hover:border-reapmind-blue/50 rounded-2xl p-4 transition flex items-center justify-between gap-3"
                >
                  <div>
                    <span className="text-[10px] font-mono text-reapmind-yellow bg-reapmind-yellow/10 border border-reapmind-yellow/20 px-2 py-0.5 rounded-full font-bold">
                      {c.candidateId}
                    </span>
                    <h4 className="font-bold text-white text-sm mt-1">{c.fullName}</h4>
                    <p className="text-xs text-neutral-400">{c.position}</p>
                    <span className="text-[10px] text-neutral-500 mt-1 block">
                      Submitted: {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <Link
                    href={`/candidates/${c.id}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-semibold rounded-full shadow transition flex-shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Verify &amp; Assign</span>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MANUAL DIRECT INTAKE FORM (When Front Desk enters walk-in) */}
        <div className="bg-reapmind-header border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-white/[0.08]">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Manual Candidate Intake</h2>
              <p className="text-xs text-neutral-400 mt-1">
                Enter walk-in details and scan paper resume or upload document under 1 minute.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full w-fit">
              <ShieldCheck className="w-4 h-4" />
              <span>DPDP Act 2023 Compliant</span>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3 text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                  Full Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aniket Kulkarni"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue focus:ring-2 focus:ring-reapmind-blue/20 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                  Mobile Number <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-sm text-neutral-500 font-medium">+91</span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="9876543210"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-12 pr-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue focus:ring-2 focus:ring-reapmind-blue/20 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                  Email Address <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="aniket.kulkarni@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue focus:ring-2 focus:ring-reapmind-blue/20 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                  Position Applied For <span className="text-rose-400">*</span>
                </label>
                <select
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white focus:outline-none focus:border-reapmind-blue focus:ring-2 focus:ring-reapmind-blue/20 transition"
                >
                  {positions.map((p) => (
                    <option key={p} value={p} className="bg-neutral-900 text-white">
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                  Source <span className="text-rose-400">*</span>
                </label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white focus:outline-none focus:border-reapmind-blue focus:ring-2 focus:ring-reapmind-blue/20 transition"
                >
                  {sources.map((s) => (
                    <option key={s} value={s} className="bg-neutral-900 text-white">
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                  Optional Front Desk Remarks
                </label>
                <input
                  type="text"
                  placeholder="Carrying original marksheets, referred by employee..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue focus:ring-2 focus:ring-reapmind-blue/20 transition"
                />
              </div>
            </div>

            {/* Resume Upload / Camera */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                Resume Document / Camera Scan <span className="text-rose-400">*</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label
                  className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition ${
                    resumeFile
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-white/[0.1] bg-black/40 hover:border-reapmind-blue/60 hover:bg-black/60'
                  }`}
                >
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                  <Upload
                    className={`w-7 h-7 mb-2 ${resumeFile ? 'text-emerald-400' : 'text-neutral-400'}`}
                  />
                  <span className="text-sm font-semibold text-white truncate max-w-[240px]">
                    {resumeFile ? resumeFile.name : 'Upload Resume File'}
                  </span>
                  <span className="text-xs text-neutral-500 mt-1">
                    {resumeFile ? `${(resumeFile.size / 1024 / 1024).toFixed(2)} MB attached` : 'PDF, DOCX, JPG up to 10 MB'}
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl transition ${
                    cameraPages.length > 0
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-white/[0.1] bg-black/40 hover:border-reapmind-yellow/60 hover:bg-black/60'
                  }`}
                >
                  <Camera
                    className={`w-7 h-7 mb-2 ${cameraPages.length > 0 ? 'text-emerald-400' : 'text-reapmind-yellow'}`}
                  />
                  <span className="text-sm font-semibold text-white">Scan with Camera</span>
                  <span className="text-xs text-neutral-500 mt-1">
                    {cameraPages.length > 0
                      ? `${cameraPages.length} pages captured & merged into PDF`
                      : 'Webcam or tablet camera (multi-page)'}
                  </span>
                </button>
              </div>
            </div>

            {/* Consent Line */}
            <div className="pt-2 border-t border-white/[0.08]">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-neutral-700 text-reapmind-blue focus:ring-reapmind-blue bg-black/60"
                />
                <span className="text-xs text-neutral-400 leading-relaxed">
                  Candidate has been briefed on personal data storage under the Digital Personal Data Protection Act,
                  2023.
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto px-8 min-h-[48px] bg-reapmind-blue hover:bg-reapmind-blue-hover disabled:opacity-50 text-white font-semibold text-sm rounded-full shadow-lg shadow-reapmind-blue/25 transition transform active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Broadcasting to HR Dashboard...</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4" />
                    <span>Save Candidate &amp; Notify HR</span>
                  </>
                )}
              </button>
            </div>
          </form>

          <CameraScannerModal
            isOpen={isCameraOpen}
            onClose={() => setIsCameraOpen(false)}
            onSavePages={handleCameraPagesSaved}
          />
        </div>

        {/* SUCCESS CONFIRMATION MODAL */}
        {createdCandidate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="bg-reapmind-header border border-emerald-500/50 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/40">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h3 className="text-xl font-bold text-white mb-1">Candidate Saved &amp; Live!</h3>
              <p className="text-neutral-400 text-xs mb-4">
                Record broadcasted to HR (Aayushi, Hema, Mahwash) and Director (Aroof) without refreshing.
              </p>

              <div className="bg-black/60 rounded-2xl p-4 border border-white/[0.08] text-left mb-6">
                <div className="text-[10px] text-neutral-500 uppercase font-mono font-bold">Candidate ID</div>
                <div className="text-2xl font-black text-reapmind-yellow font-mono">{createdCandidate.candidateId}</div>
                <div className="text-sm font-semibold text-white mt-1">{createdCandidate.fullName}</div>
                <div className="text-xs text-neutral-400">{createdCandidate.position}</div>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full py-3 bg-reapmind-blue hover:bg-reapmind-blue-hover text-white font-semibold rounded-full transition shadow-lg text-xs"
                >
                  Register Next Walk-in
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard')}
                  className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-neutral-300 font-medium rounded-full transition text-xs"
                >
                  Go to Live Dashboard
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
