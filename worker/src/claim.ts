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

export interface InboundQueueItem {
  id: string;
  tenant_id: string | null;
  gmail_message_id: string;
  gmail_history_id: string | null;
  payload_url: string | null; // Storage path (e.g., "gmail/ab/hash.json") - NOT a URL
  attempts: number;
  queued_at: string;
  subject: string | null;
  from_email: string | null;
  body_html: string | null;
  body_text: string | null;
}

/**
 * Atomically claim a batch of OUTBOUND email queue items using FOR UPDATE SKIP LOCKED.
 * These are emails with to_email populated (sent via Resend).
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
 * Atomically claim a batch of INBOUND email queue items for parsing.
 * Uses FOR UPDATE SKIP LOCKED to prevent race conditions between workers.
 * INBOUND = has payload_url AND subject IS NULL (not yet parsed)
 * These are load emails from Gmail that need parsing, NOT outbound sends.
 */
export async function claimInboundBatch(batchSize: number = 50): Promise<InboundQueueItem[]> {
  const { data, error } = await supabase.rpc('claim_inbound_email_queue_batch', {
    p_batch_size: batchSize,
  });

  if (error) {
    console.error('[claim] Error claiming inbound batch:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  console.log(`[claim] Claimed ${data.length} inbound emails for processing`);
  return (data || []) as InboundQueueItem[];
}

/**
 * Check for stuck emails (too many attempts) and mark them as failed.
 * Returns count of emails marked as failed.
 */
export async function markStuckEmailsAsFailed(maxAttempts: number = 50): Promise<number> {
  const { data, error } = await supabase
    .from('email_queue')
    .update({ 
      status: 'failed', 
      last_error: `Exceeded ${maxAttempts} attempts - marked as stuck`,
      processing_started_at: null 
    })
    .gte('attempts', maxAttempts)
    .neq('status', 'failed')
    .neq('status', 'completed')
    .select('id');

  if (error) {
    console.error('[claim] Error marking stuck emails as failed:', error);
    return 0;
  }

  return data?.length || 0;
}

/**
 * Get count of potentially stuck emails (high attempt count).
 */
export async function getStuckEmailCount(threshold: number = 10): Promise<{ count: number; maxAttempts: number }> {
  const { data, error } = await supabase
    .from('email_queue')
    .select('attempts')
    .gte('attempts', threshold)
    .neq('status', 'failed')
    .neq('status', 'completed');

  if (error) {
    console.error('[claim] Error getting stuck email count:', error);
    return { count: 0, maxAttempts: 0 };
  }

  const count = data?.length || 0;
  const maxAttempts = data?.reduce((max, item) => Math.max(max, item.attempts || 0), 0) || 0;
  
  return { count, maxAttempts };
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

// ═══════════════════════════════════════════════════════════════════════════
// GMAIL HISTORY QUEUE (Phase 7B - ENQUEUE_ONLY mode)
// ═══════════════════════════════════════════════════════════════════════════

export interface HistoryQueueItem {
  id: string;
  email_address: string;
  history_id: string;
  status: string;
  attempts: number;
  queued_at: string;
  last_error: string | null;
}

/**
 * Atomically claim a batch of gmail_history_queue items for processing.
 * Uses FOR UPDATE SKIP LOCKED to prevent race conditions between workers.
 */
export async function claimHistoryBatch(batchSize: number = 25): Promise<HistoryQueueItem[]> {
  const { data, error } = await supabase.rpc('claim_gmail_history_batch', {
    p_batch_size: batchSize,
  });

  if (error) {
    console.error('[claim] Error claiming history batch:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  console.log(`[claim] Claimed ${data.length} history stubs for processing`);
  return (data || []) as HistoryQueueItem[];
}

/**
 * Mark a gmail_history_queue item as completed.
 */
export async function completeHistoryItem(id: string): Promise<void> {
  const { error } = await supabase.rpc('complete_gmail_history_item', {
    p_id: id,
  });

  if (error) {
    console.error(`[claim] Error completing history item ${id}:`, error);
    throw error;
  }
}

/**
 * Mark a gmail_history_queue item as failed with error message.
 */
export async function failHistoryItem(id: string, errorMessage: string): Promise<void> {
  const { error } = await supabase.rpc('fail_gmail_history_item', {
    p_id: id,
    p_error: errorMessage,
  });

  if (error) {
    console.error(`[claim] Error failing history item ${id}:`, error);
    throw error;
  }
}
