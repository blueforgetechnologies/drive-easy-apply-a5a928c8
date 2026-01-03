/**
 * Email Queue Worker
 * 
 * High-performance email processor for multi-tenant TMS.
 * Designed for VPS deployment with multiple concurrent workers.
 * 
 * Features:
 * - Atomic queue claiming (FOR UPDATE SKIP LOCKED)
 * - Multi-worker safe (no double-processing)
 * - Automatic stale job recovery
 * - Health check HTTP endpoint
 * - Structured logging with metrics
 * 
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm start
 */

import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { claimBatch, completeItem, failItem, resetStaleItems } from './claim.js';
import { processQueueItem } from './process.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Queue polling
  LOOP_INTERVAL_MS: 3000,          // Check queue every 3 seconds (well under 20s requirement)
  BATCH_SIZE: 25,                  // Items per batch claim
  CONCURRENT_LIMIT: 5,             // Max concurrent processing within a batch
  MAX_RETRIES: 3,                  // Retries before marking as failed
  
  // Recovery
  STALE_RESET_INTERVAL_MS: 60000,  // Reset stale items every 60 seconds
  
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
  itemsProcessed: number;
  itemsFailed: number;
  lastBatchTime: number;
  lastBatchSize: number;
  staleResetCount: number;
  isHealthy: boolean;
  lastHeartbeat: Date;
}

const METRICS: WorkerMetrics = {
  startedAt: new Date(),
  loopCount: 0,
  itemsProcessed: 0,
  itemsFailed: 0,
  lastBatchTime: 0,
  lastBatchSize: 0,
  staleResetCount: 0,
  isHealthy: true,
  lastHeartbeat: new Date(),
};

let isShuttingDown = false;
let lastStaleReset = Date.now();

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

const currentLogLevel = LOG_LEVELS[CONFIG.LOG_LEVEL as LogLevel] ?? LOG_LEVELS.info;

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
          items_processed: METRICS.itemsProcessed,
          items_failed: METRICS.itemsFailed,
          last_batch_size: METRICS.lastBatchSize,
          last_batch_time_ms: METRICS.lastBatchTime,
          stale_resets: METRICS.staleResetCount,
          last_heartbeat: METRICS.lastHeartbeat.toISOString(),
        },
        config: {
          batch_size: CONFIG.BATCH_SIZE,
          loop_interval_ms: CONFIG.LOOP_INTERVAL_MS,
          concurrent_limit: CONFIG.CONCURRENT_LIMIT,
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
        `# HELP worker_items_processed_total Total items processed`,
        `# TYPE worker_items_processed_total counter`,
        `worker_items_processed_total ${METRICS.itemsProcessed}`,
        `# HELP worker_items_failed_total Total items failed`,
        `# TYPE worker_items_failed_total counter`,
        `worker_items_failed_total ${METRICS.itemsFailed}`,
        `# HELP worker_loops_total Total loop iterations`,
        `# TYPE worker_loops_total counter`,
        `worker_loops_total ${METRICS.loopCount}`,
        `# HELP worker_last_batch_size Items in last batch`,
        `# TYPE worker_last_batch_size gauge`,
        `worker_last_batch_size ${METRICS.lastBatchSize}`,
        `# HELP worker_last_batch_duration_ms Last batch processing time`,
        `# TYPE worker_last_batch_duration_ms gauge`,
        `worker_last_batch_duration_ms ${METRICS.lastBatchTime}`,
      ];
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(lines.join('\n'));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(CONFIG.HEALTH_PORT, () => {
    log('info', `Health server listening`, { port: CONFIG.HEALTH_PORT });
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
  log('info', 'Starting email queue worker', {
    batch_size: CONFIG.BATCH_SIZE,
    interval_ms: CONFIG.LOOP_INTERVAL_MS,
    concurrent: CONFIG.CONCURRENT_LIMIT,
  });

  // Log heartbeat every minute
  const heartbeatInterval = setInterval(() => {
    METRICS.lastHeartbeat = new Date();
    log('info', 'Heartbeat', {
      loops: METRICS.loopCount,
      processed: METRICS.itemsProcessed,
      failed: METRICS.itemsFailed,
    });
  }, 60000);

  while (!isShuttingDown) {
    try {
      METRICS.loopCount++;
      METRICS.isHealthy = true;

      // Reset stale items periodically
      if (Date.now() - lastStaleReset >= CONFIG.STALE_RESET_INTERVAL_MS) {
        const resetCount = await resetStaleItems();
        if (resetCount > 0) {
          log('warn', `Reset stale items`, { count: resetCount });
          METRICS.staleResetCount += resetCount;
        }
        lastStaleReset = Date.now();
      }

      // Claim a batch of items atomically
      const batch = await claimBatch(CONFIG.BATCH_SIZE);

      if (batch.length === 0) {
        await sleep(CONFIG.LOOP_INTERVAL_MS);
        continue;
      }

      log('debug', `Claimed batch`, { size: batch.length });
      const startTime = Date.now();
      METRICS.lastBatchSize = batch.length;

      // Process items with controlled concurrency
      for (let i = 0; i < batch.length; i += CONFIG.CONCURRENT_LIMIT) {
        const chunk = batch.slice(i, i + CONFIG.CONCURRENT_LIMIT);

        await Promise.all(
          chunk.map(async (item) => {
            const itemStart = Date.now();
            try {
              const result = await processQueueItem(item);

              if (result.success) {
                await completeItem(item.id);
                METRICS.itemsProcessed++;
                log('info', `Processed email`, {
                  gmail_id: item.gmail_message_id.substring(0, 12),
                  load_id: result.loadId,
                  duration_ms: Date.now() - itemStart,
                });
              } else {
                const newAttempts = item.attempts + 1;
                await failItem(item.id, result.error || 'Unknown error', newAttempts);
                METRICS.itemsFailed++;

                if (newAttempts >= CONFIG.MAX_RETRIES) {
                  log('error', `Email permanently failed`, {
                    gmail_id: item.gmail_message_id,
                    error: result.error,
                    attempts: newAttempts,
                  });
                } else {
                  log('warn', `Email failed, will retry`, {
                    gmail_id: item.gmail_message_id,
                    error: result.error,
                    attempts: newAttempts,
                  });
                }
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              const newAttempts = item.attempts + 1;
              await failItem(item.id, errorMessage, newAttempts);
              METRICS.itemsFailed++;
              log('error', `Exception processing email`, {
                gmail_id: item.gmail_message_id,
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
      log('error', 'Loop error', { error: String(error) });
      await sleep(5000); // Wait longer on errors
    }
  }

  clearInterval(heartbeatInterval);
  log('info', 'Worker shutdown complete', {
    total_processed: METRICS.itemsProcessed,
    total_failed: METRICS.itemsFailed,
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
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
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
