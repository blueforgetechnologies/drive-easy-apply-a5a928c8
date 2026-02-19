/**
 * Email Queue Worker - v2 force sync
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
import { claimBatch, claimInboundBatch, claimHistoryBatch, completeItem, failItem, markStuckEmailsAsFailed, getStuckEmailCount } from './claim.js';
import { processQueueItem } from './process.js';
import { processInboundEmail, verifyStorageAccess } from './inbound.js';
import { processHistoryItem } from './historyQueue.js';
import { claimStubsBatch, processStub } from './stubsProcessor.js';
import { supabase, verifySelfCheck } from './supabase.js';
import { resetStuckProcessingRows } from './maintenance.js';
import { 
  startEventLoopMonitor, 
  stopEventLoopMonitor, 
  logMetricsReport, 
  recordInboundParseTime, 
  recordMatchingTime, 
  recordOutboundSendTime,
  recordQueueDrain 
} from './metrics.js';

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

// ═══════════════════════════════════════════════════════════════════════════
// WATCHDOG CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const WATCHDOG_CONFIG = {
  // How long without progress before triggering watchdog (ms)
  STALL_THRESHOLD_MS: parseInt(process.env.WATCHDOG_STALL_THRESHOLD_MS || '300000', 10), // 5 minutes
  // Minimum pending count to trigger watchdog exit
  MIN_PENDING_FOR_WATCHDOG: parseInt(process.env.WATCHDOG_MIN_PENDING || '200', 10),
  // How often to check watchdog conditions (ms)
  CHECK_INTERVAL_MS: 60000, // 1 minute
  // Whether watchdog is enabled (default ON in production)
  ENABLED: process.env.WATCHDOG_ENABLED !== 'false',
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
  // Circuit breaker stall detector: tracks when we last successfully processed something
  lastProcessedAt: Date | null;
  // Watchdog tracking
  lastClaimAt: Date | null;
  lastProgressAt: Date | null;
  // Gmail stubs tracking for drain_tick
  stubsProcessedThisLoop: number;
  stubsPendingCount: number;
  stubsProcessingCount: number;
  // Hardening: degradation tracking
  consecutiveGmail401s: number;
  stubsSuccessWindow: number;
  stubsFailWindow: number;
  lastDegradationReport: Date;
  deadLetterCount: number;
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
  lastProcessedAt: null,
  lastClaimAt: null,
  lastProgressAt: null,
  stubsProcessedThisLoop: 0,
  stubsPendingCount: 0,
  stubsProcessingCount: 0,
  consecutiveGmail401s: 0,
  stubsSuccessWindow: 0,
  stubsFailWindow: 0,
  lastDegradationReport: new Date(),
  deadLetterCount: 0,
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
      // Circuit breaker stall detector: Report when we last processed something
      p_last_processed_at: METRICS.lastProcessedAt?.toISOString() || null,
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
// WATCHDOG: Detect stalled gmail_stubs processing and trigger Docker restart
// ═══════════════════════════════════════════════════════════════════════════

interface GmailStubsHealth {
  pending_count: number;
  processing_count: number;
  failed_count: number;
  completed_count: number;
  oldest_pending_at: string | null;
  oldest_pending_age_minutes: number | null;
  oldest_processing_at: string | null;
  oldest_processing_age_minutes: number | null;
  last_completed_at: string | null;
  time_since_completion_minutes: number | null;
}

/**
 * Fetch gmail_stubs queue health from database for watchdog and drain_tick logging.
 */
async function fetchGmailStubsHealth(): Promise<GmailStubsHealth | null> {
  try {
    const { data, error } = await supabase.rpc('get_gmail_stubs_health');
    if (error) {
      log('warn', 'Failed to fetch gmail_stubs health', { error: error.message });
      return null;
    }
    return data as GmailStubsHealth;
  } catch (e) {
    log('warn', 'Exception fetching gmail_stubs health', { error: String(e) });
    return null;
  }
}

/**
 * Watchdog check: If pending is high and no progress in STALL_THRESHOLD_MS, exit for Docker restart.
 * This ensures the worker cannot silently stall indefinitely.
 */
async function checkWatchdog(): Promise<void> {
  if (!WATCHDOG_CONFIG.ENABLED) return;

  const health = await fetchGmailStubsHealth();
  if (!health) return;

  // Update metrics for visibility
  METRICS.stubsPendingCount = health.pending_count;
  METRICS.stubsProcessingCount = health.processing_count;

  const now = Date.now();
  const lastProgress = METRICS.lastProgressAt?.getTime() || METRICS.startedAt.getTime();
  const msSinceProgress = now - lastProgress;

  // Watchdog trigger conditions:
  // 1. Pending count is above threshold
  // 2. No progress in STALL_THRESHOLD_MS
  if (health.pending_count >= WATCHDOG_CONFIG.MIN_PENDING_FOR_WATCHDOG && 
      msSinceProgress >= WATCHDOG_CONFIG.STALL_THRESHOLD_MS) {
    
    log('error', '🚨 STUCK_WATCHDOG: Worker stalled, triggering Docker restart', {
      pending_count: health.pending_count,
      processing_count: health.processing_count,
      ms_since_progress: msSinceProgress,
      stall_threshold_ms: WATCHDOG_CONFIG.STALL_THRESHOLD_MS,
      min_pending_threshold: WATCHDOG_CONFIG.MIN_PENDING_FOR_WATCHDOG,
      last_progress_at: METRICS.lastProgressAt?.toISOString() || 'never',
      oldest_pending_age_minutes: health.oldest_pending_age_minutes,
      oldest_processing_age_minutes: health.oldest_processing_age_minutes,
      last_completed_at: health.last_completed_at,
    });

    // Exit with code 1 so Docker restart:always will restart us
    process.exit(1);
  }
}

/**
 * Log drain_tick: High-signal periodic log showing queue health.
 * Called every loop when stubs are enabled.
 */
function logDrainTick(health: GmailStubsHealth | null, claimedCount: number, backoffMs: number): void {
  const lastProgress = METRICS.lastProgressAt?.toISOString() || 'never';
  
  log('info', 'DRAIN_TICK', {
    claimed_count: claimedCount,
    pending_count: health?.pending_count ?? 'unknown',
    processing_count: health?.processing_count ?? 'unknown',
    failed_count: health?.failed_count ?? 0,
    backoff_ms: backoffMs,
    last_progress_at: lastProgress,
    oldest_pending_age_min: health?.oldest_pending_age_minutes?.toFixed(1) ?? 'unknown',
    oldest_processing_age_min: health?.oldest_processing_age_minutes?.toFixed(1) ?? 'unknown',
    loop: METRICS.loopCount,
    uptime_min: Math.floor((Date.now() - METRICS.startedAt.getTime()) / 60000),
  });
}

/**
 * Log drain_progress: Called whenever a stub completes successfully.
 */
function logDrainProgress(stubId: string, elapsedMs: number, remainingPending: number): void {
  log('info', 'DRAIN_PROGRESS', {
    stub_id: stubId.substring(0, 8),
    elapsed_ms: elapsedMs,
    remaining_pending: remainingPending,
    last_progress_at: new Date().toISOString(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// STARTUP CLEANUP: Skip stale gmail_stubs to prevent circuit breaker trips
// ═══════════════════════════════════════════════════════════════════════════

async function skipStaleGmailStubs(ageMinutes: number = 30): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - ageMinutes * 60 * 1000).toISOString();
    
    // Count first
    const { count, error: countErr } = await supabase
      .from('gmail_stubs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('created_at', cutoff);
    
    if (countErr) {
      log('warn', '[STARTUP] Failed to count stale gmail_stubs', { error: countErr.message });
      return;
    }
    
    if (!count || count === 0) {
      log('info', '[STARTUP] No stale gmail_stubs to skip');
      return;
    }
    
    log('warn', `[STARTUP] Found ${count} stale gmail_stubs older than ${ageMinutes}min — skipping`, { cutoff });
    
    // Update in batches of 500 to avoid timeouts
    const BATCH = 500;
    let totalSkipped = 0;
    
    while (totalSkipped < count) {
      const { data, error: updErr } = await supabase
        .from('gmail_stubs')
        .update({
          status: 'skipped',
          processed_at: new Date().toISOString(),
          error: `skipped_by_startup: older_than_${ageMinutes}_min`,
        })
        .eq('status', 'pending')
        .lt('created_at', cutoff)
        .limit(BATCH)
        .select('id');
      
      if (updErr) {
        log('error', '[STARTUP] Error skipping stale stubs batch', { error: updErr.message });
        break;
      }
      
      const batchCount = data?.length || 0;
      totalSkipped += batchCount;
      
      if (batchCount === 0) break; // No more to skip
      
      log('info', `[STARTUP] Skipped ${totalSkipped}/${count} stale stubs`);
    }
    
    log('info', `[STARTUP] Stale stubs cleanup complete`, { total_skipped: totalSkipped });
  } catch (err) {
    log('error', '[STARTUP] Exception during stale stubs cleanup', { 
      error: err instanceof Error ? err.message : String(err) 
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEAD LETTER QUEUE: Move poison stubs that fail repeatedly
// ═══════════════════════════════════════════════════════════════════════════

const DEAD_LETTER_MAX_ATTEMPTS = parseInt(process.env.DEAD_LETTER_MAX_ATTEMPTS || '5', 10);

async function moveDeadLetterStubs(maxAttempts: number = DEAD_LETTER_MAX_ATTEMPTS): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('gmail_stubs')
      .update({
        status: 'dead_letter',
        processed_at: new Date().toISOString(),
        error: `dead_letter: exceeded ${maxAttempts} attempts`,
      })
      .eq('status', 'pending')
      .gte('attempts', maxAttempts)
      .select('id');

    if (error) {
      log('warn', '[DEAD_LETTER] Error moving poison stubs', { error: error.message });
      return;
    }

    const count = data?.length || 0;
    if (count > 0) {
      METRICS.deadLetterCount += count;
      log('warn', `[DEAD_LETTER] Moved ${count} poison stubs to dead_letter`, {
        max_attempts: maxAttempts,
        total_dead_letter: METRICS.deadLetterCount,
      });
    }
  } catch (err) {
    log('error', '[DEAD_LETTER] Exception', { error: err instanceof Error ? err.message : String(err) });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GMAIL 401 AUTO-RECOVERY: Force token reload after consecutive failures
// ═══════════════════════════════════════════════════════════════════════════

const GMAIL_401_THRESHOLD = parseInt(process.env.GMAIL_401_THRESHOLD || '3', 10);

function trackGmail401(errorMessage: string): void {
  const is401 = errorMessage.includes('401') || 
                errorMessage.includes('invalid_grant') || 
                errorMessage.includes('Token has been expired') ||
                errorMessage.includes('access_token_unavailable');
  
  if (is401) {
    METRICS.consecutiveGmail401s++;
    log('warn', `[GMAIL_401] Consecutive auth failure #${METRICS.consecutiveGmail401s}`, {
      threshold: GMAIL_401_THRESHOLD,
    });
    
    if (METRICS.consecutiveGmail401s >= GMAIL_401_THRESHOLD) {
      log('error', `🔑 [GMAIL_401] Hit ${GMAIL_401_THRESHOLD} consecutive 401s — pausing stubs for 60s`, {
        action: 'Gmail tokens likely revoked or expired in DB. Pausing stub processing.',
      });
      // Apply a 60s backoff to stop hammering Gmail with bad tokens
      METRICS.rateLimitBackoffUntil = Date.now() + 60_000;
      METRICS.consecutiveGmail401s = 0;
    }
  } else {
    // Any non-401 error resets the counter
    METRICS.consecutiveGmail401s = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEGRADATION SUMMARY LOGGING: Periodic health snapshot every 5 minutes
// ═══════════════════════════════════════════════════════════════════════════

const DEGRADATION_REPORT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function maybeDegradationReport(): void {
  const now = Date.now();
  if (now - METRICS.lastDegradationReport.getTime() < DEGRADATION_REPORT_INTERVAL_MS) return;
  
  const total = METRICS.stubsSuccessWindow + METRICS.stubsFailWindow;
  const successRate = total > 0 ? ((METRICS.stubsSuccessWindow / total) * 100).toFixed(1) : 'N/A';
  const failRate = total > 0 ? ((METRICS.stubsFailWindow / total) * 100).toFixed(1) : 'N/A';
  
  const level = (total > 0 && METRICS.stubsFailWindow / total > 0.5) ? 'error' : 'info';
  
  log(level, '📊 DEGRADATION_REPORT', {
    window_minutes: 5,
    stubs_success: METRICS.stubsSuccessWindow,
    stubs_failed: METRICS.stubsFailWindow,
    success_rate_pct: successRate,
    fail_rate_pct: failRate,
    dead_letter_total: METRICS.deadLetterCount,
    consecutive_401s: METRICS.consecutiveGmail401s,
    loops: METRICS.loopCount,
    uptime_min: Math.floor((now - METRICS.startedAt.getTime()) / 60000),
  });
  
  // Reset window counters
  METRICS.stubsSuccessWindow = 0;
  METRICS.stubsFailWindow = 0;
  METRICS.lastDegradationReport = new Date();
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
  
  // BACKLOG CUTOFF GUARDRAIL - Real-time only mode
  log('info', '[STARTUP] Backlog cutoff active — processing only emails newer than 30 minutes');
  
  // STARTUP CLEANUP: Skip stale gmail_stubs older than 30 minutes to prevent
  // circuit breaker trips from accumulated backlog during downtime.
  await skipStaleGmailStubs(30);
  
  log('info', 'Starting email queue worker (Resend)', {
    batch_size: currentConfig.batch_size,
    interval_ms: currentConfig.loop_interval_ms,
    concurrent: currentConfig.concurrent_limit,
    config_source: METRICS.configSource,
    watchdog_enabled: WATCHDOG_CONFIG.ENABLED,
    watchdog_stall_threshold_ms: WATCHDOG_CONFIG.STALL_THRESHOLD_MS,
    watchdog_min_pending: WATCHDOG_CONFIG.MIN_PENDING_FOR_WATCHDOG,
    backlog_cutoff_minutes: 30,
  });

  // One-time storage verification on startup
  await verifyStorageAccess();

  // CRITICAL: reset any rows left in `processing` by a previous crash/hang.
  // This runs immediately on startup (not waiting for the periodic interval).
  const startupResetCount = await resetStuckProcessingRows(5);
  if (startupResetCount > 0) {
    log('warn', 'Reset stuck processing email_queue rows on startup', { count: startupResetCount });
    METRICS.staleResetCount += startupResetCount;
  }

  // Start event loop monitoring for metrics
  startEventLoopMonitor();
  
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
  
  // Log detailed metrics every 60 seconds
  const metricsInterval = setInterval(() => {
    logMetricsReport();
  }, 60000);
  
  // Watchdog interval: Check for stalls even if loop is stuck (runs async)
  const watchdogInterval = setInterval(async () => {
    try {
      await checkWatchdog();
    } catch (e) {
      log('error', 'Watchdog interval error', { error: String(e) });
    }
  }, WATCHDOG_CONFIG.CHECK_INTERVAL_MS);
  
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

      // Log start of loop iteration for observability (loop counter at END of iteration)
      const loopStartTime = Date.now();
      log('debug', 'Loop iteration starting', { 
        currentLoopNumber: METRICS.loopCount + 1,
        configEnabled: currentConfig.enabled,
        configPaused: currentConfig.paused,
      });

      METRICS.isHealthy = true;
      METRICS.stubsProcessedThisLoop = 0; // Reset per-loop counter

      // Reset stale items and check for stuck emails periodically
      if (Date.now() - lastStaleReset >= STATIC_CONFIG.STALE_RESET_INTERVAL_MS) {
        const resetCount = await resetStuckProcessingRows(5);
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

      // ═══════════════════════════════════════════════════════════════════════
      // GMAIL STUBS: Phase 2 stub-only mode consumer (gated by ENABLE_GMAIL_STUBS)
      // This is the primary path when webhook is in stub-only mode
      // ═══════════════════════════════════════════════════════════════════════
      const GMAIL_STUBS_ENABLED = process.env.ENABLE_GMAIL_STUBS === 'true';
      const STUBS_CAP_PER_LOOP = 25;
      
      // Track when we last claimed
      METRICS.lastClaimAt = new Date();
      
      const stubsBatch = GMAIL_STUBS_ENABLED ? await claimStubsBatch(STUBS_CAP_PER_LOOP) : [];

      // Also claim INBOUND emails for parsing (load emails) - LEGACY PATH
      // When ENABLE_GMAIL_STUBS=true, inbound queue should be empty (webhook writes stubs instead)
      const inboundBatch = await claimInboundBatch(50);

      // DISABLED: History queue processing temporarily disabled to unblock worker loop
      // Re-enable by setting ENABLE_HISTORY_QUEUE=true
      const HISTORY_QUEUE_ENABLED = process.env.ENABLE_HISTORY_QUEUE === 'true';
      const HISTORY_CAP_PER_LOOP = 5;
      const historyBatch = HISTORY_QUEUE_ENABLED ? await claimHistoryBatch(HISTORY_CAP_PER_LOOP) : [];

      // ═══════════════════════════════════════════════════════════════════════
      // DRAIN_TICK: High-signal log showing queue health every loop
      // ═══════════════════════════════════════════════════════════════════════
      const stubsHealth = GMAIL_STUBS_ENABLED ? await fetchGmailStubsHealth() : null;
      const backoffMs = Math.max(0, METRICS.rateLimitBackoffUntil - Date.now());
      
      // Log DRAIN_TICK every loop when stubs are enabled
      if (GMAIL_STUBS_ENABLED) {
        logDrainTick(stubsHealth, stubsBatch.length, backoffMs);
      }

      // Log claim results ALWAYS for debugging stalls
      log('debug', 'Claim results', {
        outbound: batch.length,
        stubs: stubsBatch.length,
        inbound: inboundBatch.length,
        history: historyBatch.length,
        totalClaimed: batch.length + stubsBatch.length + inboundBatch.length + historyBatch.length,
      });

      // ═══════════════════════════════════════════════════════════════════════
      // WATCHDOG CHECK: Detect stalled processing and trigger Docker restart
      // ═══════════════════════════════════════════════════════════════════════
      await checkWatchdog();

      if (batch.length === 0 && stubsBatch.length === 0 && inboundBatch.length === 0 && historyBatch.length === 0) {
        // Increment loop counter BEFORE sleeping on empty batch
        METRICS.loopCount++;
        log('debug', 'No work claimed, sleeping', { 
          loopNumber: METRICS.loopCount,
          loopDuration_ms: Date.now() - loopStartTime,
        });
        await sleep(currentConfig.loop_interval_ms);
        continue;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // DEAD LETTER: Move poison stubs (5+ attempts) to dead_letter before processing
      // ═══════════════════════════════════════════════════════════════════════
      if (GMAIL_STUBS_ENABLED) {
        await moveDeadLetterStubs(5);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // GMAIL STUBS FIRST: Process stubs before legacy inbound (Phase 2 priority)
      // Each stub triggers Gmail API fetch + parsing + matching
      // ═══════════════════════════════════════════════════════════════════════
      if (stubsBatch.length > 0) {
        log('info', `Processing ${stubsBatch.length} gmail stubs (PHASE 2 PRIORITY)`);
        const stubsStart = Date.now();
        let stubsSuccess = 0;
        let stubsFailed = 0;
        let messagesProcessed = 0;
        let loadsCreated = 0;
        
        // Track remaining for drain_progress
        let remainingPending = stubsHealth?.pending_count ?? 0;

        for (const stub of stubsBatch) {
          const stubStart = Date.now();
          try {
            const result = await processStub(stub);
            const stubElapsed = Date.now() - stubStart;
            
            if (result.success) {
              stubsSuccess++;
              METRICS.stubsSuccessWindow++;
              messagesProcessed += result.messagesProcessed;
              loadsCreated += result.loadsCreated;
              remainingPending = Math.max(0, remainingPending - 1);
              
              // Update progress tracking for watchdog
              METRICS.lastProcessedAt = new Date();
              METRICS.lastProgressAt = new Date();
              METRICS.stubsProcessedThisLoop++;
              
              // Reset 401 counter on success
              METRICS.consecutiveGmail401s = 0;
              
              // Log DRAIN_PROGRESS for each completed stub
              logDrainProgress(stub.id, stubElapsed, remainingPending);
            } else {
              stubsFailed++;
              METRICS.stubsFailWindow++;

              // Track Gmail 401 errors for auto-recovery
              if (result.error) trackGmail401(result.error);

              // Watchdog progress: failures still count as "progress" because the stub is finalized
              // (moved out of processing), preventing silent stalls.
              METRICS.lastProcessedAt = new Date();
              METRICS.lastProgressAt = new Date();

              log('warn', `Stub failed`, { 
                id: stub.id.substring(0, 8), 
                error: result.error,
                elapsed_ms: stubElapsed,
              });
            }
          } catch (error) {
            stubsFailed++;
            METRICS.stubsFailWindow++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Track Gmail 401 errors for auto-recovery
            trackGmail401(errorMessage);
            
            // FIX #4: Watchdog progress - exceptions still count as "progress" because
            // processStub already called failStub internally (stub is finalized)
            METRICS.lastProcessedAt = new Date();
            METRICS.lastProgressAt = new Date();
            
            log('error', `Stub exception`, { 
              id: stub.id.substring(0, 8), 
              error: errorMessage,
              elapsed_ms: Date.now() - stubStart,
            });
          }
        }

        log('info', `Stubs batch complete`, {
          size: stubsBatch.length,
          success: stubsSuccess,
          failed: stubsFailed,
          messagesProcessed,
          loadsCreated,
          duration_ms: Date.now() - stubsStart,
          remaining_pending: remainingPending,
        });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // INBOUND FIRST: Process inbound before history to prevent starvation
      // Includes dedupe: if multiple rows share the same gmail_message_id,
      // process one and mark the rest as completed (duplicates)
      // ═══════════════════════════════════════════════════════════════════════
      if (inboundBatch.length > 0) {
        log('info', `Processing ${inboundBatch.length} inbound load emails (PRIORITY)`);
        const inboundStart = Date.now();
        
        // Dedupe: Group by gmail_message_id, process first, mark rest as duplicates
        const byMessageId = new Map<string, typeof inboundBatch>();
        for (const item of inboundBatch) {
          const key = item.gmail_message_id;
          if (!byMessageId.has(key)) {
            byMessageId.set(key, []);
          }
          byMessageId.get(key)!.push(item);
        }
        
        let processedCount = 0;
        let dedupedCount = 0;
        
        for (const [messageId, items] of byMessageId.entries()) {
          // Process the first item
          const primary = items[0];
          const itemStartTime = Date.now();
          try {
            const result = await processInboundEmail(primary);
            const parseDuration = Date.now() - itemStartTime;
            processedCount++;
            // Update last_processed_at for circuit breaker stall detection
            METRICS.lastProcessedAt = new Date();
            METRICS.lastProgressAt = new Date(); // Watchdog progress tracking
            // Record metrics
            recordInboundParseTime(parseDuration);
            recordQueueDrain(1);
            if (result.success) {
              log('debug', `Inbound processed`, { 
                id: primary.id.substring(0, 8), 
                loadId: result.loadId,
                isDuplicate: result.isDuplicate,
                duration_ms: parseDuration 
              });
            } else {
              log('warn', `Inbound failed`, { id: primary.id.substring(0, 8), error: result.error, duration_ms: parseDuration });
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log('error', `Inbound exception`, { id: primary.id.substring(0, 8), error: errorMessage });

            // Fail-closed: never leave the queue row in `processing` when we catch an exception here.
            // (processInboundEmail should also do its own try/catch, but this is a belt-and-suspenders guard.)
            try {
              await supabase
                .from('email_queue')
                .update({
                  status: 'pending',
                  processing_started_at: null,
                  last_error: `inbound_exception: ${errorMessage.substring(0, 900)}`,
                })
                .eq('id', primary.id);
            } catch (updateErr) {
              log('warn', 'Failed to reset queue row after inbound exception', {
                id: primary.id.substring(0, 8),
                error: updateErr instanceof Error ? updateErr.message : String(updateErr),
              });
            }
          }
          
          // Mark remaining items with same gmail_message_id as completed (dedupe)
          if (items.length > 1) {
            const duplicateIds = items.slice(1).map(i => i.id);
            try {
              await supabase
                .from('email_queue')
                .update({ 
                  status: 'completed', 
                  processed_at: new Date().toISOString(),
                  parsed_at: new Date().toISOString(),
                  processing_started_at: null,
                  last_error: `Deduped: same gmail_message_id as ${primary.id.substring(0, 8)}`
                })
                .in('id', duplicateIds);
              dedupedCount += duplicateIds.length;
              log('info', `Deduped ${duplicateIds.length} queue items with same gmail_message_id`, {
                messageId: messageId.substring(0, 12),
                primaryId: primary.id.substring(0, 8),
              });
            } catch (e) {
              log('warn', `Failed to mark duplicates as completed`, { 
                messageId: messageId.substring(0, 12), 
                error: e instanceof Error ? e.message : String(e) 
              });

              // Fail-closed: if we can't mark them completed, at least reset them
              // so they don't remain stuck in `processing` forever.
              try {
                await supabase
                  .from('email_queue')
                  .update({
                    status: 'pending',
                    processing_started_at: null,
                    last_error: 'dedupe_mark_failed_reset',
                  })
                  .in('id', duplicateIds);
              } catch (resetErr) {
                log('warn', 'Failed to reset duplicates after dedupe mark failure', {
                  messageId: messageId.substring(0, 12),
                  error: resetErr instanceof Error ? resetErr.message : String(resetErr),
                });
              }
            }
          }
        }
        
        log('info', `Inbound batch complete`, { 
          size: inboundBatch.length, 
          processed: processedCount,
          deduped: dedupedCount,
          duration_ms: Date.now() - inboundStart 
        });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // HISTORY QUEUE: Process after inbound, capped to prevent blocking
      // ═══════════════════════════════════════════════════════════════════════
      if (historyBatch.length > 0) {
        log('info', `Processing ${historyBatch.length} gmail history stubs (capped at ${HISTORY_CAP_PER_LOOP})`);
        const historyStart = Date.now();
        let historySuccess = 0;
        let historyFailed = 0;
        let messagesQueued = 0;

        for (const item of historyBatch) {
          try {
            const result = await processHistoryItem(item);
            if (result.success) {
              historySuccess++;
              messagesQueued += result.messagesProcessed;
            } else {
              historyFailed++;
              log('warn', `History stub failed`, { 
                id: item.id.substring(0, 8), 
                error: result.error 
              });
            }
          } catch (error) {
            historyFailed++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            log('error', `History stub exception`, { 
              id: item.id.substring(0, 8), 
              error: errorMessage 
            });
          }
        }

        log('info', `History batch complete`, {
          size: historyBatch.length,
          success: historySuccess,
          failed: historyFailed,
          messagesQueued,
          duration_ms: Date.now() - historyStart,
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
                  // Update last_processed_at for circuit breaker stall detection
                  METRICS.lastProcessedAt = new Date();
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

      // Increment loop counter at END of successful iteration
      METRICS.loopCount++;
      
      // Periodic degradation summary (every 5 minutes)
      maybeDegradationReport();
      
      log('debug', 'Loop iteration complete', {
        loopNumber: METRICS.loopCount,
        loopDuration_ms: Date.now() - loopStartTime,
        itemsProcessed: batch.length + inboundBatch.length + historyBatch.length,
      });

      // Small delay between batches to prevent CPU hogging
      await sleep(500);
    } catch (error) {
      // Increment loop counter even on error to track attempts
      METRICS.loopCount++;
      METRICS.isHealthy = false;
      // Log full error details instead of [object Object]
      const errorDetails = error instanceof Error 
        ? { message: error.message, name: error.name, stack: error.stack }
        : typeof error === 'object' && error !== null
          ? JSON.parse(JSON.stringify(error))
          : { raw: String(error) };
      log('error', 'Loop error', { loopNumber: METRICS.loopCount, ...errorDetails });
      await sleep(5000); // Wait longer on errors
    }
  }

  clearInterval(heartbeatInterval);
  clearInterval(metricsInterval);
  clearInterval(watchdogInterval);
  stopEventLoopMonitor();
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

  // Gmail credentials for history queue processing (Phase 7B)
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
    console.warn('GMAIL_CLIENT_ID/SECRET not set - history queue processing will fail token refresh');
  }
}

validateEnv();
setupShutdownHandlers();
startHealthServer();

// Self-check: verify Supabase connectivity before starting the loop
// This blocks startup until we can successfully query the database
verifySelfCheck()
  .then(() => {
    log('info', 'Self-check passed, starting worker loop');
    return workerLoop();
  })
  .then(() => {
    log('info', 'Worker stopped gracefully');
    process.exit(0);
  })
  .catch((error) => {
    log('error', 'Fatal error', { error: String(error) });
    process.exit(1);
  });
