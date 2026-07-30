'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, XCircle, Loader2, Zap } from 'lucide-react';

/**
 * AutoSyncBanner — polls /api/sync-status every 3 seconds.
 * • Shows a top-center floating "Syncing…" pill while syncing is active.
 * • When sync completes, shows a success/error notification for 4 seconds then fades out.
 */
export default function AutoSyncBanner() {
  const [phase, setPhase] = useState('idle'); // 'idle' | 'syncing' | 'done-success' | 'done-error'
  const [lastResult, setLastResult] = useState(null);
  const [syncData, setSyncData] = useState(null);
  const prevSyncing = useRef(false);
  const hideTimer = useRef(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/sync-status', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();

      const isSyncing = !!data.syncing;

      if (isSyncing) {
        // Clear any pending hide timer
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setPhase('syncing');
        setSyncData(data);
        prevSyncing.current = true;
      } else if (prevSyncing.current && !isSyncing && data.lastResult) {
        // Transition: was syncing, now done
        prevSyncing.current = false;
        setLastResult(data.lastResult);
        setPhase(data.lastResult.success ? 'done-success' : 'done-error');

        // Auto-hide after 4 seconds
        hideTimer.current = setTimeout(() => setPhase('idle'), 4000);
      }
    } catch {
      // Silently ignore network errors
    }
  }, []);

  useEffect(() => {
    // Poll immediately on mount, then every 3 seconds
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      clearInterval(interval);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [poll]);

  if (phase === 'idle') return null;

  const isSyncing = phase === 'syncing';
  const isSuccess = phase === 'done-success';

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
          padding: '0.65rem 1.25rem',
          borderRadius: '16px',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${isSyncing ? 'rgba(212,175,55,0.45)' : isSuccess ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)'}`,
          background: isSyncing
            ? 'rgba(18, 16, 8, 0.92)'
            : isSuccess
            ? 'rgba(6, 28, 18, 0.92)'
            : 'rgba(28, 8, 8, 0.92)',
          boxShadow: isSyncing
            ? '0 6px 30px rgba(212,175,55,0.3), 0 0 0 1px rgba(212,175,55,0.15)'
            : isSuccess
            ? '0 6px 30px rgba(16,185,129,0.3)'
            : '0 6px 30px rgba(239,68,68,0.3)',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: isSyncing ? '#d4af37' : isSuccess ? '#10b981' : '#ef4444',
          letterSpacing: '0.3px',
          minWidth: isSyncing ? '280px' : 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          {isSyncing && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Loader2
                  size={15}
                  style={{ animation: 'spin 0.9s linear infinite', flexShrink: 0 }}
                />
                <Zap size={13} style={{ flexShrink: 0, opacity: 0.75 }} />
                <span>
                  {syncData?.isAuto ? 'Auto Sync Running…' : 'Manual Sync Running…'}
                </span>
              </div>
              <span style={{ fontSize: '0.8rem', opacity: 0.9, fontWeight: 700 }}>
                {syncData?.totalItems > 0
                  ? `${syncData.completedItems || 0}/${syncData.totalItems}`
                  : 'Starting...'}
              </span>
            </>
          )}
          {isSuccess && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={15} style={{ flexShrink: 0 }} />
              <span>
                Sync Complete
                {lastResult?.successCount > 0
                  ? ` · ${lastResult.successCount} product${lastResult.successCount > 1 ? 's' : ''} updated`
                  : ' · Already up to date'}
              </span>
            </div>
          )}
          {!isSyncing && !isSuccess && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <XCircle size={15} style={{ flexShrink: 0 }} />
              <span>
                Sync Failed
                {lastResult?.failCount > 0 ? ` · ${lastResult.failCount} error${lastResult.failCount > 1 ? 's' : ''}` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Live Progress Bar when syncing */}
        {isSyncing && (
          <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${syncData?.totalItems ? Math.min(100, Math.round(((syncData.completedItems || 0) / syncData.totalItems) * 100)) : 5}%`,
              backgroundColor: 'var(--gold-primary)',
              borderRadius: '3px',
              transition: 'width 0.4s ease'
            }} />
          </div>
        )}
      </div>
    </div>
  );
}
