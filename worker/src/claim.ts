import { supabase } from './supabase.js';

// Timeout constants for different operations - v2 force sync
const CLAIM_RPC_TIMEOUT_MS = 30_000; // 30 seconds for claim RPCs
const GENERAL_TIMEOUT_MS = 15_000;   // 15 seconds for general operations

/**
 * Wrap a promise-like (thenable) with a timeout to prevent indefinite hangs.
 * Uses 'any' to handle Supabase query builders which have complex thenable types.
 * Cast the result at call sites if you need specific typing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withTimeout<T = any>(
  promiseLike: any,
  ms: number,
  label: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`TIMEOUT: ${label} exceeded ${ms}ms`));
    }, ms);
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
 * Includes timeout protection to prevent indefinite hangs.
 */
export async function claimBatch(batchSize: number = 25): Promise<QueueItem[]> {
  try {
    const result = await withTimeout<{ data: any; error: any }>(
      supabase.rpc('claim_email_queue_batch', { p_batch_size: batchSize }),
      CLAIM_RPC_TIMEOUT_MS,
      'claim_email_queue_batch'
    );

    if (result.error) {
      console.error('[claim] Error claiming outbound batch:', result.error);
      throw result.error;
    }

    const claimed = (result.data || []) as QueueItem[];
    if (claimed.length > 0) {
      console.log(`[claim] Claimed ${claimed.length} outbound emails for processing`);
    }
    return claimed;
  } catch (err: any) {
    const isTimeout = err?.message?.includes('TIMEOUT');
    console.error('[claim] claimBatch error:', {
      isTimeout,
      message: err?.message,
      name: err?.name,
    });
    // On timeout, return empty array to let loop continue rather than crash
    if (isTimeout) {
      return [];
    }
    throw err;
  }
}

/**
 * Atomically claim a batch of INBOUND email queue items for parsing.
 * Uses FOR UPDATE SKIP LOCKED to prevent race conditions between workers.
 * INBOUND = has payload_url AND to_email IS NULL AND parsed_at IS NULL
 * These are load emails from Gmail that need parsing, NOT outbound sends.
 * Includes timeout protection to prevent indefinite hangs.
 */
export async function claimInboundBatch(batchSize: number = 50): Promise<InboundQueueItem[]> {
  try {
    const result = await withTimeout<{ data: any; error: any }>(
      supabase.rpc('claim_inbound_email_queue_batch', { p_batch_size: batchSize }),
      CLAIM_RPC_TIMEOUT_MS,
      'claim_inbound_email_queue_batch'
    );

    if (result.error) {
      // Check for auth-related failures
      const isAuthFailure = 
        result.error.code === '401' || 
        result.error.code === '403' || 
        (result.error as any).status === 401 ||
        (result.error as any).status === 403 ||
        result.error.message?.includes('UNAUTHENTICATED') ||
        result.error.message?.includes('Invalid API key') ||
        result.error.message?.includes('JWT');

      console.error('[claim] Error claiming inbound batch:', {
        message: result.error.message,
        code: result.error.code,
        details: result.error.details,
        hint: result.error.hint,
        status: (result.error as any).status,
      });

      if (isAuthFailure) {
        console.error('[claim] AUTH_FAILURE - check service role key configuration');
      }

      throw result.error;
    }

    const claimed = (result.data || []) as InboundQueueItem[];
    if (claimed.length > 0) {
      console.log(`[claim] Claimed ${claimed.length} inbound emails for processing`);
    }
    return claimed;
  } catch (err: any) {
    const isTimeout = err?.message?.includes('TIMEOUT');
    
    // Check for auth-related failures in catch block
    const isAuthFailure = 
      err?.code === '401' || 
      err?.code === '403' || 
      err?.status === 401 ||
      err?.status === 403 ||
      err?.message?.includes('UNAUTHENTICATED') ||
      err?.message?.includes('Invalid API key') ||
      err?.message?.includes('JWT');

    console.error('[claim] claimInboundBatch error:', {
      isTimeout,
      isAuthFailure,
      name: err?.name,
      message: err?.message,
      code: err?.code,
      status: err?.status,
    });

    if (isAuthFailure) {
      console.error('[claim] AUTH_FAILURE - check service role key configuration');
    }

    // On timeout, return empty array to let loop continue rather than crash
    if (isTimeout) {
      return [];
    }

    throw err;
  }
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
 * Includes timeout protection to prevent indefinite hangs.
 */
export async function claimHistoryBatch(batchSize: number = 25): Promise<HistoryQueueItem[]> {
  try {
    const result = await withTimeout<{ data: any; error: any }>(
      supabase.rpc('claim_gmail_history_batch', { p_batch_size: batchSize }),
      CLAIM_RPC_TIMEOUT_MS,
      'claim_gmail_history_batch'
    );

    if (result.error) {
      console.error('[claim] Error claiming history batch:', result.error);
      throw result.error;
    }

    const claimed = (result.data || []) as HistoryQueueItem[];
    if (claimed.length > 0) {
      console.log(`[claim] Claimed ${claimed.length} history stubs for processing`);
    }
    return claimed;
  } catch (err: any) {
    const isTimeout = err?.message?.includes('TIMEOUT');
    console.error('[claim] claimHistoryBatch error:', {
      isTimeout,
      message: err?.message,
      name: err?.name,
    });
    // On timeout, return empty array to let loop continue rather than crash
    if (isTimeout) {
      return [];
    }
    throw err;
  }
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
