import { getSettings, getSchedulerState, saveSchedulerState } from './db';
import { runProductSync } from './sync';

export function initScheduler() {
  // Skip background timer initialization if running on Vercel serverless environment.
  // Vercel Cron Job triggers /api/cron-sync periodically instead.
  if (process.env.VERCEL) {
    console.log('[Scheduler] Running on Vercel. Background setInterval scheduler skipped (Vercel Cron will handle syncs).');
    return;
  }

  // Prevent duplicate scheduler initializations in Next.js development mode (due to hot reloading)
  if (global.priceSyncSchedulerInitialized) {
    return;
  }

  global.priceSyncSchedulerInitialized = true;

  console.log('[Scheduler] Background Gold Price Sync Scheduler initialized (DB-backed).');

  const tick = async () => {
    try {
      const settings = await getSettings();
      
      if (!settings.autoSyncEnabled) {
        return;
      }

      const syncTimes = settings.syncTimes || [];
      if (syncTimes.length === 0) {
        return;
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
        console.error('[Scheduler] Timezone formatting error:', err);
        const hour = now.getHours();
        const minute = now.getMinutes();
        formattedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      }

      const isScheduledTime = syncTimes.includes(formattedTime);

      if (isScheduledTime) {
        // Read lastSyncTime from DB (persists across hot-reloads and restarts)
        const state = await getSchedulerState();
        const lastSyncTime = state.lastSyncTime || 0;
        const timeSinceLastSync = Date.now() - lastSyncTime;

        // Run sync only if at least 5 minutes has passed since the last sync
        // to prevent duplicate triggers in the same 1-minute window.
        if (timeSinceLastSync >= 5 * 60 * 1000) {
          console.log(`[Scheduler] Auto-sync triggered at scheduled time: ${formattedTime} (${timezone}).`);
          await saveSchedulerState({ lastSyncTime: Date.now() });
          
          const result = await runProductSync(true);
          console.log(`[Scheduler] Auto-sync completed. Updated: ${result.successCount}, Failed: ${result.failCount}.`);
        }
      }
    } catch (error) {
      console.error('[Scheduler] Error in auto-sync tick:', error);
    }
  };

  // Run the tick check every 30 seconds
  setInterval(tick, 30 * 1000);

  // Run an initial tick check immediately on startup
  tick();
}
