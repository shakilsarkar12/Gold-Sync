import { NextResponse } from 'next/server';
import { getSyncStatus, setSyncStatus } from '@/lib/db';
import { runProductSync } from '@/lib/sync';

export const maxDuration = 300; // Allow Vercel up to 5 minutes to complete the sync

export async function POST() {
  try {
    // Prevent overlapping syncs unless previous sync is stale (> 3 minutes)
    const currentStatus = await getSyncStatus();
    if (currentStatus && currentStatus.syncing) {
      const elapsedMs = currentStatus.startedAt ? (Date.now() - new Date(currentStatus.startedAt).getTime()) : 0;
      if (elapsedMs < 3 * 60 * 1000 && !currentStatus.bulkOperationId) {
        return NextResponse.json({ message: 'Sync already in progress.' }, { status: 200 });
      }
    }

    // Immediately mark sync as running in DB with empty lastResult
    await setSyncStatus({
      syncing: true,
      startedAt: new Date().toISOString(),
      lastResult: null,
      isAuto: false,
      totalItems: 0,
      completedItems: 0,
    });

    // Run sync in background (don't await — return immediately so UI doesn't block)
    runProductSync(false).catch((err) => {
      console.error('[Sync Now] Background sync failed:', err);
    });

    return NextResponse.json({ success: true, message: 'Sync started.' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to start sync' }, { status: 500 });
  }
}
