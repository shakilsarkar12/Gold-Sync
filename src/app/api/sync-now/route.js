import { NextResponse } from 'next/server';
import { getSyncStatus } from '@/lib/db';
import { runProductSync } from '@/lib/sync';

export const maxDuration = 300; // Allow Vercel up to 5 minutes to complete the sync

export async function POST() {
  try {
    // Prevent overlapping syncs
    const currentStatus = await getSyncStatus();
    if (currentStatus.syncing) {
      return NextResponse.json({ message: 'Sync already in progress.' }, { status: 200 });
    }

    // Run sync in background (don't await — return immediately so UI doesn't block)
    // On Vercel, returning early normally kills the function, but since this is Node.js runtime
    // the promise will keep executing until maxDuration is reached or it finishes.
    runProductSync(false).catch((err) => {
      console.error('[Sync Now] Background sync failed:', err);
    });

    return NextResponse.json({ success: true, message: 'Sync started.' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to start sync' }, { status: 500 });
  }
}
