import { NextResponse } from 'next/server';
import { getSettings, getSchedulerState, saveSchedulerState } from '@/lib/db';
import { runProductSync } from '@/lib/sync';

export async function GET(request) {
  // Security Check: Verify the request comes from Vercel Cron.
  // Vercel appends an Authorization header with Bearer token if CRON_SECRET is configured.
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const settings = await getSettings();
    if (!settings.autoSyncEnabled) {
      return NextResponse.json({ message: 'Auto-sync is disabled in configuration settings.' });
    }

    const state = await getSchedulerState();
    const lastSyncTime = state.lastSyncTime || 0;
    const syncIntervalMinutes = parseInt(settings.syncInterval) || 5;
    const intervalMs = syncIntervalMinutes * 60 * 1000;
    const now = Date.now();

    // Check if the configured interval has elapsed
    if (now - lastSyncTime >= intervalMs) {
      console.log(`[Vercel Cron] Dynamic interval elapsed (${syncIntervalMinutes}m). Starting auto-sync...`);
      
      // Save new timestamp immediately to prevent overlapping execution
      await saveSchedulerState({ lastSyncTime: now });
      
      const result = await runProductSync(true);
      return NextResponse.json({
        success: true,
        message: 'Auto-sync completed successfully.',
        updatedCount: result.successCount,
        failCount: result.failCount,
      });
    }

    const nextRunSeconds = Math.ceil((intervalMs - (now - lastSyncTime)) / 1000);
    return NextResponse.json({
      message: 'Sync interval has not elapsed yet.',
      syncIntervalMinutes,
      nextSyncInSeconds: nextRunSeconds,
    });
  } catch (error) {
    console.error('[Vercel Cron] Sync loop execution failed:', error);
    return NextResponse.json(
      { error: error.message || 'Cron sync execution failed' },
      { status: 500 }
    );
  }
}
