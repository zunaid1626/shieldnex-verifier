'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { GradientButton } from '@/components/ui/gradient-button';
import { PlasmaBackground } from '@/components/ui/plasma-background';
import {
  parseEmails,
  evaluateEmail,
  VerificationResult,
  ShieldNexStatus,
  BatchVerificationResponse,
} from '@/lib/email-verifier';

const SAMPLE_EMAILS = [
  'alexander.hamilton@gmail.com',
  'sarah.connor@cyberdyne.org',
  'edge-port25-blocked@cloud-firewalled.net',
  'edge-uncooperative@greylisted-relay.org',
  'edge-catchall@corporate-catchall.com',
  'edge-null-mx@rejecting-domain.org',
  'edge-implicit-mx-fallback@a-record.org',
  'tester@mailinator.com',
  'support@github.com',
  'billing@stripe.com',
  'john.doe@gmial.com',
  'invalid..dots@test.com',
  'missing-tld@domain',
].join('\n');

const CHUNK_SIZE = 5;
const MAX_CONCURRENT_WORKERS = 3;

export default function EmailVerifierPage() {
  const [inputText, setInputText] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    velocity: number;
  }>({ completed: 0, total: 0, velocity: 0 });

  const [results, setResults] = useState<VerificationResult[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | ShieldNexStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const detectedEmails = parseEmails(inputText);
  const emailCount = detectedEmails.length;

  /**
   * Asynchronous Concurrent Batch Processor
   */
  const handleVerify = async () => {
    if (emailCount === 0 || isVerifying) return;

    setIsVerifying(true);
    setResults([]);
    setStatusMessage(null);
    setActiveFilter('all');

    const totalEmails = emailCount;
    const startTime = performance.now();

    setProgress({ completed: 0, total: totalEmails, velocity: 0 });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const chunks: string[][] = [];
    for (let i = 0; i < detectedEmails.length; i += CHUNK_SIZE) {
      chunks.push(detectedEmails.slice(i, i + CHUNK_SIZE));
    }

    let completedCount = 0;
    let chunkIndex = 0;

    const runWorker = async () => {
      while (chunkIndex < chunks.length) {
        if (abortController.signal.aborted) break;

        const currentChunkIdx = chunkIndex++;
        const chunk = chunks[currentChunkIdx];

        try {
          const res = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails: chunk }),
            signal: abortController.signal,
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }

          const data: BatchVerificationResponse = await res.json();

          if (!abortController.signal.aborted) {
            setResults((prev) => [...prev, ...data.results]);
            completedCount += chunk.length;

            const elapsedSec = (performance.now() - startTime) / 1000;
            const velocity =
              elapsedSec > 0 ? Math.round((completedCount / elapsedSec) * 10) / 10 : 0;

            setProgress({
              completed: completedCount,
              total: totalEmails,
              velocity,
            });
          }
        } catch (err: unknown) {
          if (abortController.signal.aborted) break;

          console.warn('Chunk request error, using fallback:', err);
          const fallbackResults = chunk.map((email) => evaluateEmail(email, null));
          setResults((prev) => [...prev, ...fallbackResults]);
          completedCount += chunk.length;

          const elapsedSec = (performance.now() - startTime) / 1000;
          const velocity =
            elapsedSec > 0 ? Math.round((completedCount / elapsedSec) * 10) / 10 : 0;

          setProgress({
            completed: completedCount,
            total: totalEmails,
            velocity,
          });
        }
      }
    };

    try {
      const workers = Array.from(
        { length: Math.min(MAX_CONCURRENT_WORKERS, chunks.length) },
        () => runWorker()
      );
      await Promise.all(workers);
    } finally {
      setIsVerifying(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsVerifying(false);
      setStatusMessage('Verification paused. Processed results are preserved below.');
    }
  };

  const handleLoadSample = () => {
    setInputText(SAMPLE_EMAILS);
    setStatusMessage(null);
  };

  const handleClear = () => {
    handleCancel();
    setInputText('');
    setResults([]);
    setStatusMessage(null);
    setSearchQuery('');
    setActiveFilter('all');
  };

  const handleCopyEmail = (email: string) => {
    navigator.clipboard?.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const handleExportCSV = () => {
    if (results.length === 0) return;

    const headers = ['Email', 'Status', 'Details', 'Score'];
    const rows = results.map((r) => [
      `"${r.email.replace(/"/g, '""')}"`,
      `"${r.status}"`,
      `"${r.details.replace(/"/g, '""')}"`,
      r.score,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `shieldnex-verification-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Counts for inline filter tabs
  const totalCount = results.length;
  const deliveredCount = results.filter((r) => r.status === 'delivered').length;
  const bounceCount = results.filter((r) => r.status === 'likely to bounce').length;
  const unknownCount = results.filter((r) => r.status === 'unknown').length;

  // Filtered results
  const filteredResults = results.filter((item) => {
    const matchesFilter = activeFilter === 'all' || item.status === activeFilter;
    const matchesSearch =
      searchQuery.trim() === '' ||
      item.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.details.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const progressPct =
    progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="relative min-h-screen text-slate-100 py-10 px-4 sm:px-6 lg:px-8 font-sans selection:bg-purple-500 selection:text-white overflow-x-hidden">
      {/* 1. Dynamic Glowing Plasma Energy Wave Canvas Background */}
      <PlasmaBackground />

      {/* 2. Main ShieldNex Translucent Glassmorphism Wrapper */}
      <div className="relative z-10 max-w-4xl mx-auto bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-9 shadow-2xl shadow-purple-950/40 space-y-7">
        {/* Minimal Header */}
        <header className="space-y-2 pb-2 border-b border-white/10">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30 shadow-[0_0_12px_rgba(168,85,247,0.25)]">
              <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
              ShieldNex Verifier
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Deliverability &bull; Socket Diagnostics
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-sm">
            Email Verification
          </h1>
          <p className="text-slate-300 text-sm">
            Paste a list of email addresses below to verify deliverability status and diagnose bounce risks in real time.
          </p>
        </header>

        {/* Input Card (Dark Glassmorphism) */}
        <div className="bg-black/50 border border-white/10 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
            <label htmlFor="emails-input" className="font-semibold text-slate-200">
              Email Addresses
              <span className="ml-1.5 font-normal text-slate-400">
                (separated by line, comma, or semicolon)
              </span>
            </label>

            <div className="flex items-center gap-3">
              <span className="font-mono text-slate-300 bg-black/60 px-2.5 py-1 rounded-md border border-white/10">
                {emailCount} {emailCount === 1 ? 'address' : 'addresses'} ready
              </span>
              <button
                type="button"
                onClick={handleLoadSample}
                className="text-purple-400 hover:text-purple-300 font-medium cursor-pointer transition-colors"
              >
                Load sample
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={!inputText && results.length === 0}
                className="text-slate-400 hover:text-slate-200 disabled:opacity-40 cursor-pointer transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          <textarea
            id="emails-input"
            rows={7}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={'alexander.hamilton@gmail.com\nsarah.connor@cyberdyne.org\nedge-port25-blocked@cloud-firewalled.net\n...'}
            className="w-full bg-black/70 border border-white/10 rounded-xl p-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500/80 font-mono leading-relaxed transition resize-y min-h-[160px]"
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <span className="text-xs text-slate-400">
              Bulk paste supported. Clean deduplication is applied automatically.
            </span>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {isVerifying ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-rose-300 bg-rose-950/70 hover:bg-rose-900/70 border border-rose-800/80 rounded-lg transition-colors cursor-pointer"
                >
                  Stop
                </button>
              ) : null}

              {/* GradientButton for primary verification */}
              <GradientButton
                type="button"
                onClick={handleVerify}
                disabled={emailCount === 0 || isVerifying}
                className="w-full sm:w-auto text-sm py-2.5 px-6 min-w-[140px] cursor-pointer shadow-lg shadow-purple-900/30"
              >
                {isVerifying ? (
                  <span className="inline-flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                    <span>Verifying {progress.completed}/{progress.total}</span>
                  </span>
                ) : (
                  <span>Verify Deliverability</span>
                )}
              </GradientButton>
            </div>
          </div>

          {/* Minimal Live Progress Bar */}
          {isVerifying && (
            <div className="space-y-1.5 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                  Processing {progress.completed} of {progress.total} addresses ({progressPct}%)
                </span>
                <span className="font-mono text-purple-300">{progress.velocity} emails/sec</span>
              </div>
              <div className="w-full bg-black/60 rounded-full h-1.5 overflow-hidden border border-white/10">
                <div
                  className="bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {statusMessage && (
            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg text-xs text-purple-300">
              {statusMessage}
            </div>
          )}
        </div>

        {/* Clean Results Section */}
        {results.length > 0 && (
          <div className="space-y-3.5">
            {/* Filter Tabs & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Glassmorphism inline filter tabs */}
              <div className="inline-flex items-center bg-black/60 p-1 rounded-xl text-xs border border-white/10 shadow-sm backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                    activeFilter === 'all'
                      ? 'bg-white/15 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({totalCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('delivered')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                    activeFilter === 'delivered'
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                      : 'text-slate-400 hover:text-emerald-300'
                  }`}
                >
                  Delivered ({deliveredCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('likely to bounce')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                    activeFilter === 'likely to bounce'
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                      : 'text-slate-400 hover:text-rose-300'
                  }`}
                >
                  Likely to bounce ({bounceCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('unknown')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                    activeFilter === 'unknown'
                      ? 'bg-amber-950/80 text-amber-300 border border-amber-500/50 shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                      : 'text-slate-400 hover:text-amber-300'
                  }`}
                >
                  Unknown ({unknownCount})
                </button>
              </div>

              {/* Search & Export */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter results..."
                  className="bg-black/60 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 w-40 sm:w-48 shadow-xs"
                />

                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-black/60 hover:bg-black/80 text-slate-200 border border-white/10 shadow-xs transition cursor-pointer shrink-0"
                >
                  <svg
                    className="w-3.5 h-3.5 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Export CSV
                </button>
              </div>
            </div>

            {/* Glassmorphism Results Table with Framer Motion Staggered Animations */}
            <div className="bg-black/50 border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-black/60 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <th scope="col" className="py-3 px-5">
                        Email
                      </th>
                      <th scope="col" className="py-3 px-5 w-40">
                        Status
                      </th>
                      <th scope="col" className="py-3 px-5">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <motion.tbody
                    className="divide-y divide-white/5"
                    variants={{
                      hidden: { opacity: 0 },
                      show: {
                        opacity: 1,
                        transition: { staggerChildren: 0.035 },
                      },
                    }}
                  >
                    <AnimatePresence>
                      {filteredResults.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-10 text-center text-slate-500 text-xs">
                            No email addresses match the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredResults.map((item, idx) => (
                          <motion.tr
                            key={`${item.email}-${idx}`}
                            custom={idx % 20}
                            initial="hidden"
                            animate="show"
                            variants={{
                              hidden: { opacity: 0, y: 8 },
                              show: { opacity: 1, y: 0 },
                            }}
                            className="hover:bg-white/[0.04] transition-colors group"
                          >
                            {/* Column 1: Email */}
                            <td className="py-3 px-5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-slate-200 text-xs sm:text-sm select-all">
                                  {item.email}
                                </span>
                                <button
                                  type="button"
                                  title="Copy address"
                                  onClick={() => handleCopyEmail(item.email)}
                                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-opacity p-0.5 rounded cursor-pointer"
                                >
                                  {copiedEmail === item.email ? (
                                    <span className="text-[10px] text-emerald-400 font-sans font-medium">
                                      Copied
                                    </span>
                                  ) : (
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                      />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            </td>

                            {/* Column 2: Glowing Status Badges */}
                            <td className="py-3 px-5">
                              {item.status === 'delivered' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 shadow-[0_0_14px_rgba(52,211,153,0.3)]">
                                  <svg
                                    className="w-3 h-3 text-emerald-400"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  delivered
                                </span>
                              )}
                              {item.status === 'likely to bounce' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-300 border border-rose-500/50 shadow-[0_0_14px_rgba(244,63,94,0.3)]">
                                  <svg
                                    className="w-3 h-3 text-rose-400"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  likely to bounce
                                </span>
                              )}
                              {item.status === 'unknown' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-500/50 shadow-[0_0_14px_rgba(251,191,36,0.3)]">
                                  <svg
                                    className="w-3 h-3 text-amber-400"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  unknown
                                </span>
                              )}
                            </td>

                            {/* Column 3: Details */}
                            <td className="py-3 px-5 text-slate-300 text-xs sm:text-sm">
                              {item.details}
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </AnimatePresence>
                  </motion.tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
