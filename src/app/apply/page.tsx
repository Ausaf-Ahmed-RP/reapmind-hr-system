'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Upload,
  Camera,
  CheckCircle2,
  AlertTriangle,
  FileText,
  UserCheck,
  ShieldCheck,
  RefreshCw,
  QrCode,
  ArrowRight,
  Briefcase,
  GraduationCap,
  MapPin,
  X,
} from 'lucide-react';
import CameraScannerModal from '@/components/CameraScannerModal';

export default function StudentApplyPage() {
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('Full Stack Developer');
  const [college, setCollege] = useState('');
  const [passingYear, setPassingYear] = useState('2025');
  const [location, setLocation] = useState('Kolhapur');
  const [consent, setConsent] = useState(true);

  // Resume
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [cameraPages, setCameraPages] = useState<{ pageNumber: number; dataUrl: string }[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInPass, setCheckInPass] = useState<{
    candidateId: string;
    fullName: string;
    position: string;
  } | null>(null);

  const positions = [
    'Full Stack Developer',
    'Frontend Developer',
    'Backend Developer',
    'React Native Developer',
    'QA Automation Engineer',
    'UI/UX Designer',
    'DevOps Engineer',
    'HR Operations Executive',
    'Software Engineering Intern',
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        setError('Resume file size exceeds the 10 MB limit.');
        return;
      }
      setResumeFile(file);
      setError(null);
    }
  };

  const handleCameraPagesSaved = (pages: { pageNumber: number; dataUrl: string }[]) => {
    setCameraPages(pages);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPhone = mobile.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (!resumeFile && cameraPages.length === 0) {
      setError('Please attach your resume file or take a picture using your camera.');
      return;
    }

    if (!consent) {
      setError('Please accept the privacy consent to submit your application.');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('fullName', fullName);
      formData.append('mobile', cleanPhone);
      formData.append('email', email);
      formData.append('position', position);
      formData.append('college', college);
      formData.append('passingYear', passingYear);
      formData.append('location', location);
      formData.append('consent', 'true');

      if (resumeFile) {
        formData.append('resumeFile', resumeFile);
      }
      if (cameraPages.length > 0) {
        formData.append('cameraPages', JSON.stringify(cameraPages));
      }

      const res = await fetch('/api/candidates/self-apply', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit application.');
      }

      setCheckInPass(data.candidate);
    } catch (err: any) {
      setError(err.message || 'An error occurred while submitting.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between selection:bg-reapmind-blue selection:text-white">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-reapmind-blue/[0.14] rounded-full blur-[140px] pointer-events-none" />

      {/* Top Header */}
      <header className="relative z-10 border-b border-white/[0.08] bg-black/60 backdrop-blur-md py-4 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/reapmind-logo.png"
              alt="ReapMind Innovations"
              className="h-9 sm:h-10 w-auto object-contain brightness-0 invert"
            />
            <div className="pl-3 border-l border-white/10 hidden sm:block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-reapmind-yellow font-mono">
                WALK-IN CHECK-IN
              </span>
              <span className="text-xs text-neutral-400 block -mt-0.5">
                Kolhapur Office
              </span>
            </div>
          </div>

          <Link
            href="/login"
            className="text-xs text-neutral-400 hover:text-white px-3.5 py-1.5 rounded-full border border-white/[0.1] hover:bg-white/[0.05] transition"
          >
            Staff Login →
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 max-w-2xl w-full mx-auto px-4 py-8 flex-1">
        {/* CHECK-IN SUCCESS PASS */}
        {checkInPass ? (
          <div className="bg-reapmind-header border border-emerald-500/40 rounded-3xl p-8 sm:p-10 shadow-2xl text-center backdrop-blur-xl animate-fade-in">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-5 border border-emerald-500/40">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <span className="text-[11px] font-bold tracking-widest text-reapmind-yellow uppercase font-mono">
              INTERVIEW CHECK-IN CONFIRMED
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1 mb-2">
              Welcome, {checkInPass.fullName}!
            </h2>
            <p className="text-neutral-400 text-sm max-w-md mx-auto mb-6">
              Your details and resume have been submitted to the ReapMind front desk.
            </p>

            {/* Official Digital Token Badge */}
            <div className="bg-black/70 border border-white/[0.1] rounded-2xl p-6 text-left max-w-md mx-auto mb-6 shadow-inner">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <span className="text-xs text-neutral-400 uppercase font-semibold">Candidate Pass ID</span>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-mono">
                  ACTIVE
                </span>
              </div>

              <div className="py-4 text-center">
                <span className="font-mono text-3xl font-black text-white tracking-wider block text-reapmind-yellow">
                  {checkInPass.candidateId}
                </span>
                <span className="text-xs text-neutral-400 mt-1 block">
                  Applied for <strong className="text-neutral-200">{checkInPass.position}</strong>
                </span>
              </div>

              <div className="pt-3 border-t border-white/[0.08] text-xs text-neutral-400 flex items-center justify-between">
                <span>Timestamp:</span>
                <span className="font-mono text-neutral-300">
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            <div className="p-4 bg-reapmind-blue/[0.1] border border-reapmind-blue/30 rounded-2xl text-xs text-neutral-300 max-w-md mx-auto mb-6 text-left">
              <strong className="block text-white mb-1">What to do next:</strong>
              <ul className="list-disc pl-4 space-y-1 text-neutral-300">
                <li>Please take a seat in the reception waiting lounge.</li>
                <li>The Front Desk team will call your name to verify your details.</li>
                <li>Have your government ID card ready if requested.</li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => {
                setCheckInPass(null);
                setFullName('');
                setMobile('');
                setEmail('');
                setResumeFile(null);
                setCameraPages([]);
              }}
              className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-semibold transition"
            >
              Submit Another Application
            </button>
          </div>
        ) : (
          /* APPLICATION FORM */
          <div className="bg-reapmind-header border border-white/[0.08] rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-xl">
            <div className="mb-8">
              <span className="text-[11px] font-bold uppercase tracking-wider text-reapmind-yellow font-mono block mb-1">
                STUDENT &amp; CANDIDATE SELF-APPLY
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Walk-In Registration
              </h1>
              <p className="text-xs sm:text-sm text-neutral-400 mt-1.5 leading-relaxed">
                Applying at ReapMind Innovations? Fill out your basic details and upload your resume below to check in.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3 text-rose-300 text-xs">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Personal Details */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                  Full Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Patil"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue focus:ring-2 focus:ring-reapmind-blue/20 transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    placeholder="rahul.patil@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue focus:ring-2 focus:ring-reapmind-blue/20 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                  Position / Internship Applied For <span className="text-rose-400">*</span>
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

              {/* Education & Experience Details (Great for Students) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                    College / University
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. DKTE / KIT / Shivaji Univ"
                    value={college}
                    onChange={(e) => setCollege(e.target.value)}
                    className="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue focus:ring-2 focus:ring-reapmind-blue/20 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                    Graduation Year / Experience
                  </label>
                  <select
                    value={passingYear}
                    onChange={(e) => setPassingYear(e.target.value)}
                    className="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white focus:outline-none focus:border-reapmind-blue focus:ring-2 focus:ring-reapmind-blue/20 transition"
                  >
                    <option value="2026 Batch (Final Year)" className="bg-neutral-900">2026 Batch (Final Year)</option>
                    <option value="2025 Batch" className="bg-neutral-900">2025 Batch (Recent Grad)</option>
                    <option value="2024 Batch" className="bg-neutral-900">2024 Batch</option>
                    <option value="1-2 Years Experience" className="bg-neutral-900">1–2 Years Experience</option>
                    <option value="3+ Years Experience" className="bg-neutral-900">3+ Years Experience</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                  Current City / Location
                </label>
                <input
                  type="text"
                  placeholder="Kolhapur, Sangli, Ichalkaranji, Pune..."
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue focus:ring-2 focus:ring-reapmind-blue/20 transition"
                />
              </div>

              {/* Resume Upload / Camera Option */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                  Attach Resume / CV Document <span className="text-rose-400">*</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <label
                      className={`w-full flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-2xl cursor-pointer transition ${
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
                        className={`w-6 h-6 mb-1.5 ${resumeFile ? 'text-emerald-400' : 'text-neutral-400'}`}
                      />
                      <span className="text-xs font-semibold text-white truncate max-w-[200px]">
                        {resumeFile ? resumeFile.name : 'Upload File (PDF / Word)'}
                      </span>
                      <span className="text-[10px] text-neutral-500 mt-0.5">
                        {resumeFile ? `${(resumeFile.size / 1024 / 1024).toFixed(2)} MB attached` : 'Tap to browse on phone'}
                      </span>
                    </label>
                    {resumeFile && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setResumeFile(null); }}
                        className="absolute top-2 right-2 p-1 rounded-full bg-neutral-800 text-neutral-300 hover:bg-rose-500 hover:text-white transition"
                        title="Remove uploaded file"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsCameraOpen(true)}
                      className={`w-full flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-2xl transition ${
                        cameraPages.length > 0
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-white/[0.1] bg-black/40 hover:border-reapmind-yellow/60 hover:bg-black/60'
                      }`}
                    >
                      <Camera
                        className={`w-6 h-6 mb-1.5 ${cameraPages.length > 0 ? 'text-emerald-400' : 'text-reapmind-yellow'}`}
                      />
                      <span className="text-xs font-semibold text-white">Snap / Scan Resume</span>
                      <span className="text-[10px] text-neutral-500 mt-0.5">
                        {cameraPages.length > 0 ? `${cameraPages.length} Pages Captured ✓` : 'Use phone/device camera'}
                      </span>
                    </button>
                    {cameraPages.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setCameraPages([]); }}
                        className="absolute top-2 right-2 p-1 rounded-full bg-neutral-800 text-neutral-300 hover:bg-rose-500 hover:text-white transition"
                        title="Remove camera scans"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {resumeFile && cameraPages.length > 0 && (
                  <p className="mt-2 text-[11px] text-emerald-400 font-medium text-center">
                    ✓ Both uploaded resume document & camera snapshot will be submitted together.
                  </p>
                )}
              </div>

              {/* Consent Checkbox */}
              <div className="pt-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-neutral-700 text-reapmind-blue focus:ring-reapmind-blue bg-black/60"
                  />
                  <span className="text-[11px] text-neutral-400 leading-relaxed">
                    I confirm that my personal information and resume are submitted voluntarily for interview evaluation
                    at ReapMind Innovations Pvt. Ltd. under the Digital Personal Data Protection Act, 2023.
                  </span>
                </label>
              </div>

              {/* Submit CTA */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[50px] bg-reapmind-blue hover:bg-reapmind-blue-hover disabled:opacity-50 text-white font-semibold text-sm rounded-full shadow-lg shadow-reapmind-blue/25 transition transform active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Checking you in...</span>
                    </>
                  ) : (
                    <>
                      <span>Check In &amp; Submit Application</span>
                      <ArrowRight className="w-4 h-4" />
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
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.08] py-4 text-center text-xs text-neutral-500">
        <p>© ReapMind Innovations Pvt. Ltd. • Kolhapur Delivery Center</p>
      </footer>
    </div>
  );
}
