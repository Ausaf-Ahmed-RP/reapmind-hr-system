'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, RefreshCw, QrCode } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expired = searchParams.get('expired');

  const [email, setEmail] = useState('frontdesk@reapmind.com');
  const [password, setPassword] = useState('Password@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (expired) {
      setError('Your session expired due to 30 minutes of inactivity. Please log in again.');
    }
  }, [expired]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed.');
      }

      if (data.user.role === 'FRONT_DESK') {
        router.push('/intake');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const setDemoRole = (roleEmail: string) => {
    setEmail(roleEmail);
    setPassword('Password@123');
  };

  return (
    <div className="bg-reapmind-header border border-white/[0.08] p-8 sm:p-10 shadow-2xl rounded-3xl backdrop-blur-xl">
      {error && (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      <form className="space-y-5" onSubmit={handleLogin}>
        <div>
          <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
            Work Email Address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-neutral-500 absolute left-4 top-3.5" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue focus:ring-2 focus:ring-reapmind-blue/20 transition"
              placeholder="name@reapmind.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
            Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-neutral-500 absolute left-4 top-3.5" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue focus:ring-2 focus:ring-reapmind-blue/20 transition"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full min-h-[48px] bg-reapmind-blue hover:bg-reapmind-blue-hover disabled:opacity-50 text-white font-semibold text-sm rounded-full shadow-lg shadow-reapmind-blue/25 transition transform active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Verifying Session...</span>
            </>
          ) : (
            <>
              <span>Sign In to HR Console</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Student / Candidate Self-Apply Callout */}
      <div className="mt-6 pt-5 border-t border-white/[0.08]">
        <Link
          href="/apply"
          className="w-full flex items-center justify-between p-3.5 bg-white/[0.03] hover:bg-white/[0.07] border border-reapmind-yellow/30 hover:border-reapmind-yellow/60 rounded-2xl transition group"
        >
          <div className="flex items-center gap-3 text-left">
            <div className="w-9 h-9 rounded-xl bg-reapmind-yellow/10 border border-reapmind-yellow/30 flex items-center justify-center text-reapmind-yellow">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block group-hover:text-reapmind-yellow transition">
                Walk-in Student or Candidate?
              </span>
              <span className="text-[11px] text-neutral-400 block -mt-0.5">
                Self-register and submit resume directly here
              </span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-reapmind-yellow opacity-70 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>

      {/* Quick Role Switcher */}
      <div className="mt-6 pt-5 border-t border-white/[0.08]">
        <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block text-center mb-3">
          Quick Evaluation Switcher
        </span>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setDemoRole('frontdesk@reapmind.com')}
            className="px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-full text-neutral-300 text-center transition truncate hover:text-white"
          >
            Front Desk
          </button>
          <button
            type="button"
            onClick={() => setDemoRole('aayushi@reapmind.com')}
            className="px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-full text-neutral-300 text-center transition truncate hover:text-white"
          >
            HR (Aayushi)
          </button>
          <button
            type="button"
            onClick={() => setDemoRole('aroof@reapmind.com')}
            className="px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-full text-neutral-300 text-center transition truncate hover:text-white"
          >
            Director (Aroof)
          </button>
          <button
            type="button"
            onClick={() => setDemoRole('admin@reapmind.com')}
            className="px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-full text-neutral-300 text-center transition truncate hover:text-white"
          >
            Admin
          </button>
        </div>
        <p className="text-[10px] text-neutral-500 text-center mt-3 font-mono">
          Password: <span className="text-neutral-400">Password@123</span>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-black flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 text-white relative">
      {/* Subtle brand glow behind header */}
      <div className="absolute top-1/6 left-1/2 -translate-x-1/2 w-[550px] h-[350px] bg-reapmind-blue/[0.12] rounded-full blur-[140px] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/reapmind-logo.png"
          alt="ReapMind Innovations"
          className="h-14 sm:h-16 w-auto object-contain mx-auto mb-4 brightness-0 invert"
        />
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          HR Operations &amp; Candidate Portal
        </h2>
        <p className="mt-1 text-xs sm:text-sm text-neutral-400">
          ReapMind Innovations Pvt. Ltd. • Kolhapur Delivery Center
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <Suspense fallback={<div className="text-center py-8 text-neutral-500">Loading portal...</div>}>
          <LoginForm />
        </Suspense>

        <div className="mt-8 text-center text-xs text-neutral-500 flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Compliant with Digital Personal Data Protection (DPDP) Act, 2023</span>
        </div>
      </div>
    </div>
  );
}
