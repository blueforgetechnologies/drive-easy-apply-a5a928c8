/**
 * Email Queue Worker
 * 
 * High-performance outbound email processor for multi-tenant TMS.
 * Sends emails via Resend API.
 * Designed for VPS deployment with multiple concurrent workers.
 * 
 * Features:
 * - Atomic queue claiming (FOR UPDATE SKIP LOCKED)
 * - Multi-worker safe (no double-processing)
 * - Automatic stale job recovery
 * - Health check HTTP endpoint
 * - Structured logging with metrics
 * - Dynamic configuration from database
 * 
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... RESEND_API_KEY=... npm start
 */

import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { claimBatch, claimInboundBatch, claimStubBatch, completeItem, failItem, resetStaleItems, markStuckEmailsAsFailed, getStuckEmailCount } from './claim.js';
import { processQueueItem } from './process.js';
import { processInboundEmail } from './inbound.js';
import { processStubItem } from './stub-processor.js';
import { supabase } from './supabase.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION (defaults, can be overridden by database)
// ═══════════════════════════════════════════════════════════════════════════

interface DynamicConfig {
  enabled: boolean;
  paused: boolean;
  batch_size: number;
  loop_interval_ms: number;
  concurrent_limit: number;
  per_request_delay_ms: number;
  backoff_on_429: boolean;
  backoff_duration_ms: number;
  max_retries: number;
  restart_requested_at: string | null;
}

// Default configuration (used if database unavailable)
const DEFAULT_CONFIG: DynamicConfig = {
  enabled: true,
  paused: false,
  batch_size: 25,
  loop_interval_ms: 3000,
  concurrent_limit: 5,
  per_request_delay_ms: 0,
  backoff_on_429: true,
  backoff_duration_ms: 30000,
  max_retries: 3,
  restart_requested_at: null,
};

// Current active configuration (updated from database)
let currentConfig: DynamicConfig = { ...DEFAULT_CONFIG };

// Static configuration
const STATIC_CONFIG = {
  // Recovery
  STALE_RESET_INTERVAL_MS: 60000,  // Reset stale items every 60 seconds
  CONFIG_REFRESH_INTERVAL_MS: 10000, // Refresh config from database every 10 seconds
  
  // Health check
  HEALTH_PORT: parseInt(process.env.HEALTH_PORT || '8080', 10),
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// STATE & METRICS
// ═══════════════════════════════════════════════════════════════════════════

interface WorkerMetrics {
  startedAt: Date;
  loopCount: number;
  emailsSent: number;
  emailsFailed: number;
  lastBatchTime: number;
  lastBatchSize: number;
  staleResetCount: number;
  isHealthy: boolean;
  lastHeartbeat: Date;
  rateLimitBackoffUntil: number;
  configSource: 'database' | 'default';
  lastConfigRefresh: Date | null;
}

const METRICS: WorkerMetrics = {
  startedAt: new Date(),
  loopCount: 0,
  emailsSent: 0,
  emailsFailed: 0,
  lastBatchTime: 0,
  lastBatchSize: 0,
  staleResetCount: 0,
  isHealthy: true,
  lastHeartbeat: new Date(),
  rateLimitBackoffUntil: 0,
  configSource: 'default',
  lastConfigRefresh: null,
};

let isShuttingDown = false;
let lastStaleReset = Date.now();
let lastConfigRefresh = 0;

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED LOGGING
// ═══════════════════════════════════════════════════════════════════════════

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLogLevel = LOG_LEVELS[STATIC_CONFIG.LOG_LEVEL as LogLevel] ?? LOG_LEVELS.info;

function getWorkerId(): string {
  // In Docker, HOSTNAME is set inside the container (usually to the container id)
  // This gives us a stable-per-container unique ID even when WORKER_ID isn't configured.
  return process.env.WORKER_ID || process.env.HOSTNAME || 'worker-1';
}

function log(level: LogLevel, message: string, meta?: Record<string, any>): void {
  if (LOG_LEVELS[level] < currentLogLevel) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    worker: getWorkerId(),
    ...meta,
  };

  // JSON logging for production, pretty for dev
  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify(entry));
  } else {
    const prefix = `[${entry.ts}] [${level.toUpperCase()}]`;
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`${prefix} ${message}${metaStr}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

async function refreshConfig(): Promise<{ shouldRestart: boolean }> {
  try {
    const { data, error } = await supabase.rpc('get_worker_config');
    
    if (error) {
      log('warn', 'Failed to fetch config from database, using defaults', { error: error.message });
      METRICS.configSource = 'default';
      return { shouldRestart: false };
    }
    
    if (data && data.length > 0) {
      const dbConfig = data[0];
      
      // Check for restart signal
      if (dbConfig.restart_requested_at) {
        log('info', 'Restart signal detected', { requested_at: dbConfig.restart_requested_at });
        
        // Clear the restart signal before exiting
        await clearRestartSignal();
        
        return { shouldRestart: true };
      }
      
      currentConfig = {
        enabled: dbConfig.enabled ?? DEFAULT_CONFIG.enabled,
        paused: dbConfig.paused ?? DEFAULT_CONFIG.paused,
        batch_size: dbConfig.batch_size ?? DEFAULT_CONFIG.batch_size,
        loop_interval_ms: dbConfig.loop_interval_ms ?? DEFAULT_CONFIG.loop_interval_ms,
        concurrent_limit: dbConfig.concurrent_limit ?? DEFAULT_CONFIG.concurrent_limit,
        per_request_delay_ms: dbConfig.per_request_delay_ms ?? DEFAULT_CONFIG.per_request_delay_ms,
        backoff_on_429: dbConfig.backoff_on_429 ?? DEFAULT_CONFIG.backoff_on_429,
        backoff_duration_ms: dbConfig.backoff_duration_ms ?? DEFAULT_CONFIG.backoff_duration_ms,
        max_retries: dbConfig.max_retries ?? DEFAULT_CONFIG.max_retries,
        restart_requested_at: dbConfig.restart_requested_at ?? null,
      };
      METRICS.configSource = 'database';
      METRICS.lastConfigRefresh = new Date();
      log('debug', 'Config refreshed from database', { config: currentConfig });
    }
    return { shouldRestart: false };
  } catch (error) {
    log('warn', 'Exception refreshing config', { error: String(error) });
    METRICS.configSource = 'default';
    return { shouldRestart: false };
  }
}

async function clearRestartSignal(): Promise<void> {
  try {
    const { error } = await supabase
      .from('worker_config')
      .update({ restart_requested_at: null })
      .eq('id', 'default');
    
    if (error) {
      log('warn', 'Failed to clear restart signal', { error: error.message });
    } else {
      log('info', 'Restart signal cleared');
    }
  } catch (error) {
    log('warn', 'Exception clearing restart signal', { error: String(error) });
  }
}

async function reportHeartbeat(): Promise<void> {
  const workerId = getWorkerId();
  const status = METRICS.rateLimitBackoffUntil > Date.now() ? 'degraded' : 'healthy';

  const payload = {
    id: workerId,
    last_heartbeat: new Date().toISOString(),
    status,
    emails_sent: METRICS.emailsSent,
    emails_failed: METRICS.emailsFailed,
    loops_completed: METRICS.loopCount,
    current_batch_size: METRICS.lastBatchSize,
    rate_limit_until:
      METRICS.rateLimitBackoffUntil > Date.now()
        ? new Date(METRICS.rateLimitBackoffUntil).toISOString()
        : null,
    error_message: null as string | null,
    host_info: {
      uptime_ms: Date.now() - METRICS.startedAt.getTime(),
      config_source: METRICS.configSource,
      node_version: process.version,
    },
  };

  try {
    // Prefer RPC (centralized logic + upsert)
    const { error } = await supabase.rpc('worker_heartbeat', {
      p_worker_id: workerId,
      p_status: status,
      p_emails_sent: METRICS.emailsSent,
      p_emails_failed: METRICS.emailsFailed,
      p_loops_completed: METRICS.loopCount,
      p_current_batch_size: METRICS.lastBatchSize,
      p_rate_limit_until:
        METRICS.rateLimitBackoffUntil > Date.now()
          ? new Date(METRICS.rateLimitBackoffUntil).toISOString()
          : null,
      p_error_message: null,
      p_host_info: payload.host_info,
    });

    if (error) {
      // IMPORTANT: supabase-js returns errors in { error }, it does not throw.
      log('warn', 'Failed to report heartbeat via RPC', {
        worker_id: workerId,
        error: error.message,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
      });

      // Fallback: write directly (service role bypasses RLS)
      const { error: upsertError } = await supabase
        .from('worker_heartbeats')
        .upsert(payload, { onConflict: 'id' });

      if (upsertError) {
        log('warn', 'Failed to report heartbeat via fallback upsert', {
          worker_id: workerId,
          error: upsertError.message,
          code: (upsertError as any).code,
          details: (upsertError as any).details,
          hint: (upsertError as any).hint,
        });
      }
    }
  } catch (err) {
    // Only catches unexpected exceptions (network, etc.)
    log('warn', 'Exception reporting heartbeat', {
      worker_id: workerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK SERVER
// ═══════════════════════════════════════════════════════════════════════════

function startHealthServer(): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health' || req.url === '/healthz') {
      const uptimeMs = Date.now() - METRICS.startedAt.getTime();
      const health = {
        status: METRICS.isHealthy ? 'healthy' : 'unhealthy',
        uptime_ms: uptimeMs,
        uptime_human: formatUptime(uptimeMs),
        metrics: {
          loops: METRICS.loopCount,
          emails_sent: METRICS.emailsSent,
          emails_failed: METRICS.emailsFailed,
          last_batch_size: METRICS.lastBatchSize,
          last_batch_time_ms: METRICS.lastBatchTime,
          stale_resets: METRICS.staleResetCount,
          last_heartbeat: METRICS.lastHeartbeat.toISOString(),
          rate_limit_backoff_until: METRICS.rateLimitBackoffUntil > Date.now() 
            ? new Date(METRICS.rateLimitBackoffUntil).toISOString() 
            : null,
        },
        config: {
          source: METRICS.configSource,
          last_refresh: METRICS.lastConfigRefresh?.toISOString() || null,
          ...currentConfig,
        },
      };

      res.writeHead(METRICS.isHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health, null, 2));
    } else if (req.url === '/ready') {
      // Readiness check - are we connected to database?
      res.writeHead(METRICS.isHealthy ? 200 : 503);
      res.end(METRICS.isHealthy ? 'ready' : 'not ready');
    } else if (req.url === '/metrics') {
      // Prometheus-style metrics
      const lines = [
        `# HELP worker_uptime_seconds Worker uptime in seconds`,
        `# TYPE worker_uptime_seconds gauge`,
        `worker_uptime_seconds ${(Date.now() - METRICS.startedAt.getTime()) / 1000}`,
        `# HELP worker_emails_sent_total Total emails sent`,
        `# TYPE worker_emails_sent_total counter`,
        `worker_emails_sent_total ${METRICS.emailsSent}`,
        `# HELP worker_emails_failed_total Total emails failed`,
        `# TYPE worker_emails_failed_total counter`,
        `worker_emails_failed_total ${METRICS.emailsFailed}`,
        `# HELP worker_loops_total Total loop iterations`,
        `# TYPE worker_loops_total counter`,
        `worker_loops_total ${METRICS.loopCount}`,
        `# HELP worker_last_batch_size Items in last batch`,
        `# TYPE worker_last_batch_size gauge`,
        `worker_last_batch_size ${METRICS.lastBatchSize}`,
        `# HELP worker_last_batch_duration_ms Last batch processing time`,
        `# TYPE worker_last_batch_duration_ms gauge`,
        `worker_last_batch_duration_ms ${METRICS.lastBatchTime}`,
        `# HELP worker_config_enabled Whether worker is enabled`,
        `# TYPE worker_config_enabled gauge`,
        `worker_config_enabled ${currentConfig.enabled ? 1 : 0}`,
        `# HELP worker_config_paused Whether worker is paused`,
        `# TYPE worker_config_paused gauge`,
        `worker_config_paused ${currentConfig.paused ? 1 : 0}`,
      ];
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(lines.join('\n'));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(STATIC_CONFIG.HEALTH_PORT, () => {
    log('info', `Health server listening`, { port: STATIC_CONFIG.HEALTH_PORT });
  });
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// ═══════════════════════════════════════════════════════════════════════════
// STALE WORKER CLEANUP (runs on startup to remove dead container records)
// ═══════════════════════════════════════════════════════════════════════════

async function cleanupStaleWorkerRecords(): Promise<void> {
  try {
    const cutoffHours = 24;
    const cutoff = new Date(Date.now() - cutoffHours * 60 * 60 * 1000).toISOString();
    
    // First count how many we'll delete
    const { data: staleWorkers, error: selectError } = await supabase
      .from('worker_heartbeats')
      .select('id')
      .lt('last_heartbeat', cutoff);
    
    if (selectError) {
      log('warn', 'Failed to query stale workers', { error: selectError.message });
      return;
    }
    
    if (!staleWorkers || staleWorkers.length === 0) {
      log('info', 'No stale worker records to cleanup');
      return;
    }
    
    // Delete stale records (offline > 24 hours)
    const { error: deleteError } = await supabase
      .from('worker_heartbeats')
      .delete()
      .lt('last_heartbeat', cutoff);
    
    if (deleteError) {
      log('warn', 'Failed to cleanup stale workers', { error: deleteError.message });
      return;
    }
    
    log('info', 'Cleaned up stale worker records on startup', { 
      count: staleWorkers.length,
      cutoff_hours: cutoffHours 
    });
  } catch (error) {
    log('warn', 'Exception during stale worker cleanup', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN WORKER LOOP
// ═══════════════════════════════════════════════════════════════════════════

async function workerLoop(): Promise<void> {
  // Cleanup stale worker records on startup (offline > 24 hours)
  await cleanupStaleWorkerRecords();
  
  // Initial config load
  const initialResult = await refreshConfig();
  if (initialResult.shouldRestart) {
    log('info', 'Restart requested on startup, exiting for Docker restart...');
    process.exit(0);
  }
  
  log('info', 'Starting email queue worker (Resend)', {
    batch_size: currentConfig.batch_size,
    interval_ms: currentConfig.loop_interval_ms,
    concurrent: currentConfig.concurrent_limit,
    config_source: METRICS.configSource,
  });

  // Log heartbeat every minute and report to database
  const heartbeatInterval = setInterval(async () => {
    METRICS.lastHeartbeat = new Date();
    log('info', 'Heartbeat', {
      loops: METRICS.loopCount,
      sent: METRICS.emailsSent,
      failed: METRICS.emailsFailed,
      enabled: currentConfig.enabled,
      paused: currentConfig.paused,
    });
    
    // Report heartbeat to database
    await reportHeartbeat();
  }, 60000);
  
  // Initial heartbeat
  await reportHeartbeat();

  while (!isShuttingDown) {
    try {
      // Refresh config periodically
      if (Date.now() - lastConfigRefresh >= STATIC_CONFIG.CONFIG_REFRESH_INTERVAL_MS) {
        const result = await refreshConfig();
        lastConfigRefresh = Date.now();
        
        // Check for restart signal
        if (result.shouldRestart) {
          log('info', 'Restart signal received, gracefully shutting down...');
          isShuttingDown = true;
          clearInterval(heartbeatInterval);
          log('info', 'Worker exiting for restart. Docker will restart the container.');
          process.exit(0);
        }
      }

      // Check if disabled
      if (!currentConfig.enabled) {
        log('debug', 'Worker disabled, sleeping...');
        await sleep(currentConfig.loop_interval_ms);
        continue;
      }

      // Check if paused
      if (currentConfig.paused) {
        log('debug', 'Worker paused, sleeping...');
        await sleep(currentConfig.loop_interval_ms);
        continue;
      }

      // Check if in rate limit backoff
      if (METRICS.rateLimitBackoffUntil > Date.now()) {
        const remaining = Math.ceil((METRICS.rateLimitBackoffUntil - Date.now()) / 1000);
        log('debug', `Rate limit backoff active`, { remaining_seconds: remaining });
        await sleep(1000);
        continue;
      }

      METRICS.loopCount++;
      METRICS.isHealthy = true;

      // Reset stale items and check for stuck emails periodically
      if (Date.now() - lastStaleReset >= STATIC_CONFIG.STALE_RESET_INTERVAL_MS) {
        const resetCount = await resetStaleItems();
        if (resetCount > 0) {
          log('warn', `Reset stale items`, { count: resetCount });
          METRICS.staleResetCount += resetCount;
        }
        
        // Check for and handle stuck emails (infinite loop prevention)
        const stuckInfo = await getStuckEmailCount(10);
        if (stuckInfo.count > 0) {
          log('error', `⚠️ STUCK EMAILS DETECTED`, { 
            count: stuckInfo.count, 
            maxAttempts: stuckInfo.maxAttempts,
            action: 'Will mark as failed if attempts >= 50'
          });
        }
        
        // Mark emails with 50+ attempts as permanently failed
        const failedCount = await markStuckEmailsAsFailed(50);
        if (failedCount > 0) {
          log('error', `🛑 Marked stuck emails as FAILED`, { count: failedCount });
        }
        
        lastStaleReset = Date.now();
      }

      // Claim a batch of OUTBOUND items atomically
      const batch = await claimBatch(currentConfig.batch_size);

      // Claim STUB items (from enqueue-only webhook) for Gmail API fetch
      const stubBatch = await claimStubBatch(5);

      // Also claim INBOUND emails for parsing (load emails)
      const inboundBatch = await claimInboundBatch(50);

      if (batch.length === 0 && inboundBatch.length === 0 && stubBatch.length === 0) {
        await sleep(currentConfig.loop_interval_ms);
        continue;
      }

      // Process STUB items first (highest priority - triggers Gmail API fetch)
      if (stubBatch.length > 0) {
        log('info', `Processing ${stubBatch.length} stub items (Gmail fetch)`);
        const stubStart = Date.now();
        
        for (const stub of stubBatch) {
          try {
            const result = await processStubItem(stub);
            if (result.success) {
              log('debug', `Stub processed`, { 
                historyId: stub.gmail_history_id,
                messagesQueued: result.messagesQueued,
              });
            } else {
              log('warn', `Stub failed`, { historyId: stub.gmail_history_id, error: result.error });
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log('error', `Stub exception`, { historyId: stub.gmail_history_id, error: errorMessage });
          }
        }
        
        log('info', `Stub batch complete`, { 
          size: stubBatch.length, 
          duration_ms: Date.now() - stubStart 
        });
      }

      // Process INBOUND emails (higher priority - time sensitive)
      if (inboundBatch.length > 0) {
        log('info', `Processing ${inboundBatch.length} inbound load emails`);
        const inboundStart = Date.now();
        
        for (const item of inboundBatch) {
          try {
            const result = await processInboundEmail(item);
            if (result.success) {
              log('debug', `Inbound processed`, { 
                id: item.id.substring(0, 8), 
                loadId: result.loadId,
                isDuplicate: result.isDuplicate 
              });
            } else {
              log('warn', `Inbound failed`, { id: item.id.substring(0, 8), error: result.error });
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log('error', `Inbound exception`, { id: item.id.substring(0, 8), error: errorMessage });
          }
        }
        
        log('info', `Inbound batch complete`, { 
          size: inboundBatch.length, 
          duration_ms: Date.now() - inboundStart 
        });
      }

      // Process OUTBOUND emails
      if (batch.length === 0) {
        continue;
      }

      log('debug', `Claimed outbound batch`, { size: batch.length });
      const startTime = Date.now();
      METRICS.lastBatchSize = batch.length;

      // Process items with controlled concurrency
      for (let i = 0; i < batch.length; i += currentConfig.concurrent_limit) {
        // Check for pause/disable mid-batch
        if (!currentConfig.enabled || currentConfig.paused || isShuttingDown) {
          log('info', 'Stopping mid-batch due to config change');
          break;
        }

        const chunk = batch.slice(i, i + currentConfig.concurrent_limit);

        await Promise.all(
          chunk.map(async (item) => {
            // Add per-request delay if configured
            if (currentConfig.per_request_delay_ms > 0) {
              await sleep(currentConfig.per_request_delay_ms);
            }

            const itemStart = Date.now();
            try {
              const result = await processQueueItem(item);

              if (result.success) {
                // Check if this was a misrouted inbound email
                if (result.error === 'inbound_email_misrouted' || result.error === 'inbound_email_skipped') {
                  // Reset to pending so the inbound processor can pick it up
                  log('warn', `Misrouted inbound email, resetting to pending`, { id: item.id.substring(0, 8) });
                  await supabase.from('email_queue').update({ 
                    status: 'pending', 
                    processing_started_at: null 
                  }).eq('id', item.id);
                } else {
                  await completeItem(item.id, 'sent');
                  METRICS.emailsSent++;
                  log('info', `Email sent`, {
                    id: item.id.substring(0, 8),
                    to: item.to_email,
                    email_sent: true,
                    message_id: result.messageId,
                    duration_ms: Date.now() - itemStart,
                  });
                }
              } else {
                // Check for rate limit error
                if (result.error?.includes('429') || result.error?.includes('rate limit')) {
                  if (currentConfig.backoff_on_429) {
                    METRICS.rateLimitBackoffUntil = Date.now() + currentConfig.backoff_duration_ms;
                    log('warn', 'Rate limit hit, entering backoff', { 
                      duration_ms: currentConfig.backoff_duration_ms,
                      until: new Date(METRICS.rateLimitBackoffUntil).toISOString(),
                    });
                  }
                }

                const newAttempts = item.attempts + 1;
                await failItem(item.id, result.error || 'Unknown error', newAttempts);
                METRICS.emailsFailed++;

                if (newAttempts >= currentConfig.max_retries) {
                  log('error', `Email permanently failed`, {
                    id: item.id,
                    to: item.to_email,
                    email_sent: false,
                    error: result.error,
                    attempts: newAttempts,
                  });
                } else {
                  log('warn', `Email failed, will retry`, {
                    id: item.id,
                    to: item.to_email,
                    email_sent: false,
                    error: result.error,
                    attempts: newAttempts,
                  });
                }
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              
              // Check for rate limit in exception
              if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
                if (currentConfig.backoff_on_429) {
                  METRICS.rateLimitBackoffUntil = Date.now() + currentConfig.backoff_duration_ms;
                  log('warn', 'Rate limit exception, entering backoff', { 
                    duration_ms: currentConfig.backoff_duration_ms 
                  });
                }
              }

              const newAttempts = item.attempts + 1;
              await failItem(item.id, errorMessage, newAttempts);
              METRICS.emailsFailed++;
              log('error', `Exception sending email`, {
                id: item.id,
                to: item.to_email,
                email_sent: false,
                error: errorMessage,
                attempts: newAttempts,
              });
            }
          })
        );
      }

      METRICS.lastBatchTime = Date.now() - startTime;
      log('info', `Batch complete`, {
        size: batch.length,
        duration_ms: METRICS.lastBatchTime,
        avg_ms: Math.round(METRICS.lastBatchTime / batch.length),
      });

      // Small delay between batches to prevent CPU hogging
      await sleep(500);
    } catch (error) {
      METRICS.isHealthy = false;
      // Log full error details instead of [object Object]
      const errorDetails = error instanceof Error 
        ? { message: error.message, name: error.name, stack: error.stack }
        : typeof error === 'object' && error !== null
          ? JSON.parse(JSON.stringify(error))
          : { raw: String(error) };
      log('error', 'Loop error', errorDetails);
      await sleep(5000); // Wait longer on errors
    }
  }

  clearInterval(heartbeatInterval);
  log('info', 'Worker shutdown complete', {
    total_sent: METRICS.emailsSent,
    total_failed: METRICS.emailsFailed,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════════════════

function setupShutdownHandlers(): void {
  const shutdown = (signal: string) => {
    log('info', `Received shutdown signal`, { signal });
    isShuttingDown = true;

    // Force exit after 30 seconds
    setTimeout(() => {
      log('warn', 'Force exiting after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (error) => {
    log('error', 'Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    log('error', 'Unhandled rejection', { reason: String(reason) });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════════════════

// Validate required environment variables
function validateEnv(): void {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Optional but recommended
  if (!process.env.RESEND_FROM_EMAIL) {
    console.warn('RESEND_FROM_EMAIL not set, will use default sender');
  }
}

validateEnv();
setupShutdownHandlers();
startHealthServer();

workerLoop()
  .then(() => {
    log('info', 'Worker stopped gracefully');
    process.exit(0);
  })
  .catch((error) => {
    log('error', 'Fatal error', { error: String(error) });
    process.exit(1);
  });
