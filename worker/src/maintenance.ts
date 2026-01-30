import { supabase } from './supabase.js';

const MAINTENANCE_TIMEOUT_MS = 15_000;

/**
 * Helper to wrap a promise-like with a timeout using Promise.race
 * Uses 'any' to handle Supabase query builder thenables
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withMaintenanceTimeout<T = any>(
  promiseLike: any,
  timeoutMs: number,
  stepName: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`TIMEOUT (${timeoutMs}ms) at ${stepName}`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      Promise.resolve(promiseLike),
      timeoutPromise,
    ]);
    if (timeoutId) clearTimeout(timeoutId);
    return result as T;
  } catch (e) {
    if (timeoutId) clearTimeout(timeoutId);
    throw e;
  }
}

/**
 * Reset stuck processing rows in email_queue.
 *
 * This is a worker-side failsafe for cases where the worker claims rows (status=processing)
 * and then crashes/hangs before it can complete/fail them.
 * 
 * Now includes timeout protection to prevent blocking the worker loop.
 */
export async function resetStuckProcessingRows(stuckAgeMinutes: number = 5): Promise<number> {
  const cutoff = new Date(Date.now() - stuckAgeMinutes * 60 * 1000).toISOString();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await withMaintenanceTimeout(
      supabase
        .from('email_queue')
        .update({
          status: 'pending',
          processing_started_at: null,
          last_error: 'reset_stuck_processing',
        })
        .eq('status', 'processing')
        .lt('processing_started_at', cutoff)
        .select('id'),
      MAINTENANCE_TIMEOUT_MS,
      'reset-stuck-processing'
    );

    if (result?.error) {
      console.error('[maintenance] Failed to reset stuck processing rows', {
        error: result.error.message,
        cutoff,
      });
      return 0;
    }

    return result?.data?.length || 0;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('TIMEOUT')) {
      console.error('[maintenance] TIMEOUT resetting stuck rows - Supabase may be unresponsive');
      return 0;
    }
    console.error('[maintenance] Error resetting stuck rows:', msg);
    return 0;
  }
}
