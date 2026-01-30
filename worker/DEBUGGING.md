# Worker Debugging Guide

## Verification Commands

### 1. Verify Worker is Running Latest Code

```bash
# Check for timeout protection (added in this fix)
docker exec -it worker-worker-1 sh -c 'grep -RIn "CLAIM_RPC_TIMEOUT_MS" /app/dist | head -5'

# Check for loop observability improvements
docker exec -it worker-worker-1 sh -c 'grep -RIn "loopStartTime" /app/dist | head -5'

# Check for tenant resolution timeout
docker exec -it worker-worker-1 sh -c 'grep -RIn "TENANT_RESOLUTION_TIMEOUT_MS" /app/dist | head -5'

# Check for existing dedup logic
docker exec -it worker-worker-1 sh -c 'grep -RIn "skipped_duplicate_existing" /app/dist | head -5'
```

**Expected**: All grep commands should return matches. If not, the container has stale code.

### 2. Verify Supabase Auth Inside Containers

```bash
# Check env vars are present (safe - only shows length, not values)
docker exec -it worker-worker-1 sh -c '
echo "SUPABASE_URL exists: $([ -n "$SUPABASE_URL" ] && echo true || echo false)"
echo "SUPABASE_SERVICE_ROLE_KEY length: $(echo -n "$SUPABASE_SERVICE_ROLE_KEY" | wc -c)"
echo "GMAIL_CLIENT_ID exists: $([ -n "$GMAIL_CLIENT_ID" ] && echo true || echo false)"
echo "GMAIL_CLIENT_SECRET length: $(echo -n "$GMAIL_CLIENT_SECRET" | wc -c)"
'

# Run same for worker-2
docker exec -it worker-worker-2 sh -c '
echo "SUPABASE_URL exists: $([ -n "$SUPABASE_URL" ] && echo true || echo false)"
echo "SUPABASE_SERVICE_ROLE_KEY length: $(echo -n "$SUPABASE_SERVICE_ROLE_KEY" | wc -c)"
'
```

**Expected**: 
- `SUPABASE_URL exists: true`
- `SUPABASE_SERVICE_ROLE_KEY length: [number > 0]` (typically 200+ chars)

### 3. Check Queue Status

```bash
docker exec -it worker-worker-1 sh -c 'node -e "
const { createClient } = require(\"@supabase/supabase-js\");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { count: pending } = await supabase.from(\"email_queue\").select(\"id\", { count: \"exact\", head: true }).eq(\"status\", \"pending\");
  const { count: processing } = await supabase.from(\"email_queue\").select(\"id\", { count: \"exact\", head: true }).eq(\"status\", \"processing\");
  const { count: completed } = await supabase.from(\"email_queue\").select(\"id\", { count: \"exact\", head: true }).eq(\"status\", \"completed\");
  const { count: failed } = await supabase.from(\"email_queue\").select(\"id\", { count: \"exact\", head: true }).eq(\"status\", \"failed\");
  console.log({ pending, processing, completed, failed, ts: new Date().toISOString() });
})();
"'
```

### 4. Check Worker Logs for Stalls

```bash
# Watch logs for claim results and loop progress
docker logs --tail 100 worker-worker-1 2>&1 | grep -E "Loop iteration|Claim results|TIMEOUT|error"

# Look for timeout errors specifically
docker logs worker-worker-1 2>&1 | grep -i "TIMEOUT" | tail -20

# Check if loops are incrementing
docker logs worker-worker-1 2>&1 | grep "loopNumber" | tail -20
```

### 5. Check Health Endpoint

```bash
# Get health status with metrics
curl http://localhost:8080/health | jq .

# Look for:
# - metrics.loops: should be incrementing
# - status: should be "healthy"
```

## Expected Log Patterns

### Healthy Worker
```
{"level":"debug","msg":"Loop iteration starting","currentLoopNumber":5,...}
{"level":"debug","msg":"Claim results","outbound":0,"inbound":12,"history":3,...}
{"level":"info","msg":"Processing 12 inbound load emails (PRIORITY)"}
{"level":"debug","msg":"Loop iteration complete","loopNumber":5,"loopDuration_ms":1234,...}
```

### Stalled Worker (BEFORE fix)
```
{"level":"info","msg":"Heartbeat","loops":1,"sent":0,...}  # loops stuck at 1
{"level":"info","msg":"Heartbeat","loops":1,"sent":0,...}  # still 1
# No "Loop iteration complete" logs
```

### Timeout Protection Working
```
{"level":"error","msg":"[claim] claimInboundBatch error:","isTimeout":true,...}
# Worker continues processing instead of hanging
```

## Deployment

After making code changes:

```bash
cd /opt/drive-easy-apply-a5a928c8/worker
git stash
git pull origin main
git stash pop  # if needed
docker compose down
docker compose up -d --build --force-recreate
docker compose logs -f
```

## Success Criteria

1. `loops` in heartbeat continuously increments
2. `pending` count steadily decreases
3. `completed` count continuously increases
4. No manual restarts required for hours
5. No stuck `processing` rows
