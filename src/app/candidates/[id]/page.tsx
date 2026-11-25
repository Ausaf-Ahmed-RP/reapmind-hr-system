'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  FileText,
  User,
  Phone,
  Mail,
  Calendar,
  Clock,
  Star,
  Download,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Plus,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  History,
  Edit3,
  X,
  RefreshCw,
  Award,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Camera,
} from 'lucide-react';
import Navbar from '@/components/Navbar';

interface CandidateFile {
  id: string;
  fileType: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  pageNumber?: number | null;
}

interface InterviewFeedback {
  id: string;
  interviewerId: string;
  interviewerName: string;
  round: string;
  interviewDate: string;
  rating: number;
  recommendation: string;
  comments: string;
  strengths?: string | null;
  concerns?: string | null;
  expectedCtc?: string | null;
  noticePeriod?: string | null;
  version: number;
  createdAt: string;
  editedAt?: string | null;
}

interface Assignment {
  id: string;
  round: string;
  assignedAt: string;
  assignedTo: { id: string; name: string; role: string };
  assignedBy: { id: string; name: string; role: string };
}

interface Candidate {
  id: string;
  candidateId: string;
  fullName: string;
  mobile: string;
  email: string;
  position: string;
  source: string;
  status: string;
  remarks?: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string };
  assignedTo?: { id: string; name: string } | null;
  files: CandidateFile[];
  assignments: Assignment[];
  feedbacks: InterviewFeedback[];
}

export default function CandidateProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resume Viewer Controls
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreenOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Assignment & Status Editing
  const [interviewers, setInterviewers] = useState<{ id: string; name: string }[]>([]);
  const [selectedInterviewer, setSelectedInterviewer] = useState('');
  const [status, setStatus] = useState('');

  // Feedback Modal
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackRound, setFeedbackRound] = useState('Screening');
  const [feedbackRating, setFeedbackRating] = useState(4);
  const [feedbackRecommendation, setFeedbackRecommendation] = useState('Select');
  const [feedbackComments, setFeedbackComments] = useState('');
  const [feedbackStrengths, setFeedbackStrengths] = useState('');
  const [feedbackConcerns, setFeedbackConcerns] = useState('');
  const [feedbackExpectedCtc, setFeedbackExpectedCtc] = useState('');
  const [feedbackNoticePeriod, setFeedbackNoticePeriod] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Edit / Addendum Feedback Modal
  const [editingFeedback, setEditingFeedback] = useState<InterviewFeedback | null>(null);
  const [editComments, setEditComments] = useState('');

  const fetchCandidate = useCallback(async () => {
    try {
      const res = await fetch(`/api/candidates/${id}`);
      if (!res.ok) {
        if (res.status === 403) throw new Error('You do not have permission to view this candidate.');
        throw new Error('Candidate not found.');
      }
      const data = await res.json();
      setCandidate(data.candidate);
      setStatus(data.candidate.status);
      setSelectedInterviewer(data.candidate.assignedTo?.id || '');

      const primary =
        data.candidate.files.find((f: CandidateFile) => f.fileType === 'RESUME') ||
        data.candidate.files[0];
      if (primary) setActiveFileId(primary.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchUserAndLists = async () => {
    try {
      const [userRes, listsRes] = await Promise.all([fetch('/api/auth/me'), fetch('/api/master-lists')]);
      if (userRes.ok) {
        const u = await userRes.json();
        setCurrentUser(u.user);
      }
      if (listsRes.ok) {
        const l = await listsRes.json();
        setInterviewers(l.interviewers || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchUserAndLists();
    fetchCandidate();
  }, [fetchCandidate]);

  const handleAssignChange = async (interviewerId: string) => {
    setSelectedInterviewer(interviewerId);
    try {
      const res = await fetch(`/api/candidates/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedToId: interviewerId }),
      });
      if (res.ok) fetchCandidate();
    } catch (e) {
      console.error(e);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus);
    try {
      const res = await fetch(`/api/candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchCandidate();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackError(null);

    if (feedbackComments.trim().length < 20) {
      setFeedbackError('Review comments must be at least 20 characters long.');
      return;
    }

    setFeedbackSubmitting(true);
    try {
      const res = await fetch(`/api/candidates/${id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          round: feedbackRound,
          rating: feedbackRating,
          recommendation: feedbackRecommendation,
          comments: feedbackComments,
          strengths: feedbackStrengths,
          concerns: feedbackConcerns,
          expectedCtc: feedbackExpectedCtc,
          noticePeriod: feedbackNoticePeriod,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit review.');

      setIsFeedbackModalOpen(false);
      setFeedbackComments('');
      setFeedbackStrengths('');
      setFeedbackConcerns('');
      setFeedbackExpectedCtc('');
      setFeedbackNoticePeriod('');
      fetchCandidate();
    } catch (err: any) {
      setFeedbackError(err.message);
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleSaveFeedbackEdit = async () => {
    if (!editingFeedback || !editComments.trim()) return;
    try {
      const res = await fetch(`/api/candidates/${id}/feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackId: editingFeedback.id,
          newComments: editComments,
        }),
      });
      if (res.ok) {
        setEditingFeedback(null);
        setEditComments('');
        fetchCandidate();
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-reapmind-blue">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <span>Loading candidate profile...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-reapmind-header border border-white/[0.1] rounded-3xl p-8 max-w-md w-full text-center">
            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-white mb-2">Access Notice</h2>
            <p className="text-neutral-400 text-sm mb-6">{error || 'Candidate not found.'}</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 bg-reapmind-blue hover:bg-reapmind-blue-hover text-white rounded-full text-xs font-bold transition"
            >
              <ArrowLeft className="w-4 h-4" /> Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const resumeFiles = candidate.files.filter((f) => f.fileType === 'RESUME');
  const scannedDocs = candidate.files.filter((f) => f.fileType === 'SCANNED_DOC');
  const cameraPages = candidate.files.filter((f) => f.fileType === 'CAMERA_PAGE');
  const allFiles = candidate.files;

  const primaryFile = candidate.files.find((f) => f.id === activeFileId) || candidate.files[0];
  const isImage = primaryFile?.mimeType.startsWith('image/');
  const isPdf = primaryFile?.mimeType === 'application/pdf';

  const hasResume = resumeFiles.length > 0;
  const hasCamera = cameraPages.length > 0 || scannedDocs.length > 0;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col selection:bg-reapmind-blue selection:text-white">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Top Back Nav */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Candidate List
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">ID:</span>
            <span className="font-mono text-xs font-bold text-reapmind-yellow bg-reapmind-yellow/10 border border-reapmind-yellow/20 px-3 py-1 rounded-full">
              {candidate.candidateId}
            </span>
          </div>
        </div>

        {/* TOP CANDIDATE SUMMARY CARD */}
        <div className="bg-reapmind-header border border-white/[0.08] rounded-3xl p-6 sm:p-7 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{candidate.fullName}</h1>
              <span className="text-xs bg-reapmind-blue/20 text-reapmind-blue px-3 py-1 rounded-full font-bold border border-reapmind-blue/40">
                {candidate.position}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-neutral-400">
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-neutral-500" />
                <span>+91 {candidate.mobile}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-neutral-500" />
                <span>{candidate.email}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                <span>Source: {candidate.source}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-neutral-500" />
                <span>Registered: {new Date(candidate.createdAt).toLocaleDateString('en-IN')}</span>
              </div>
            </div>

            {candidate.remarks && (
              <div className="mt-3 text-xs text-neutral-300 bg-black/50 p-2.5 rounded-xl border border-white/[0.06] max-w-2xl">
                {candidate.remarks}
              </div>
            )}
          </div>

          {/* Quick Status & Assignment in Header */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1 font-mono">Status</label>
              {currentUser?.role !== 'FRONT_DESK' ? (
                <select
                  value={status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="bg-black/80 border border-white/[0.12] rounded-full px-3.5 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-reapmind-blue"
                >
                  <option value="New" className="bg-neutral-900">New</option>
                  <option value="Assigned" className="bg-neutral-900">Assigned</option>
                  <option value="Interview Pending" className="bg-neutral-900">Interview Pending</option>
                  <option value="Interviewed" className="bg-neutral-900">Interviewed</option>
                  <option value="Shortlisted" className="bg-neutral-900">Shortlisted</option>
                  <option value="On Hold" className="bg-neutral-900">On Hold</option>
                  <option value="Rejected" className="bg-neutral-900">Rejected</option>
                </select>
              ) : (
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/10 text-neutral-200">
                  {candidate.status}
                </span>
              )}
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1 font-mono">Assigned To</label>
              {currentUser?.role !== 'FRONT_DESK' ? (
                <select
                  value={selectedInterviewer}
                  onChange={(e) => handleAssignChange(e.target.value)}
                  className="bg-black/80 border border-white/[0.12] rounded-full px-3.5 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-reapmind-blue"
                >
                  <option value="" className="bg-neutral-900">-- Unassigned --</option>
                  {interviewers.map((inv) => (
                    <option key={inv.id} value={inv.id} className="bg-neutral-900 text-white">
                      {inv.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-neutral-300 font-medium">
                  {candidate.assignedTo?.name || 'Unassigned'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* RESUME VIEWER (LEFT 7 COLS) + FEEDBACK TIMELINE (RIGHT 5 COLS) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT 7 COLS: EMBEDDED RESUME VIEWER */}
          <div className="lg:col-span-7 bg-reapmind-header border border-white/[0.08] rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            {/* Viewer Toolbar */}
            <div className="px-5 py-3.5 border-b border-white/[0.08] bg-black/60 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-reapmind-blue" />
                <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Document Viewer
                </span>
                {allFiles.length > 1 && (
                  <span className="text-[11px] text-neutral-400 font-mono bg-white/[0.06] px-2 py-0.5 rounded-full">
                    {allFiles.length} Attachments
                  </span>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsFullscreenOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-reapmind-blue/20 hover:bg-reapmind-blue/30 text-reapmind-blue border border-reapmind-blue/40 text-xs font-bold rounded-full transition mr-1"
                  title="Expand to Fullscreen (Google Drive view)"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Fullscreen</span>
                </button>

                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(50, z - 15))}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.08] transition"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => { setZoomLevel(100); setRotation(0); }}
                  className="text-[11px] font-mono text-neutral-400 hover:text-white px-1.5 py-0.5 rounded transition"
                  title="Reset Zoom"
                >
                  {zoomLevel}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(250, z + 15))}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.08] transition"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.08] transition ml-1"
                  title="Rotate 90°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>

                {primaryFile && currentUser?.role !== 'FRONT_DESK' && (
                  <a
                    href={`/api/files/${primaryFile.id}?download=true`}
                    download
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold rounded-full ml-1 transition"
                    title={`Download ${primaryFile.fileName}`}
                  >
                    <Download className="w-3.5 h-3.5 text-reapmind-yellow" />
                    <span>Download</span>
                  </a>
                )}
              </div>
            </div>

            {/* High-level Document Tabs (Uploaded Document vs Camera Snapshot) */}
            {(hasResume || hasCamera) && (
              <div className="flex items-center gap-2 px-5 py-2.5 bg-black/50 border-b border-white/[0.06] overflow-x-auto">
                <span className="text-[10px] text-neutral-500 uppercase font-mono font-bold flex-shrink-0">Tabs:</span>
                {hasResume && (
                  <button
                    onClick={() => {
                      setActiveFileId(resumeFiles[0].id);
                      setZoomLevel(100);
                      setRotation(0);
                    }}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition flex-shrink-0 ${
                      primaryFile?.fileType === 'RESUME'
                        ? 'bg-reapmind-blue text-white shadow-md shadow-reapmind-blue/20'
                        : 'bg-white/[0.06] text-neutral-300 hover:text-white hover:bg-white/[0.1]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-300" />
                    <span>Uploaded Resume (PDF / Doc)</span>
                  </button>
                )}
                {hasCamera && (
                  <button
                    onClick={() => {
                      setActiveFileId(cameraPages[0]?.id || scannedDocs[0]?.id);
                      setZoomLevel(100);
                      setRotation(0);
                    }}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition flex-shrink-0 ${
                      primaryFile?.fileType !== 'RESUME'
                        ? 'bg-reapmind-blue text-white shadow-md shadow-reapmind-blue/20'
                        : 'bg-white/[0.06] text-neutral-300 hover:text-white hover:bg-white/[0.1]'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5 text-reapmind-yellow" />
                    <span>Camera Snapshot & Scans {cameraPages.length > 0 ? `(${cameraPages.length} Pages)` : ''}</span>
                  </button>
                )}
              </div>
            )}

            {/* Sub-pages selector if camera scan has multiple pages */}
            {primaryFile?.fileType !== 'RESUME' && (cameraPages.length > 1 || scannedDocs.length > 0) && (
              <div className="flex items-center gap-2 px-5 py-2 bg-neutral-950 border-b border-white/[0.04] overflow-x-auto">
                <span className="text-[10px] text-neutral-500 uppercase font-mono flex-shrink-0">Snap Pages:</span>
                {cameraPages.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => {
                      setActiveFileId(file.id);
                      setZoomLevel(100);
                      setRotation(0);
                    }}
                    className={`px-3 py-1 rounded-full text-xs transition flex-shrink-0 font-medium ${
                      activeFileId === file.id
                        ? 'bg-reapmind-yellow/20 border border-reapmind-yellow text-reapmind-yellow'
                        : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                    }`}
                  >
                    {`Photo Page ${file.pageNumber || 1}`}
                  </button>
                ))}
                {scannedDocs.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => {
                      setActiveFileId(file.id);
                      setZoomLevel(100);
                      setRotation(0);
                    }}
                    className={`px-3 py-1 rounded-full text-xs transition flex-shrink-0 font-medium ${
                      activeFileId === file.id
                        ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-300'
                        : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                    }`}
                  >
                    Merged PDF
                  </button>
                ))}
              </div>
            )}

            {/* Viewer Canvas */}
            <div className="flex-1 bg-black p-4 flex items-center justify-center min-h-[550px] overflow-auto relative group">
              {!primaryFile ? (
                <div className="text-center text-neutral-500 text-xs">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  No resume file attached.
                </div>
              ) : isPdf ? (
                <div className="w-full h-full relative">
                  <iframe
                    src={`/api/files/${primaryFile.id}#zoom=${zoomLevel}`}
                    className="w-full h-[600px] rounded-2xl border border-white/[0.08] bg-white"
                    title="Resume PDF Viewer"
                  />
                  <button
                    onClick={() => setIsFullscreenOpen(true)}
                    className="absolute top-4 right-4 p-2.5 rounded-full bg-black/75 hover:bg-black text-white border border-white/20 shadow-xl transition opacity-80 hover:opacity-100"
                    title="Open Fullscreen View"
                  >
                    <Maximize2 className="w-4 h-4 text-reapmind-blue" />
                  </button>
                </div>
              ) : isImage ? (
                <div className="relative flex items-center justify-center w-full">
                  <div
                    className="transition-transform duration-200 cursor-zoom-in"
                    onClick={() => setIsFullscreenOpen(true)}
                    style={{
                      transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                    }}
                    title="Click to view Fullscreen"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/files/${primaryFile.id}`}
                      alt={primaryFile.fileName}
                      className="max-h-[580px] object-contain rounded-2xl shadow-2xl border border-white/[0.08]"
                    />
                  </div>
                  <button
                    onClick={() => setIsFullscreenOpen(true)}
                    className="absolute top-2 right-2 p-2.5 rounded-full bg-black/75 hover:bg-black text-white border border-white/20 shadow-xl transition"
                    title="Open Fullscreen View"
                  >
                    <Maximize2 className="w-4 h-4 text-reapmind-yellow" />
                  </button>
                </div>
              ) : (
                <div className="text-center p-8 bg-neutral-900/60 rounded-2xl border border-white/[0.08]">
                  <FileText className="w-12 h-12 text-reapmind-blue mx-auto mb-3" />
                  <p className="text-sm font-bold text-white">{primaryFile.fileName}</p>
                  <a
                    href={`/api/files/${primaryFile.id}?download=true`}
                    download
                    className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-bold rounded-full transition"
                  >
                    <Download className="w-4 h-4" /> Download Resume
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT 5 COLS: INTERVIEW FEEDBACK TIMELINE */}
          <div className="lg:col-span-5 space-y-6">
            {currentUser?.role !== 'FRONT_DESK' ? (
              <div className="bg-reapmind-header border border-white/[0.08] rounded-3xl p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                      Interview Evaluations
                    </h3>
                    <span className="text-[11px] text-neutral-400">
                      Permanent tamper-proof records ({candidate.feedbacks.length})
                    </span>
                  </div>

                  {currentUser?.role !== 'ADMIN' && (
                    <button
                      type="button"
                      onClick={() => setIsFeedbackModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-bold rounded-full shadow transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Review</span>
                    </button>
                  )}
                </div>

                {/* Feedback List */}
                <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
                  {candidate.feedbacks.length === 0 ? (
                    <div className="py-10 text-center text-neutral-500 text-xs">
                      No interview feedback recorded yet.
                    </div>
                  ) : (
                    candidate.feedbacks.map((fb) => (
                      <div
                        key={fb.id}
                        className="bg-black/60 border border-white/[0.08] rounded-2xl p-4 space-y-2.5"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-bold text-white text-xs flex items-center gap-2">
                              <span>{fb.interviewerName}</span>
                              <span className="text-[10px] bg-white/[0.06] text-reapmind-blue px-2.5 py-0.5 rounded-full border border-reapmind-blue/30 font-mono">
                                {fb.round}
                              </span>
                            </div>
                            <div className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                              {new Date(fb.createdAt).toLocaleString('en-IN')}
                              {fb.version > 1 && (
                                <span className="ml-2 text-reapmind-yellow font-bold">v{fb.version}</span>
                              )}
                            </div>
                          </div>

                          {/* Star Rating */}
                          <div className="flex items-center gap-0.5 text-reapmind-yellow">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3.5 h-3.5 ${s <= fb.rating ? 'fill-current' : 'text-neutral-700'}`}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Recommendation */}
                        <div>
                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border font-mono uppercase tracking-wide ${
                              fb.recommendation === 'Select'
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : fb.recommendation === 'Hold'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : fb.recommendation === 'Next round'
                                ? 'bg-reapmind-blue/15 text-reapmind-blue border-reapmind-blue/30'
                                : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            Outcome: {fb.recommendation}
                          </span>
                        </div>

                        {/* Review text */}
                        <div className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap bg-white/[0.02] p-3 rounded-xl border border-white/[0.05]">
                          {fb.comments}
                        </div>

                        {/* Strengths & Concerns */}
                        {(fb.strengths || fb.concerns) && (
                          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                            {fb.strengths && (
                              <div className="bg-emerald-950/20 border border-emerald-500/20 p-2.5 rounded-xl text-emerald-300">
                                <strong className="block text-[10px] uppercase text-emerald-400 font-mono">Strengths</strong>
                                {fb.strengths}
                              </div>
                            )}
                            {fb.concerns && (
                              <div className="bg-rose-950/20 border border-rose-500/20 p-2.5 rounded-xl text-rose-300">
                                <strong className="block text-[10px] uppercase text-rose-400 font-mono">Concerns</strong>
                                {fb.concerns}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Edit or Addendum */}
                        {currentUser?.id === fb.interviewerId && (
                          <div className="flex items-center justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFeedback(fb);
                                setEditComments('');
                              }}
                              className="text-[11px] text-reapmind-blue hover:underline flex items-center gap-1 font-semibold"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit / Addendum</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-reapmind-header border border-white/[0.08] rounded-3xl p-6 text-center text-xs text-neutral-400">
                <ShieldCheck className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                Interview evaluations are restricted to HR, Interviewers, and Leadership per company security policy.
              </div>
            )}

            {/* Assignment Trail */}
            {currentUser?.role !== 'FRONT_DESK' && candidate.assignments.length > 0 && (
              <div className="bg-reapmind-header border border-white/[0.08] rounded-3xl p-5 shadow-2xl space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-white/[0.08]">
                  <History className="w-4 h-4 text-reapmind-yellow" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Assignment Trail
                  </h4>
                </div>
                <div className="space-y-2 text-xs">
                  {candidate.assignments.map((a) => (
                    <div key={a.id} className="text-neutral-400 flex items-center justify-between">
                      <div>
                        Assigned to <strong className="text-white">{a.assignedTo.name}</strong> for {a.round}
                      </div>
                      <div className="text-[10px] text-neutral-500 font-mono">
                        {new Date(a.assignedAt).toLocaleDateString('en-IN')} by {a.assignedBy.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FEEDBACK MODAL */}
        {isFeedbackModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="bg-reapmind-header border border-white/[0.12] rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-5">
                <h3 className="text-lg font-bold text-white">Record Interview Evaluation</h3>
                <button
                  type="button"
                  onClick={() => setIsFeedbackModalOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-full hover:bg-white/[0.08] transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {feedbackError && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs">
                  {feedbackError}
                </div>
              )}

              <form onSubmit={handleAddFeedback} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-neutral-400 mb-1 font-mono">
                      Interviewer
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={currentUser?.name || ''}
                      className="w-full px-4 py-2.5 bg-black/60 border border-white/[0.1] rounded-full text-xs text-neutral-400 font-semibold cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase font-bold text-neutral-400 mb-1 font-mono">
                      Round
                    </label>
                    <select
                      value={feedbackRound}
                      onChange={(e) => setFeedbackRound(e.target.value)}
                      className="w-full px-4 py-2.5 bg-black/60 border border-white/[0.1] rounded-full text-xs text-white focus:outline-none focus:border-reapmind-blue"
                    >
                      <option value="Screening" className="bg-neutral-900">Screening</option>
                      <option value="Technical" className="bg-neutral-900">Technical</option>
                      <option value="HR" className="bg-neutral-900">HR</option>
                      <option value="Final" className="bg-neutral-900">Final</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-neutral-400 mb-1 font-mono">
                      Rating (1 to 5)
                    </label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setFeedbackRating(star)}
                          className="p-1 text-reapmind-yellow hover:scale-110 transition"
                        >
                          <Star
                            className={`w-5 h-5 ${star <= feedbackRating ? 'fill-current' : 'text-neutral-700'}`}
                          />
                        </button>
                      ))}
                      <span className="text-xs font-bold text-white font-mono ml-1">{feedbackRating}/5</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase font-bold text-neutral-400 mb-1 font-mono">
                      Recommendation
                    </label>
                    <select
                      value={feedbackRecommendation}
                      onChange={(e) => setFeedbackRecommendation(e.target.value)}
                      className="w-full px-4 py-2.5 bg-black/60 border border-white/[0.1] rounded-full text-xs text-white focus:outline-none focus:border-reapmind-blue"
                    >
                      <option value="Select" className="bg-neutral-900">Select (Shortlist)</option>
                      <option value="Next round" className="bg-neutral-900">Next round</option>
                      <option value="Hold" className="bg-neutral-900">Hold</option>
                      <option value="Reject" className="bg-neutral-900">Reject</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] uppercase font-bold text-neutral-400 mb-1 font-mono">
                    Comments <span className="text-rose-400">* (Min 20 characters)</span>
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Candidate technical competencies, architecture understanding, culture fit..."
                    value={feedbackComments}
                    onChange={(e) => setFeedbackComments(e.target.value)}
                    className="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-2xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Key Strengths (Optional)"
                    value={feedbackStrengths}
                    onChange={(e) => setFeedbackStrengths(e.target.value)}
                    className="w-full px-4 py-2.5 bg-black/60 border border-white/[0.1] rounded-full text-xs text-white"
                  />
                  <input
                    type="text"
                    placeholder="Concerns (Optional)"
                    value={feedbackConcerns}
                    onChange={(e) => setFeedbackConcerns(e.target.value)}
                    className="w-full px-4 py-2.5 bg-black/60 border border-white/[0.1] rounded-full text-xs text-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setIsFeedbackModalOpen(false)}
                    className="px-5 py-2.5 text-xs text-neutral-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={feedbackSubmitting || feedbackComments.trim().length < 20}
                    className="px-7 py-2.5 bg-reapmind-blue hover:bg-reapmind-blue-hover disabled:opacity-50 text-white font-bold text-xs rounded-full shadow-lg shadow-reapmind-blue/25 transition"
                  >
                    {feedbackSubmitting ? 'Saving...' : 'Save Feedback Permanently'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* EDIT / ADDENDUM MODAL */}
        {editingFeedback && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="bg-reapmind-header border border-white/[0.12] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl">
              <h3 className="text-base font-bold text-white mb-2">Edit Review / Append Addendum</h3>
              <p className="text-xs text-neutral-400 mb-4">
                Within 15 minutes of posting, reviews can be directly updated with versions logged. After 15 minutes,
                your text is permanently appended as a dated addendum under your name.
              </p>
              <textarea
                rows={4}
                value={editComments}
                onChange={(e) => setEditComments(e.target.value)}
                placeholder="Enter corrections or addendum notes..."
                className="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-2xl text-xs text-white focus:outline-none focus:border-reapmind-blue mb-4"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingFeedback(null)}
                  className="px-4 py-2 text-xs text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!editComments.trim()}
                  onClick={handleSaveFeedbackEdit}
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs rounded-full transition"
                >
                  Save Addendum
                </button>
              </div>
            </div>
          </div>
        )}
        {/* GOOGLE DRIVE STYLE FULLSCREEN PREVIEW MODAL */}
        {isFullscreenOpen && primaryFile && (
          <div className="fixed inset-0 z-50 bg-[#090a0f]/95 backdrop-blur-2xl flex flex-col select-none">
            {/* Fullscreen Google Drive Header */}
            <div className="h-16 border-b border-white/[0.08] bg-black/80 px-4 sm:px-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setIsFullscreenOpen(false)}
                  className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition"
                  title="Close Fullscreen (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-reapmind-yellow bg-reapmind-yellow/10 border border-reapmind-yellow/20 px-2.5 py-0.5 rounded-full flex-shrink-0">
                      {candidate.candidateId}
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-white truncate max-w-[200px] sm:max-w-[360px]">
                      {primaryFile.fileName}
                    </span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-white/10 text-neutral-300 hidden sm:inline-block">
                      {primaryFile.fileType === 'RESUME'
                        ? 'Uploaded Doc'
                        : primaryFile.fileType === 'CAMERA_PAGE'
                        ? `Photo Page ${primaryFile.pageNumber || 1}`
                        : 'Merged Scan'}
                    </span>
                  </div>
                  <span className="text-[11px] text-neutral-400 truncate block">
                    {candidate.fullName} • {candidate.position}
                  </span>
                </div>
              </div>

              {/* Tabs directly inside the Google Drive Header */}
              <div className="hidden lg:flex items-center gap-1.5 bg-neutral-900/90 border border-white/[0.08] p-1 rounded-full">
                {hasResume && (
                  <button
                    onClick={() => {
                      setActiveFileId(resumeFiles[0].id);
                      setZoomLevel(100);
                      setRotation(0);
                    }}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                      primaryFile.fileType === 'RESUME'
                        ? 'bg-reapmind-blue text-white shadow-lg'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Uploaded Resume</span>
                  </button>
                )}
                {hasCamera && (
                  <button
                    onClick={() => {
                      setActiveFileId(cameraPages[0]?.id || scannedDocs[0]?.id);
                      setZoomLevel(100);
                      setRotation(0);
                    }}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                      primaryFile.fileType !== 'RESUME'
                        ? 'bg-reapmind-blue text-white shadow-lg'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5 text-reapmind-yellow" />
                    <span>Camera Snapshots ({cameraPages.length})</span>
                  </button>
                )}
              </div>

              {/* Right Action Controls */}
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(50, z - 20))}
                  className="p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { setZoomLevel(100); setRotation(0); }}
                  className="px-2 py-1 text-xs font-mono text-neutral-300 hover:text-white hover:bg-white/10 rounded transition"
                  title="Reset Zoom to 100%"
                >
                  {zoomLevel}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(250, z + 20))}
                  className="p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition"
                  title="Rotate 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <a
                  href={`/api/files/${primaryFile.id}?download=true`}
                  download
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white/[0.08] hover:bg-white/[0.16] text-white text-xs font-bold rounded-full transition ml-1 border border-white/[0.08]"
                  title={`Download ${primaryFile.fileName}`}
                >
                  <Download className="w-3.5 h-3.5 text-reapmind-yellow" />
                  <span className="hidden sm:inline">Download</span>
                </a>
              </div>
            </div>

            {/* Center Canvas */}
            <div className="flex-1 overflow-auto flex items-center justify-center p-4 sm:p-6 relative">
              {isPdf ? (
                <iframe
                  src={`/api/files/${primaryFile.id}#zoom=${zoomLevel}`}
                  className="w-full h-full max-w-6xl rounded-2xl border border-white/[0.1] bg-white shadow-2xl"
                  title="Fullscreen Resume Viewer"
                />
              ) : isImage ? (
                <div
                  className="transition-transform duration-200 max-h-full flex items-center justify-center"
                  style={{
                    transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                  }}
                >
                  <img
                    src={`/api/files/${primaryFile.id}`}
                    alt={primaryFile.fileName}
                    className="max-h-[82vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl border border-white/[0.1]"
                  />
                </div>
              ) : (
                <div className="text-center p-8 bg-neutral-900 rounded-2xl border border-white/[0.1]">
                  <FileText className="w-16 h-16 text-reapmind-blue mx-auto mb-4" />
                  <p className="text-base font-bold text-white">{primaryFile.fileName}</p>
                  <a
                    href={`/api/files/${primaryFile.id}?download=true`}
                    download
                    className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-reapmind-blue text-white rounded-full text-xs font-bold"
                  >
                    <Download className="w-4 h-4" /> Download Document
                  </a>
                </div>
              )}

              {/* Left / Right Arrow buttons for paging if multiple files */}
              {allFiles.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const idx = allFiles.findIndex((f) => f.id === primaryFile.id);
                      const prev = allFiles[(idx - 1 + allFiles.length) % allFiles.length];
                      setActiveFileId(prev.id);
                      setZoomLevel(100);
                      setRotation(0);
                    }}
                    className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/70 border border-white/20 text-white hover:bg-black/90 transition shadow-2xl"
                    title="Previous Attachment (Left Arrow)"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const idx = allFiles.findIndex((f) => f.id === primaryFile.id);
                      const next = allFiles[(idx + 1) % allFiles.length];
                      setActiveFileId(next.id);
                      setZoomLevel(100);
                      setRotation(0);
                    }}
                    className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/70 border border-white/20 text-white hover:bg-black/90 transition shadow-2xl"
                    title="Next Attachment (Right Arrow)"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {/* Bottom Thumbnails / Document Switcher Strip */}
            {allFiles.length > 1 && (
              <div className="h-16 border-t border-white/[0.08] bg-black/80 px-6 flex items-center justify-center gap-3 overflow-x-auto">
                {allFiles.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setActiveFileId(f.id);
                      setZoomLevel(100);
                      setRotation(0);
                    }}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium border transition flex-shrink-0 ${
                      activeFileId === f.id
                        ? 'bg-reapmind-blue/20 border-reapmind-blue text-white shadow-md'
                        : 'bg-white/[0.04] border-white/[0.08] text-neutral-400 hover:text-white'
                    }`}
                  >
                    {f.mimeType.startsWith('image/') ? (
                      <Camera className="w-3.5 h-3.5 text-reapmind-yellow" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-reapmind-blue" />
                    )}
                    <span className="truncate max-w-[150px]">
                      {f.fileType === 'RESUME' ? 'Resume Doc' : f.pageNumber ? `Photo Page ${f.pageNumber}` : f.fileName}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
