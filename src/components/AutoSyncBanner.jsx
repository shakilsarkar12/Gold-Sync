'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, XCircle, Loader2, Zap, Clock } from 'lucide-react';

/**
 * AutoSyncBanner — Smooth 3-Stage Progress & Notification Banner
 * 
 * 1. Stage 1 (Submitting): Smooth 0% -> 100% progress bar while JSONL payload is built & submitted.
 * 2. Stage 2 (Waiting): 100% progress with "Waiting for Shopify confirmation..." status text.
 * 3. Stage 3 (Completed): Shows "Sync Complete · X products updated" and saves activity log.
 */
export default function AutoSyncBanner() {
  const [phase, setPhase] = useState('idle'); // 'idle' | 'syncing' | 'done-success' | 'done-error'
  const [lastResult, setLastResult] = useState(null);
  const [syncData, setSyncData] = useState(null);
  const [progressPercent, setProgressPercent] = useState(5);
  const prevSyncing = useRef(false);
  const hideTimer = useRef(null);

  // Smoothly increment progress percent from 5% to 100% while submitting JSONL
  useEffect(() => {
    let animInterval = null;
    if (phase === 'syncing') {
      if (!syncData?.bulkOperationId) {
        // Phase 1: Fast & smooth progress 5% -> 95%
        animInterval = setInterval(() => {
          setProgressPercent((prev) => {
            if (prev < 90) return prev + Math.floor(Math.random() * 8 + 5);
            if (prev < 98) return prev + 1;
            return 98;
          });
        }, 120);
      } else {
        // Phase 2: JSONL submitted, set progress to 100%
        setProgressPercent(100);
      }
    } else {
      setProgressPercent(5);
    }

    return () => {
      if (animInterval) clearInterval(animInterval);
    };
  }, [phase, syncData?.bulkOperationId]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/sync-status', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();

      const isSyncing = !!data.syncing;

      if (isSyncing) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setPhase('syncing');
        setSyncData(data);
        prevSyncing.current = true;
      } else if (prevSyncing.current && !isSyncing && data.lastResult) {
        // Phase 3: Transition from syncing to completed
        prevSyncing.current = false;
        setLastResult(data.lastResult);
        setPhase(data.lastResult.success ? 'done-success' : 'done-error');

        // Auto-hide after 5 seconds
        hideTimer.current = setTimeout(() => setPhase('idle'), 5000);
      }
    } catch {
      // Silently ignore polling errors
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 2500);
    return () => {
      clearInterval(interval);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [poll]);

  if (phase === 'idle') return null;

  const isSyncing = phase === 'syncing';
  const isSuccess = phase === 'done-success';
  const isWaitingShopify = isSyncing && (progressPercent >= 98 || !!syncData?.bulkOperationId);

  return (
    <div
      style={{
        position: 'fixed',
        top: '1.25rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        animation: 'syncBannerSlideDown 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '0.4rem',
          padding: '0.7rem 1.35rem',
          borderRadius: '16px',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${isSyncing ? 'rgba(212,175,55,0.45)' : isSuccess ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)'}`,
          background: isSyncing
            ? 'rgba(18, 16, 8, 0.94)'
            : isSuccess
              ? 'rgba(6, 28, 18, 0.94)'
              : 'rgba(28, 8, 8, 0.94)',
          boxShadow: isSyncing
            ? '0 6px 30px rgba(212,175,55,0.35), 0 0 0 1px rgba(212,175,55,0.2)'
            : isSuccess
              ? '0 6px 30px rgba(16,185,129,0.35)'
              : '0 6px 30px rgba(239,68,68,0.35)',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: isSyncing ? '#d4af37' : isSuccess ? '#10b981' : '#ef4444',
          letterSpacing: '0.3px',
          minWidth: isSyncing ? '340px' : 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.85rem' }}>
          {isSyncing && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {isWaitingShopify ? (
                  <Clock size={15} style={{ animation: 'pulse 1.2s infinite', flexShrink: 0 }} />
                ) : (
                  <Loader2 size={15} style={{ animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
                )}
                <Zap size={13} style={{ flexShrink: 0, opacity: 0.8 }} />
                <span>
                  {isWaitingShopify
                    ? 'Waiting for Shopify confirmation...'
                    : 'Submitting request to Shopify...'}
                </span>
              </div>
              <span style={{ fontSize: '0.8rem', opacity: 0.95, fontWeight: 700 }}>
                {isWaitingShopify ? '100%' : `${progressPercent}%`}
              </span>
            </>
          )}

          {isSuccess && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <CheckCircle size={16} style={{ flexShrink: 0 }} />
              <span>
                Sync Complete
                {lastResult?.successCount > 0
                  ? ` · ${lastResult.successCount.toLocaleString()} products updated & logged`
                  : ' · Already up to date'}
              </span>
            </div>
          )}

          {!isSyncing && !isSuccess && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <XCircle size={16} style={{ flexShrink: 0 }} />
              <span>
                Sync Failed
                {lastResult?.failCount > 0 ? ` · ${lastResult.failCount} error(s)` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Live Progress Bar when syncing */}
        {isSyncing && (
          <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: '3px', overflow: 'hidden', marginTop: '0.2rem' }}>
            <div
              style={{
                height: '100%',
                width: `${isWaitingShopify ? 100 : progressPercent}%`,
                backgroundColor: 'var(--gold-primary)',
                borderRadius: '3px',
                transition: 'width 0.2s ease-out',
                boxShadow: isWaitingShopify ? '0 0 10px rgba(212,175,55,0.8)' : 'none',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
