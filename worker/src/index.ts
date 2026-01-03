/**
 * Email Queue Worker
 * 
 * Processes emails from the queue on VPS workers.
 * Designed for multi-worker deployment with atomic claiming.
 * 
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm start
 */

import 'dotenv/config';
import { claimBatch, completeItem, failItem, resetStaleItems } from './claim.js';
import { processQueueItem } from './process.js';

// Configuration
const LOOP_INTERVAL_MS = 3000;        // Check queue every 3 seconds
const BATCH_SIZE = 25;                // Items per batch
const STALE_RESET_INTERVAL_MS = 60000; // Reset stale items every 60 seconds
const MAX_RETRIES = 3;

let isShuttingDown = false;
let lastStaleReset = Date.now();

/**
 * Main worker loop.
 */
async function workerLoop(): Promise<void> {
  console.log('[worker] Starting email queue worker...');
  console.log(`[worker] Config: batch=${BATCH_SIZE}, interval=${LOOP_INTERVAL_MS}ms`);

  while (!isShuttingDown) {
    try {
      // Reset stale items periodically
      if (Date.now() - lastStaleReset >= STALE_RESET_INTERVAL_MS) {
        const resetCount = await resetStaleItems();
        if (resetCount > 0) {
          console.log(`[worker] Reset ${resetCount} stale items`);
        }
        lastStaleReset = Date.now();
      }

      // Claim a batch of items
      const batch = await claimBatch(BATCH_SIZE);

      if (batch.length === 0) {
        // No items to process, wait and retry
        await sleep(LOOP_INTERVAL_MS);
        continue;
      }

      console.log(`[worker] Claimed ${batch.length} items`);
      const startTime = Date.now();

      // Process items concurrently (but not too many at once)
      const CONCURRENT_LIMIT = 5;
      for (let i = 0; i < batch.length; i += CONCURRENT_LIMIT) {
        const chunk = batch.slice(i, i + CONCURRENT_LIMIT);
        
        await Promise.all(
          chunk.map(async (item) => {
            try {
              const result = await processQueueItem(item);

              if (result.success) {
                await completeItem(item.id);
                console.log(`[worker] ✓ Processed ${item.gmail_message_id} -> ${result.loadId}`);
              } else {
                await failItem(item.id, result.error || 'Unknown error', item.attempts);
                console.log(`[worker] ✗ Failed ${item.gmail_message_id}: ${result.error}`);
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              await failItem(item.id, errorMessage, item.attempts);
              console.error(`[worker] ✗ Exception for ${item.gmail_message_id}:`, errorMessage);
            }
          })
        );
      }

      const elapsed = Date.now() - startTime;
      console.log(`[worker] Batch complete: ${batch.length} items in ${elapsed}ms`);

      // Small delay between batches
      await sleep(500);
    } catch (error) {
      console.error('[worker] Loop error:', error);
      await sleep(5000); // Wait longer on errors
    }
  }

  console.log('[worker] Shutting down gracefully...');
}

/**
 * Sleep helper.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Graceful shutdown handler.
 */
function setupShutdownHandlers(): void {
  const shutdown = (signal: string) => {
    console.log(`[worker] Received ${signal}, initiating shutdown...`);
    isShuttingDown = true;
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start the worker
setupShutdownHandlers();
workerLoop()
  .then(() => {
    console.log('[worker] Worker stopped');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[worker] Fatal error:', error);
    process.exit(1);
  });
