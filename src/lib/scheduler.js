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

      const syncIntervalMinutes = parseInt(settings.syncInterval) || 5;
      const intervalMs = syncIntervalMinutes * 60 * 1000;
      const now = Date.now();

      // Read lastSyncTime from DB (persists across hot-reloads and restarts)
      const state = await getSchedulerState();
      const lastSyncTime = state.lastSyncTime || 0;

      // Check if it's time to run the sync
      if (now - lastSyncTime >= intervalMs) {
        console.log(`[Scheduler] Auto-sync triggered. Interval: ${syncIntervalMinutes}m. Last sync: ${lastSyncTime ? new Date(lastSyncTime).toISOString() : 'never'}`);
        
        // Persist the new timestamp BEFORE running to prevent overlapping ticks
        await saveSchedulerState({ lastSyncTime: now });
        
        const result = await runProductSync(true);
        console.log(`[Scheduler] Auto-sync completed. Updated: ${result.successCount}, Failed: ${result.failCount}.`);
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
