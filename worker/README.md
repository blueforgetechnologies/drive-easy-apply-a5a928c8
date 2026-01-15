# Email Queue Worker

High-performance outbound email worker for multi-tenant TMS.  
Sends emails via **Resend API** from the `email_queue` table.

## Features

- **Atomic queue claiming** using `FOR UPDATE SKIP LOCKED`
- **Multi-worker safe** - no double-processing across replicas
- **Automatic stale job recovery** - resets stuck items every 60s
- **Health check HTTP endpoint** with Prometheus metrics
- **Structured logging** with JSON output in production
- **Graceful shutdown** handling

## Requirements

- Node.js 18+
- Supabase project with `email_queue` table
- Resend API key with verified domain

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=no-reply@yourdomain.com

# Optional
WORKER_ID=worker-1
HEALTH_PORT=8080
LOG_LEVEL=info
NODE_ENV=production
```

## Queue Table Schema

The worker expects these columns in `email_queue`:

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `status` | text | `pending`, `processing`, `sent`, `failed` |
| `to_email` | text | Recipient email address |
| `subject` | text | Email subject line |
| `body_html` | text | HTML email body |
| `body_text` | text | Plain text email body (fallback) |
| `from_email` | text | Optional sender email |
| `from_name` | text | Optional sender name |
| `attempts` | integer | Retry counter |
| `last_error` | text | Last error message |

## Usage

### Local Development

```bash
# Install dependencies
npm install

# Run with hot reload
npm run dev
```

### Production (Docker)

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Scale workers
docker-compose up -d --scale worker=2
```

## Inserting Test Emails

```sql
INSERT INTO email_queue (
  gmail_message_id,
  to_email,
  subject,
  body_html,
  status
) VALUES (
  'test-' || gen_random_uuid(),
  'test@example.com',
  'Test Email',
  '<h1>Hello!</h1><p>This is a test email.</p>',
  'pending'
);
```

## Health Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Full health status with metrics |
| `GET /ready` | Kubernetes readiness probe |
| `GET /metrics` | Prometheus-style metrics |

## State Transitions

```
pending → processing → sent
                    ↘ failed (after 3 retries)
```

- On **success**: status = `sent`, `processed_at` = now()
- On **failure**: status = `failed` (if attempts >= 3), else back to `pending`
- **Stale recovery**: Items stuck in `processing` > 5min are reset to `pending`

## Architecture

```
┌─────────────────────┐
│  Supabase DB        │
│  email_queue table  │
└─────────┬───────────┘
          │ claim_email_queue_batch()
          ▼
┌─────────────────────┐
│  Worker (VPS)       │
│  - Claims batch     │
│  - Sends via Resend │
│  - Updates status   │
└─────────────────────┘
```

Multiple workers can run safely - each claims items atomically via `FOR UPDATE SKIP LOCKED`.

## Code Structure

```
worker/
├── src/
│   ├── index.ts      # Main worker loop + health server
│   ├── supabase.ts   # Supabase service client
│   ├── claim.ts      # Queue claiming/completion
│   ├── resend.ts     # Resend API client
│   └── process.ts    # Email sending logic
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── .env.example
```

## VPS Auto-Deploy Setup

The worker auto-deploys via GitHub Actions when you push changes to `worker/**`.

### Required GitHub Secrets

Add these in **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Example | Description |
|--------|---------|-------------|
| `VPS_HOST` | `123.45.67.89` | Your VPS IP address |
| `VPS_USER` | `deploy` | SSH username on the VPS |
| `VPS_SSH_KEY` | (private key) | Full SSH private key for authentication |
| `VPS_PORT` | `22` | SSH port (usually 22) |
| `WORKER_PATH` | `/home/deploy/tms` | Path where repo is cloned on VPS |

### One-Time VPS Setup

```bash
# 1. SSH into your VPS
ssh user@your-vps-ip

# 2. Clone the repo
cd /home/deploy
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git tms
cd tms/worker

# 3. Create .env from example
cp .env.example .env
nano .env  # Fill in real values

# 4. Initial build
docker compose up -d --build
```

### Verify Deployment

After deploy, check the health endpoint:

```bash
curl http://your-vps-ip:8080/health
# Should return: {"status":"healthy","uptime":...}

curl http://your-vps-ip:8080/ready
# Should return: {"ready":true}
```

## Security Notes

- **Never commit `.env` file** - it contains secrets
- **Service role key** grants full database access - keep secure
- **Resend API key** should be kept confidential
- Run workers as non-root user (Dockerfile sets `USER node`)
