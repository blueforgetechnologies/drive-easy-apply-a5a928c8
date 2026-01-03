# Email Queue Worker

VPS-based worker for processing the email queue with <20 second latency.

## Architecture

- **Atomic claiming**: Uses `FOR UPDATE SKIP LOCKED` to prevent double-processing
- **Duplicate prevention**: Database unique constraint on `(load_email_id, hunt_plan_id)`
- **Stale recovery**: Automatically resets items stuck in `processing` for >5 minutes
- **Multi-worker safe**: Run 2+ instances without conflicts

## Quick Start

1. Copy environment file:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development:
   ```bash
   npm run dev
   ```

4. Build and run production:
   ```bash
   npm run build
   npm start
   ```

## Docker Deployment

```bash
# Build and run 2 workers
docker compose up -d

# Scale to 4 workers
docker compose up -d --scale worker=4

# View logs
docker compose logs -f

# Stop
docker compose down
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (not anon!) |
| `GMAIL_CLIENT_ID` | Yes | Gmail OAuth client ID |
| `GMAIL_CLIENT_SECRET` | Yes | Gmail OAuth client secret |
| `VITE_MAPBOX_TOKEN` | Yes | Mapbox access token for geocoding |

## Database Functions (Created by Migration)

- `claim_email_queue_batch(p_batch_size)` - Atomically claims items
- `reset_stale_email_queue()` - Resets stuck items
- `complete_email_queue_item(p_id)` - Marks item as completed
- `fail_email_queue_item(p_id, p_error, p_attempts)` - Marks item as failed

## Worker Behavior

1. Every 3 seconds: claim up to 25 pending items
2. Process items concurrently (5 at a time)
3. For each item:
   - Fetch email from Gmail API
   - Parse based on source (Sylectus / Full Circle TMS)
   - Apply parser hints from database
   - Geocode origin location (with caching)
   - Insert into `load_emails`
   - Match against active hunt plans
   - Mark queue item as completed/failed
4. Every 60 seconds: reset stale items

## Code Structure

```
worker/
├── src/
│   ├── index.ts        # Main worker loop
│   ├── supabase.ts     # Supabase service client
│   ├── claim.ts        # Queue claiming/completion
│   ├── gmail.ts        # Gmail API client
│   ├── geocode.ts      # Mapbox geocoding
│   ├── matching.ts     # Hunt plan matching
│   ├── process.ts      # Main processing logic
│   └── parsers/
│       ├── sylectus.ts   # Sylectus email parser
│       └── fullcircle.ts # Full Circle TMS parser
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Extracted from Edge Function

The following logic was extracted from `supabase/functions/process-email-queue/index.ts`:

- `parseSylectusEmail()` → `src/parsers/sylectus.ts`
- `parseFullCircleTMSEmail()` → `src/parsers/fullcircle.ts`
- `geocodeLocation()` → `src/geocode.ts`
- `lookupCityFromZip()` → `src/geocode.ts`
- `matchLoadToHunts()` → `src/matching.ts`
- `applyParserHints()` → `src/process.ts`
