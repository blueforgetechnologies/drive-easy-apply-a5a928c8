import { supabase } from './supabase.js';

export interface QueueItem {
  id: string;
  tenant_id: string | null;
  gmail_message_id: string;
  gmail_history_id: string | null;
  payload_url: string | null;
  attempts: number;
  queued_at: string;
  // Outbound email fields
  to_email: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  from_email: string | null;
  from_name: string | null;
}

/**
 * Atomically claim a batch of email queue items using FOR UPDATE SKIP LOCKED.
 * This prevents multiple workers from processing the same items.
 */
export async function claimBatch(batchSize: number = 25): Promise<QueueItem[]> {
  const { data, error } = await supabase.rpc('claim_email_queue_batch', {
    p_batch_size: batchSize,
  });

  if (error) {
    console.error('[claim] Error claiming batch:', error);
    throw error;
  }

  return (data || []) as QueueItem[];
}

/**
 * Mark a queue item as sent/completed.
 */
export async function completeItem(id: string, status: string = 'sent'): Promise<void> {
  const { error } = await supabase.rpc('complete_email_queue_item', { 
    p_id: id,
    p_status: status,
  });
  
  if (error) {
    console.error(`[claim] Error completing item ${id}:`, error);
    throw error;
  }
}

/**
 * Mark a queue item as failed with error message.
 */
export async function failItem(id: string, errorMessage: string, attempts: number): Promise<void> {
  const { error } = await supabase.rpc('fail_email_queue_item', {
    p_id: id,
    p_error: errorMessage,
    p_attempts: attempts,
  });

  if (error) {
    console.error(`[claim] Error failing item ${id}:`, error);
    throw error;
  }
}

/**
 * Reset stale items that have been stuck in 'processing' for over 5 minutes.
 * Should be called periodically (e.g., every 60 seconds).
 */
export async function resetStaleItems(): Promise<number> {
  const { data, error } = await supabase.rpc('reset_stale_email_queue');

  if (error) {
    console.error('[claim] Error resetting stale items:', error);
    throw error;
  }

  return data as number;
}
