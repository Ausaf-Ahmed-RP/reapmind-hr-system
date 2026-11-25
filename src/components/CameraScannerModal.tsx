'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, RotateCw, Check, X, Trash2, Plus, Sparkles } from 'lucide-react';

interface ScannedPage {
  pageNumber: number;
  dataUrl: string;
}

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePages: (pages: ScannedPage[]) => void;
}

export default function CameraScannerModal({ isOpen, onClose, onSavePages }: CameraScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPages, setCapturedPages] = useState<ScannedPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setCapturedPages([]);
      setActivePageIndex(null);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('Unable to access camera. Please check browser camera permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const capturePage = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    const newPage: ScannedPage = {
      pageNumber: capturedPages.length + 1,
      dataUrl,
    };

    const updated = [...capturedPages, newPage];
    setCapturedPages(updated);
    setActivePageIndex(updated.length - 1);
  };

  const rotateActivePage = () => {
    if (activePageIndex === null || !capturedPages[activePageIndex]) return;
    const page = capturedPages[activePageIndex];

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      const rotatedUrl = canvas.toDataURL('image/jpeg', 0.9);
      const updated = [...capturedPages];
      updated[activePageIndex] = { ...page, dataUrl: rotatedUrl };
      setCapturedPages(updated);
    };
    img.src = page.dataUrl;
  };

  const deleteActivePage = () => {
    if (activePageIndex === null) return;
    const updated = capturedPages
      .filter((_, idx) => idx !== activePageIndex)
      .map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
    setCapturedPages(updated);
    setActivePageIndex(updated.length > 0 ? Math.max(0, activePageIndex - 1) : null);
  };

  const handleFinish = () => {
    if (capturedPages.length === 0) return;
    onSavePages(capturedPages);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-sky-400" />
            <h3 className="text-lg font-semibold text-white">Scan Resume with Camera</h3>
            <span className="text-xs bg-sky-500/20 text-sky-300 px-2.5 py-0.5 rounded-full border border-sky-500/30">
              {capturedPages.length} {capturedPages.length === 1 ? 'Page' : 'Pages'} Captured
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Camera Viewport / Live Feed */}
          <div className="md:col-span-7 flex flex-col items-center justify-center bg-slate-950 rounded-xl border border-slate-800 overflow-hidden relative min-h-[340px]">
            {cameraError ? (
              <div className="p-6 text-center text-rose-400 text-sm">
                <p>{cameraError}</p>
                <button
                  onClick={startCamera}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Try Again
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain max-h-[420px]"
                />
                <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))}
                    className="p-3 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-full shadow-lg border border-slate-700 transition"
                    title="Switch Camera"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={capturePage}
                    className="flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-full shadow-lg shadow-sky-600/30 transition transform active:scale-95"
                  >
                    <Camera className="w-5 h-5" />
                    <span>Capture Page {capturedPages.length + 1}</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Captured Pages Carousel & Controls */}
          <div className="md:col-span-5 flex flex-col bg-slate-950/40 border border-slate-800/80 rounded-xl p-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Captured Pages & Preview
            </h4>

            {capturedPages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                <Camera className="w-8 h-8 text-slate-600 mb-2" />
                <p>Point camera at the resume and tap &quot;Capture Page&quot;.</p>
                <p className="mt-1 text-slate-600">You can capture multiple pages.</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                {/* Active Page Preview */}
                {activePageIndex !== null && capturedPages[activePageIndex] && (
                  <div className="relative flex-1 flex flex-col items-center justify-center bg-black/60 rounded-lg p-2 border border-slate-800 mb-4 min-h-[200px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={capturedPages[activePageIndex].dataUrl}
                      alt={`Page ${activePageIndex + 1}`}
                      className="max-h-[220px] object-contain rounded"
                    />
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={rotateActivePage}
                        className="p-1.5 bg-slate-900/90 hover:bg-slate-800 text-sky-400 rounded-lg border border-slate-700 shadow"
                        title="Rotate 90°"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={deleteActivePage}
                        className="p-1.5 bg-slate-900/90 hover:bg-rose-900/80 text-rose-400 rounded-lg border border-slate-700 shadow"
                        title="Delete Page"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="absolute bottom-2 left-2 text-[11px] bg-black/70 text-slate-300 px-2 py-0.5 rounded">
                      Page {activePageIndex + 1} of {capturedPages.length}
                    </span>
                  </div>
                )}

                {/* Thumbnails row */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {capturedPages.map((page, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setActivePageIndex(index)}
                      className={`relative flex-shrink-0 w-16 h-20 rounded border overflow-hidden transition ${
                        activePageIndex === index
                          ? 'border-sky-500 ring-2 ring-sky-500/40'
                          : 'border-slate-800 opacity-60 hover:opacity-100'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={page.dataUrl} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 inset-x-0 bg-slate-900/80 text-[10px] text-center text-slate-300 py-0.5">
                        P.{index + 1}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/80">
          <p className="text-xs text-slate-400">
            {capturedPages.length > 0
              ? `${capturedPages.length} pages will be combined into a single PDF document automatically.`
              : 'Hold document flat and clear under good lighting.'}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={capturedPages.length === 0}
              onClick={handleFinish}
              className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg shadow-lg shadow-emerald-600/20 transition"
            >
              <Check className="w-4 h-4" />
              <span>Confirm & Attach ({capturedPages.length} Pages)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
