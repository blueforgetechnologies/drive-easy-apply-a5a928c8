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
import { claimBatch, completeItem, failItem, resetStaleItems } from './claim.js';
import { processQueueItem } from './process.js';
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

function log(level: LogLevel, message: string, meta?: Record<string, any>): void {
  if (LOG_LEVELS[level] < currentLogLevel) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    worker: process.env.WORKER_ID || 'worker-1',
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

async function refreshConfig(): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('get_worker_config');
    
    if (error) {
      log('warn', 'Failed to fetch config from database, using defaults', { error: error.message });
      METRICS.configSource = 'default';
      return;
    }
    
    if (data && data.length > 0) {
      const dbConfig = data[0];
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
      };
      METRICS.configSource = 'database';
      METRICS.lastConfigRefresh = new Date();
      log('debug', 'Config refreshed from database', { config: currentConfig });
    }
  } catch (error) {
    log('warn', 'Exception refreshing config', { error: String(error) });
    METRICS.configSource = 'default';
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
// MAIN WORKER LOOP
// ═══════════════════════════════════════════════════════════════════════════

async function workerLoop(): Promise<void> {
  // Initial config load
  await refreshConfig();
  
  log('info', 'Starting email queue worker (Resend)', {
    batch_size: currentConfig.batch_size,
    interval_ms: currentConfig.loop_interval_ms,
    concurrent: currentConfig.concurrent_limit,
    config_source: METRICS.configSource,
  });

  // Log heartbeat every minute
  const heartbeatInterval = setInterval(() => {
    METRICS.lastHeartbeat = new Date();
    log('info', 'Heartbeat', {
      loops: METRICS.loopCount,
      sent: METRICS.emailsSent,
      failed: METRICS.emailsFailed,
      enabled: currentConfig.enabled,
      paused: currentConfig.paused,
    });
  }, 60000);

  while (!isShuttingDown) {
    try {
      // Refresh config periodically
      if (Date.now() - lastConfigRefresh >= STATIC_CONFIG.CONFIG_REFRESH_INTERVAL_MS) {
        await refreshConfig();
        lastConfigRefresh = Date.now();
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

      // Reset stale items periodically
      if (Date.now() - lastStaleReset >= STATIC_CONFIG.STALE_RESET_INTERVAL_MS) {
        const resetCount = await resetStaleItems();
        if (resetCount > 0) {
          log('warn', `Reset stale items`, { count: resetCount });
          METRICS.staleResetCount += resetCount;
        }
        lastStaleReset = Date.now();
      }

      // Claim a batch of items atomically
      const batch = await claimBatch(currentConfig.batch_size);

      if (batch.length === 0) {
        await sleep(currentConfig.loop_interval_ms);
        continue;
      }

      log('debug', `Claimed batch`, { size: batch.length });
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
                await completeItem(item.id, 'sent');
                METRICS.emailsSent++;
                log('info', `Email sent`, {
                  id: item.id.substring(0, 8),
                  to: item.to_email,
                  email_sent: true,
                  message_id: result.messageId,
                  duration_ms: Date.now() - itemStart,
                });
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
