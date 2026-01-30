/**
 * Worker Performance Metrics Module
 * 
 * Tracks and logs detailed performance metrics every 60 seconds:
 * - emails processed/min (inbound)
 * - avg + p95 processing time per email
 * - avg + p95 matching time per email
 * - CPU %, RAM %, event-loop lag
 * - queue drain rate (pending → completed per minute)
 */

import { cpus, totalmem, freemem, loadavg } from 'os';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface TimingSample {
  timestamp: number;
  durationMs: number;
}

interface PerformanceMetrics {
  // Processing timings
  inboundParseTimes: TimingSample[];
  matchingTimes: TimingSample[];
  outboundSendTimes: TimingSample[];
  
  // Counts for rate calculation
  inboundProcessedCount: number;
  matchesCreatedCount: number;
  outboundSentCount: number;
  
  // Queue drain tracking
  queueDrainCount: number;
  
  // Event loop lag tracking
  lastEventLoopCheck: number;
  eventLoopLagMs: number;
  
  // Window start time for rate calculations
  windowStartTime: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const METRICS_WINDOW_MS = 60_000; // 60 seconds

const metrics: PerformanceMetrics = {
  inboundParseTimes: [],
  matchingTimes: [],
  outboundSendTimes: [],
  inboundProcessedCount: 0,
  matchesCreatedCount: 0,
  outboundSentCount: 0,
  queueDrainCount: 0,
  lastEventLoopCheck: Date.now(),
  eventLoopLagMs: 0,
  windowStartTime: Date.now(),
};

// ═══════════════════════════════════════════════════════════════════════════
// TIMING RECORDING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record an inbound email parse time
 */
export function recordInboundParseTime(durationMs: number): void {
  const now = Date.now();
  metrics.inboundParseTimes.push({ timestamp: now, durationMs });
  metrics.inboundProcessedCount++;
  
  // Prune old samples (older than window)
  const cutoff = now - METRICS_WINDOW_MS;
  metrics.inboundParseTimes = metrics.inboundParseTimes.filter(s => s.timestamp >= cutoff);
}

/**
 * Record a matching operation time
 */
export function recordMatchingTime(durationMs: number, matchesCreated: number = 0): void {
  const now = Date.now();
  metrics.matchingTimes.push({ timestamp: now, durationMs });
  metrics.matchesCreatedCount += matchesCreated;
  
  const cutoff = now - METRICS_WINDOW_MS;
  metrics.matchingTimes = metrics.matchingTimes.filter(s => s.timestamp >= cutoff);
}

/**
 * Record an outbound email send time
 */
export function recordOutboundSendTime(durationMs: number): void {
  const now = Date.now();
  metrics.outboundSendTimes.push({ timestamp: now, durationMs });
  metrics.outboundSentCount++;
  
  const cutoff = now - METRICS_WINDOW_MS;
  metrics.outboundSendTimes = metrics.outboundSendTimes.filter(s => s.timestamp >= cutoff);
}

/**
 * Record queue drain (items completed)
 */
export function recordQueueDrain(count: number): void {
  metrics.queueDrainCount += count;
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT LOOP LAG TRACKING
// ═══════════════════════════════════════════════════════════════════════════

let lagCheckTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Start event loop lag monitoring
 */
export function startEventLoopMonitor(): void {
  const checkLag = () => {
    const expected = 100; // Check every 100ms
    const now = Date.now();
    const lag = now - metrics.lastEventLoopCheck - expected;
    metrics.eventLoopLagMs = Math.max(0, lag);
    metrics.lastEventLoopCheck = now;
    
    lagCheckTimeout = setTimeout(checkLag, expected);
  };
  
  metrics.lastEventLoopCheck = Date.now();
  lagCheckTimeout = setTimeout(checkLag, 100);
}

/**
 * Stop event loop monitoring
 */
export function stopEventLoopMonitor(): void {
  if (lagCheckTimeout) {
    clearTimeout(lagCheckTimeout);
    lagCheckTimeout = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

interface TimingStats {
  count: number;
  avgMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

function calculateStats(samples: TimingSample[]): TimingStats {
  if (samples.length === 0) {
    return { count: 0, avgMs: 0, p95Ms: 0, minMs: 0, maxMs: 0 };
  }
  
  const durations = samples.map(s => s.durationMs).sort((a, b) => a - b);
  const sum = durations.reduce((acc, d) => acc + d, 0);
  const avg = sum / durations.length;
  const p95Index = Math.floor(durations.length * 0.95);
  const p95 = durations[Math.min(p95Index, durations.length - 1)];
  
  return {
    count: durations.length,
    avgMs: Math.round(avg * 10) / 10,
    p95Ms: Math.round(p95 * 10) / 10,
    minMs: Math.round(durations[0] * 10) / 10,
    maxMs: Math.round(durations[durations.length - 1] * 10) / 10,
  };
}

function getCpuPercent(): number {
  const cpuInfo = cpus();
  let totalIdle = 0;
  let totalTick = 0;
  
  for (const cpu of cpuInfo) {
    for (const type in cpu.times) {
      totalTick += (cpu.times as any)[type];
    }
    totalIdle += cpu.times.idle;
  }
  
  const idle = totalIdle / cpuInfo.length;
  const total = totalTick / cpuInfo.length;
  const usage = ((total - idle) / total) * 100;
  
  return Math.round(usage * 10) / 10;
}

function getMemoryPercent(): number {
  const total = totalmem();
  const free = freemem();
  const used = total - free;
  const percent = (used / total) * 100;
  return Math.round(percent * 10) / 10;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN REPORTING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export interface MetricsReport {
  // Rates (per minute)
  inboundPerMin: number;
  matchesPerMin: number;
  outboundPerMin: number;
  drainPerMin: number;
  
  // Timing stats
  inboundParse: TimingStats;
  matching: TimingStats;
  outboundSend: TimingStats;
  
  // System resources
  cpuPercent: number;
  ramPercent: number;
  eventLoopLagMs: number;
  loadAvg1m: number;
  loadAvg5m: number;
  loadAvg15m: number;
}

/**
 * Get current metrics report and reset counters for next window
 */
export function getMetricsReport(): MetricsReport {
  const now = Date.now();
  const windowDurationMs = now - metrics.windowStartTime;
  const windowMinutes = Math.max(windowDurationMs / 60_000, 0.1); // At least 0.1 min to avoid div/0
  
  // Calculate rates
  const inboundPerMin = Math.round((metrics.inboundProcessedCount / windowMinutes) * 10) / 10;
  const matchesPerMin = Math.round((metrics.matchesCreatedCount / windowMinutes) * 10) / 10;
  const outboundPerMin = Math.round((metrics.outboundSentCount / windowMinutes) * 10) / 10;
  const drainPerMin = Math.round((metrics.queueDrainCount / windowMinutes) * 10) / 10;
  
  // Calculate timing stats (from samples in current window)
  const cutoff = now - METRICS_WINDOW_MS;
  const recentInbound = metrics.inboundParseTimes.filter(s => s.timestamp >= cutoff);
  const recentMatching = metrics.matchingTimes.filter(s => s.timestamp >= cutoff);
  const recentOutbound = metrics.outboundSendTimes.filter(s => s.timestamp >= cutoff);
  
  // System metrics
  const [load1, load5, load15] = loadavg();
  
  const report: MetricsReport = {
    inboundPerMin,
    matchesPerMin,
    outboundPerMin,
    drainPerMin,
    inboundParse: calculateStats(recentInbound),
    matching: calculateStats(recentMatching),
    outboundSend: calculateStats(recentOutbound),
    cpuPercent: getCpuPercent(),
    ramPercent: getMemoryPercent(),
    eventLoopLagMs: metrics.eventLoopLagMs,
    loadAvg1m: Math.round(load1 * 100) / 100,
    loadAvg5m: Math.round(load5 * 100) / 100,
    loadAvg15m: Math.round(load15 * 100) / 100,
  };
  
  // Reset window counters (but keep samples for rolling stats)
  metrics.inboundProcessedCount = 0;
  metrics.matchesCreatedCount = 0;
  metrics.outboundSentCount = 0;
  metrics.queueDrainCount = 0;
  metrics.windowStartTime = now;
  
  return report;
}

/**
 * Log metrics report to console in structured format
 */
export function logMetricsReport(): void {
  const report = getMetricsReport();
  
  // Structured log line for production parsing
  const logLine = {
    type: 'METRICS_REPORT',
    ts: new Date().toISOString(),
    rates: {
      inbound_per_min: report.inboundPerMin,
      matches_per_min: report.matchesPerMin,
      outbound_per_min: report.outboundPerMin,
      drain_per_min: report.drainPerMin,
    },
    timing: {
      inbound_parse: {
        count: report.inboundParse.count,
        avg_ms: report.inboundParse.avgMs,
        p95_ms: report.inboundParse.p95Ms,
      },
      matching: {
        count: report.matching.count,
        avg_ms: report.matching.avgMs,
        p95_ms: report.matching.p95Ms,
      },
      outbound_send: {
        count: report.outboundSend.count,
        avg_ms: report.outboundSend.avgMs,
        p95_ms: report.outboundSend.p95Ms,
      },
    },
    system: {
      cpu_pct: report.cpuPercent,
      ram_pct: report.ramPercent,
      event_loop_lag_ms: report.eventLoopLagMs,
      load_1m: report.loadAvg1m,
      load_5m: report.loadAvg5m,
    },
  };
  
  console.log(JSON.stringify(logLine));
  
  // Human-readable summary
  console.log(`📊 METRICS: inbound=${report.inboundPerMin}/min (avg ${report.inboundParse.avgMs}ms, p95 ${report.inboundParse.p95Ms}ms) | matching=${report.matchesPerMin}/min (avg ${report.matching.avgMs}ms, p95 ${report.matching.p95Ms}ms) | CPU=${report.cpuPercent}% RAM=${report.ramPercent}% lag=${report.eventLoopLagMs}ms load=${report.loadAvg1m}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// CAPACITY ESTIMATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estimate if current capacity is sufficient for target load
 */
export function estimateCapacity(targetEmailsPerDay: number, currentReport: MetricsReport): {
  sufficient: boolean;
  currentCapacityPerDay: number;
  headroomPercent: number;
  bottleneck: string | null;
} {
  // Calculate theoretical capacity based on current throughput
  const emailsPerMinute = currentReport.inboundPerMin || 1;
  const currentCapacityPerDay = emailsPerMinute * 60 * 24;
  
  const headroomPercent = Math.round(((currentCapacityPerDay - targetEmailsPerDay) / currentCapacityPerDay) * 100);
  
  // Identify bottleneck
  let bottleneck: string | null = null;
  if (currentReport.cpuPercent > 80) {
    bottleneck = 'CPU';
  } else if (currentReport.ramPercent > 85) {
    bottleneck = 'RAM';
  } else if (currentReport.eventLoopLagMs > 100) {
    bottleneck = 'event-loop';
  } else if (currentReport.loadAvg1m > 2.5) {
    bottleneck = 'load-average';
  }
  
  return {
    sufficient: currentCapacityPerDay >= targetEmailsPerDay * 1.5, // 50% headroom
    currentCapacityPerDay: Math.round(currentCapacityPerDay),
    headroomPercent,
    bottleneck,
  };
}
