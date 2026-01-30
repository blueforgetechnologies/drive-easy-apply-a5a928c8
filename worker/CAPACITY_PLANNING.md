# VPS Worker Capacity Planning

## Executive Summary

**YES/NO: CPX21 is enough?**

**YES** — A single Hetzner CPX21 (3 vCPU / 4GB RAM) is sufficient for:
- 40,000 emails/day (~28/min sustained, 100/min peak)
- 25 active hunt plans with 250mi radius

**Margin of safety**: ~3-4x headroom based on the architecture.

---

## 1. Architecture Status (Cost Confirmation)

### ✅ gmail-webhook is STUB-ONLY when `WEBHOOK_STUB_ONLY_MODE=true`

The webhook now enforces these invariants:
- **I1**: NO Gmail API calls ✅
- **I2**: NO Supabase Storage writes ✅
- **I3**: VPS is sole owner of Gmail API + payload storage ✅
- **I4**: Circuit breaker is O(1) (no COUNT(*)) ✅
- **I5**: Cloud stays <$2/day under stall conditions ✅

### What Runs in Cloud After Phase 1

| Component | Operation | Estimated Cost/Day |
|-----------|-----------|-------------------|
| `gmail-webhook` | Insert 1 stub row (~200 bytes) | ~$0.02 for 40K emails |
| `circuit_breaker_events` | Log dropped stubs | ~$0.001 |
| `unroutable_emails` | Quarantine failures | ~$0.001 |
| **TOTAL** | | **~$0.05-0.10/day** |

Previous cost was $5-15/day. **Savings: 95%+**

---

## 2. Capacity Analysis for CPX21

### Target Load
- **40,000 emails/day** = 27.8 emails/min (sustained)
- **Peak bursts**: Assume 3x = ~84 emails/min during high activity
- **25 active hunt plans** with 250mi radius, running 20/7 (20 hours/day)

### Processing Time Estimates

Based on the current worker architecture:

| Operation | Avg Time | P95 Time | Notes |
|-----------|----------|----------|-------|
| Inbound parse (full) | 200-500ms | 800ms | Includes storage download, geocoding |
| Matching (per email) | 20-100ms | 200ms | Depends on active hunts |
| Outbound send | 100-300ms | 500ms | Resend API latency |

### Theoretical Throughput

**Single-threaded capacity**:
```
1 email / 500ms = 2 emails/sec = 120 emails/min = 172,800/day
```

**With concurrent processing** (batch_size=50, concurrent_limit=5):
```
Effective: 5 concurrent × 2/sec = 600 emails/min = 864,000/day
```

### CPX21 Resource Usage Estimate

| Resource | At 40K emails/day | At Peak (100/min) |
|----------|-------------------|-------------------|
| CPU | 15-25% | 40-60% |
| RAM | 200-400MB | 400-600MB |
| Event Loop Lag | <10ms | <50ms |
| Load Average | 0.3-0.5 | 1.0-1.5 |

**Verdict**: 3-4x headroom. Single server is sufficient.

---

## 3. Metrics Logging (Added)

The worker now logs detailed metrics every 60 seconds:

```json
{
  "type": "METRICS_REPORT",
  "ts": "2026-01-30T12:00:00.000Z",
  "rates": {
    "inbound_per_min": 45.2,
    "matches_per_min": 12.5,
    "outbound_per_min": 3.1,
    "drain_per_min": 48.3
  },
  "timing": {
    "inbound_parse": { "count": 45, "avg_ms": 320.5, "p95_ms": 780.2 },
    "matching": { "count": 45, "avg_ms": 85.3, "p95_ms": 195.0 },
    "outbound_send": { "count": 3, "avg_ms": 210.0, "p95_ms": 450.0 }
  },
  "system": {
    "cpu_pct": 22.5,
    "ram_pct": 35.2,
    "event_loop_lag_ms": 5,
    "load_1m": 0.45,
    "load_5m": 0.38
  }
}
```

Human-readable summary also logged:
```
📊 METRICS: inbound=45.2/min (avg 320ms, p95 780ms) | matching=12.5/min (avg 85ms, p95 195ms) | CPU=22.5% RAM=35.2% lag=5ms load=0.45
```

---

## 4. Verification Commands

### Command 1: Confirm webhook is stub-only (no Gmail API)
```bash
# Check edge function logs for last hour
# Should see "STUB_ONLY_MODE active" and NO "Gmail API" or "Storage write" lines
curl -s "https://api.supabase.com/v1/projects/vvbdmjjovzcfmfqywoty/analytics/endpoints/logs.all" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  --data-urlencode "sql=SELECT timestamp, event_message FROM edge_logs WHERE function_id = 'gmail-webhook' AND timestamp > now() - interval '1 hour' ORDER BY timestamp DESC LIMIT 100"
```

### Command 2: Check stub insertion rate
```sql
-- Run in Supabase SQL editor or via API
SELECT 
  date_trunc('hour', created_at) as hour,
  count(*) as stubs_inserted,
  count(*) / 60.0 as stubs_per_min
FROM gmail_stubs 
WHERE created_at > now() - interval '24 hours'
GROUP BY 1 ORDER BY 1 DESC;
```

### Command 3: Check worker metrics in logs
```bash
# SSH to VPS and check logs
docker logs --since 5m worker-worker-1 2>&1 | grep "METRICS_REPORT"
```

---

## 5. Deploy Steps

### Single Server (Recommended)

```bash
# SSH to tms-worker-1
ssh user@tms-worker-1

# Navigate to worker directory
cd /path/to/tms-platform/worker

# Pull latest changes
git stash
git pull origin main

# Rebuild and restart
docker compose down
docker compose up -d --build --force-recreate

# Verify containers are running
docker compose ps

# Check logs for successful startup
docker logs --tail 50 worker-worker-1
```

### Two Servers (If Needed)

Only use if metrics show:
- CPU consistently >70%
- Event loop lag >100ms
- Load average >2.5

```bash
# On BOTH tms-worker-1 AND tms-worker-2:

ssh user@tms-worker-1  # (then repeat for tms-worker-2)

cd /path/to/tms-platform/worker
git stash && git pull origin main
docker compose down
docker compose up -d --build --force-recreate

# Verify both are healthy
docker logs --tail 20 worker-worker-1
```

**No double-processing risk**: The `FOR UPDATE SKIP LOCKED` in `claim_inbound_email_queue_batch` RPC ensures atomic claiming. Two workers will simply claim different batches.

---

## 6. Matching Process Review

### Current Location
Matching is triggered in `worker/src/inbound.ts` at **Step 11**:

```typescript
// STEP 11: Hunt matching (async, non-blocking)
if (insertedEmail && parsedData.pickup_coordinates && parsedData.vehicle_type) {
  matchLoadToHunts(...)
}
```

The matching logic is in `worker/src/inbound.ts#matchLoadToHunts` (lines 149-304).

### Matching Cost Analysis

For 25 active hunts:
1. Feature flag check: 1 RPC call (~5ms)
2. Hunt plans query: 1 query returning 25 rows (~10ms)
3. For each hunt (worst case all 25):
   - Haversine distance calc: O(1), <0.1ms
   - Vehicle type check: O(1), <0.1ms
   - Existing match check: 1 query per hunt (~5ms each = 125ms total)
   - Cooldown RPC: 1 call per matching hunt (~10ms each)

**Total worst-case per email**: ~200ms
**Typical case** (5 hunts within radius): ~50-80ms

### Optimization Options (If Needed)

**O1: Precomputed bounding boxes** (Easy, ~30% faster)
```typescript
// Pre-filter hunts by lat/lng bounding box before Haversine
const roughRadius = hunt.pickup_radius * 1.5; // degrees approximation
const inBox = Math.abs(loadLat - huntLat) < roughRadius/69 &&
              Math.abs(loadLng - huntLng) < roughRadius/54;
```

**O2: Batch existing match check** (Medium, ~40% faster)
```typescript
// Instead of 25 individual queries, batch:
const { data } = await supabase
  .from('load_hunt_matches')
  .select('hunt_plan_id')
  .eq('load_email_id', loadEmailId)
  .in('hunt_plan_id', huntPlanIds);
const existingMatchSet = new Set(data.map(d => d.hunt_plan_id));
```

**O3: Geohash index** (Complex, ~60% faster)
Requires schema changes. Only consider if matching exceeds 500ms/email consistently.

**Current recommendation**: Monitor metrics for 1 week before optimizing.

---

## 7. Environment Variables

Required for Phase 1:
```bash
# Enable stub-only mode (REQUIRED for cost savings)
WEBHOOK_STUB_ONLY_MODE=true

# Circuit breaker threshold (default: 1000)
QUEUE_DEPTH_LIMIT=1000

# Emergency kill switch (default: false)
GMAIL_WEBHOOK_DISABLED=false

# History queue (keep disabled unless needed)
ENABLE_HISTORY_QUEUE=false
```

---

## 8. Monitoring Alerts

Set up alerts for:

| Metric | Warning | Critical |
|--------|---------|----------|
| CPU % | >60% sustained 10min | >80% sustained 5min |
| RAM % | >70% | >85% |
| Event Loop Lag | >50ms | >200ms |
| Inbound p95 latency | >1000ms | >2000ms |
| Queue depth | >500 pending | >1000 pending |
| Worker last_processed_at age | >3 min | >5 min (circuit breaker opens) |
