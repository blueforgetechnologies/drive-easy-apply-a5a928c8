import { supabase } from './supabase.js';

/**
 * Reset stuck processing rows in email_queue.
 *
 * This is a worker-side failsafe for cases where the worker claims rows (status=processing)
 * and then crashes/hangs before it can complete/fail them.
 */
export async function resetStuckProcessingRows(stuckAgeMinutes: number = 5): Promise<number> {
  const cutoff = new Date(Date.now() - stuckAgeMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('email_queue')
    .update({
      status: 'pending',
      processing_started_at: null,
      last_error: 'reset_stuck_processing',
    })
    .eq('status', 'processing')
    .lt('processing_started_at', cutoff)
    .select('id');

  if (error) {
    console.error('[maintenance] Failed to reset stuck processing rows', {
      error: error.message,
      cutoff,
    });
    return 0;
  }

  return data?.length || 0;
}
