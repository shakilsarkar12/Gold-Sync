/**
 * Next.js Instrumentation Hook
 * This file is automatically executed by Next.js once when the server starts.
 * It is the correct place to initialize background tasks like the scheduler.
 * See: next.config.mjs instrumentation docs
 */

export async function register() {
  // Only run on the server-side Node.js runtime, not in Edge or browser
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initScheduler } = await import('./lib/scheduler');
    initScheduler();
  }
}
