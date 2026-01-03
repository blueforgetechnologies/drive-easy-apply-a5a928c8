# Email Queue Worker

High-performance VPS-based worker for processing the email queue with <20 second end-to-end latency.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Gmail Webhook  │────▶│   email_queue    │◀────│  VPS Workers    │
│   (Pub/Sub)     │     │   (Supabase)     │     │  (Docker x2+)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                         │
                               ▼                         ▼
                        ┌──────────────┐          ┌──────────────┐
                        │ load_emails  │          │ hunt_matches │
                        └──────────────┘          └──────────────┘
```

## Key Features

- **Atomic Claiming**: Uses `FOR UPDATE SKIP LOCKED` to prevent double-processing
- **Multi-Worker Safe**: Run 2+ workers without conflicts
- **Duplicate Prevention**: Database constraint on `(load_email_id, hunt_plan_id)`
- **Stale Recovery**: Automatically resets jobs stuck in `processing` for >5 minutes
- **Health Checks**: HTTP endpoint for Docker/Kubernetes health probes
- **Metrics**: Prometheus-compatible `/metrics` endpoint
- **Structured Logging**: JSON logs for production, pretty logs for dev

## Quick Start

### 1. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required environment variables:
| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (NOT anon!) |
| `GMAIL_CLIENT_ID` | Yes | Gmail OAuth client ID |
| `GMAIL_CLIENT_SECRET` | Yes | Gmail OAuth client secret |
| `VITE_MAPBOX_TOKEN` | Yes | Mapbox access token for geocoding |
| `WORKER_ID` | No | Unique worker identifier for logs |
| `HEALTH_PORT` | No | Health check port (default: 8080) |
| `LOG_LEVEL` | No | debug/info/warn/error (default: info) |
| `NODE_ENV` | No | Set to `production` for JSON logs |

### 2. Local Development

```bash
# Install dependencies
npm install

# Run in development mode (with hot reload)
npm run dev

# Type check
npm run typecheck
```

### 3. Production Build

```bash
npm run build
npm start
```

## Docker Deployment

### Build & Run Single Worker

```bash
# Build image
docker build -t email-worker .

# Run with env file
docker run -d \
  --name worker-1 \
  --env-file .env \
  -p 8080:8080 \
  --restart unless-stopped \
  email-worker
```

### Run Multiple Workers with Docker Compose

```bash
# Start 2 workers (default)
docker compose up -d

# Scale to 4 workers
docker compose up -d --scale worker=4

# View logs (all workers)
docker compose logs -f

# View logs (single worker)
docker compose logs -f worker-1

# Stop all
docker compose down
```

## VPS Deployment (Step-by-Step)

### Prerequisites
- Ubuntu 22.04 or similar Linux server
- Docker and Docker Compose installed
- Access to Supabase service role key
- Gmail OAuth credentials configured

### 1. Server Setup

```bash
# SSH into your VPS
ssh user@your-vps-ip

# Install Docker (if not installed)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt-get install docker-compose-plugin

# Create worker directory
mkdir -p /opt/email-worker
cd /opt/email-worker
```

### 2. Upload Files

```bash
# From your local machine
scp -r worker/* user@your-vps-ip:/opt/email-worker/
```

### 3. Configure Environment

```bash
# On the VPS
cd /opt/email-worker
cp .env.example .env

# Edit with your credentials
nano .env
```

### 4. Start Workers

```bash
# Build and start
docker compose up -d --build

# Verify running
docker compose ps

# Check logs
docker compose logs -f
```

### 5. Set Up Auto-Restart

```bash
# Docker Compose services auto-restart by default
# To manually restart on server reboot, add to crontab:
crontab -e

# Add this line:
@reboot cd /opt/email-worker && docker compose up -d
```

## Health Checks

The worker exposes an HTTP server for health monitoring:

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Full health status with metrics |
| `GET /healthz` | Same as /health |
| `GET /ready` | Simple readiness check (200/503) |
| `GET /metrics` | Prometheus-compatible metrics |

### Example Health Response

```json
{
  "status": "healthy",
  "uptime_ms": 3600000,
  "uptime_human": "1h 0m",
  "metrics": {
    "loops": 1200,
    "items_processed": 450,
    "items_failed": 3,
    "last_batch_size": 12,
    "last_batch_time_ms": 2340,
    "stale_resets": 0,
    "last_heartbeat": "2024-01-15T10:30:00.000Z"
  },
  "config": {
    "batch_size": 25,
    "loop_interval_ms": 3000,
    "concurrent_limit": 5
  }
}
```

## Monitoring & Alerting

### With Docker Health Checks

The Dockerfile includes a built-in health check:
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:8080/ready || exit 1
```

### With External Monitoring

```bash
# Simple cron-based monitoring
*/5 * * * * curl -sf http://localhost:8080/ready || echo "Worker unhealthy" | mail -s "Alert" admin@example.com
```

### Log Aggregation

In production mode (`NODE_ENV=production`), logs are JSON formatted:

```json
{"ts":"2024-01-15T10:30:00.000Z","level":"info","msg":"Processed email","worker":"worker-1","gmail_id":"abc123...","load_id":"LH-240115-1234","duration_ms":234}
```

Pipe to your preferred log aggregator (Loki, CloudWatch, etc.)

## Database Functions

The worker relies on these Supabase functions (created by migration):

| Function | Description |
|----------|-------------|
| `claim_email_queue_batch(p_batch_size)` | Atomically claims pending items |
| `reset_stale_email_queue()` | Resets stuck items (>5 min) |
| `complete_email_queue_item(p_id)` | Marks item as completed |
| `fail_email_queue_item(p_id, p_error, p_attempts)` | Marks item as failed |

## Worker Behavior

1. **Every 3 seconds**: Claim up to 25 pending items atomically
2. **Process concurrently**: 5 items at a time
3. **For each item**:
   - Fetch email from Gmail API
   - Parse based on source (Sylectus / Full Circle TMS)
   - Apply parser hints from database
   - Geocode origin location (with caching)
   - Insert into `load_emails`
   - Match against active hunt plans
   - Mark queue item as completed/failed
4. **Every 60 seconds**: Reset stale items back to pending
5. **Every 60 seconds**: Log heartbeat with metrics

## Performance Tuning

For 20 hunts @ 250 mile radius:

| Setting | Default | For Heavy Load |
|---------|---------|----------------|
| `BATCH_SIZE` | 25 | 50 |
| `CONCURRENT_LIMIT` | 5 | 10 |
| `LOOP_INTERVAL_MS` | 3000 | 2000 |
| Worker Count | 2 | 4 |

## Troubleshooting

### "No items to process" continuously
- Check that Gmail webhook is inserting into `email_queue`
- Verify `status = 'pending'` exists in queue
- Check Gmail token is valid

### High failure rate
- Check `/health` endpoint for error patterns
- Review logs: `docker compose logs --tail=100`
- Verify Mapbox token is valid (geocoding)

### Workers processing same items
- This shouldn't happen with `FOR UPDATE SKIP LOCKED`
- Check that both workers are using the same database
- Verify the `claim_email_queue_batch` function exists

### Stuck items not resetting
- Verify `reset_stale_email_queue` function exists
- Check `processing_started_at` column exists
- Manually run: `SELECT reset_stale_email_queue();`

## Code Structure

```
worker/
├── src/
│   ├── index.ts          # Main worker loop + health server
│   ├── supabase.ts       # Supabase service client
│   ├── claim.ts          # Queue claiming/completion
│   ├── gmail.ts          # Gmail API client
│   ├── geocode.ts        # Mapbox geocoding
│   ├── matching.ts       # Hunt plan matching
│   ├── process.ts        # Main processing logic
│   └── parsers/
│       ├── sylectus.ts   # Sylectus email parser
│       └── fullcircle.ts # Full Circle TMS parser
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── .env.example
```

## Security Notes

- **Never commit `.env` file** - it contains secrets
- **Service role key** grants full database access - keep secure
- **Gmail credentials** should be OAuth, not raw passwords
- Run workers as non-root user (Dockerfile sets `USER node`)
