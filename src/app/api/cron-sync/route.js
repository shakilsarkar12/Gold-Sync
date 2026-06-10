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

    const syncTimes = settings.syncTimes || [];
    if (syncTimes.length === 0) {
      return NextResponse.json({ message: 'No sync times configured.' });
    }

    const now = new Date();
    const timezone = settings.timezone || 'Asia/Dhaka';
    let formattedTime = '';

    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
      }).formatToParts(now);
      
      let hour = 0;
      let minute = 0;
      for (const part of parts) {
        if (part.type === 'hour') hour = parseInt(part.value, 10);
        if (part.type === 'minute') minute = parseInt(part.value, 10);
      }
      hour = hour % 24;
      formattedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    } catch (err) {
      console.error('[Vercel Cron] Timezone formatting error:', err);
      const hour = now.getHours();
      const minute = now.getMinutes();
      formattedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }

    const isScheduledTime = syncTimes.includes(formattedTime);

    if (isScheduledTime) {
      const state = await getSchedulerState();
      const lastSyncTime = state.lastSyncTime || 0;
      const timeSinceLastSync = Date.now() - lastSyncTime;

      // Run sync only if at least 5 minutes has passed since the last sync
      if (timeSinceLastSync >= 5 * 60 * 1000) {
        console.log(`[Vercel Cron] Auto-sync triggered at scheduled time: ${formattedTime} (${timezone}).`);
        await saveSchedulerState({ lastSyncTime: Date.now() });
        
        const result = await runProductSync(true);
        return NextResponse.json({
          success: true,
          message: `Auto-sync completed successfully at ${formattedTime}.`,
          updatedCount: result.successCount,
          failCount: result.failCount,
        });
      }
    }

    return NextResponse.json({
      message: 'Sync not scheduled for this minute.',
      currentTime: formattedTime,
      configuredTimes: syncTimes,
      timezone
    });
  } catch (error) {
    console.error('[Vercel Cron] Sync loop execution failed:', error);
    return NextResponse.json(
      { error: error.message || 'Cron sync execution failed' },
      { status: 500 }
    );
  }
}
