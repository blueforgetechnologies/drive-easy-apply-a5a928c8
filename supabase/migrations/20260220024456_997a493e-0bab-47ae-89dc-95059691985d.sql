
-- 1) Ensure pg_net extension exists
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2) Create trigger function
CREATE OR REPLACE FUNCTION public.ops_alerts_notify_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  -- Skip green status - no alert needed
  IF NEW.status = 'green' THEN
    RETURN NEW;
  END IF;

  -- Build JSON payload from the new row
  v_payload := jsonb_build_object(
    'id',                    NEW.id,
    'created_at',            NEW.created_at,
    'status',                NEW.status,
    'pending_30m',           NEW.pending_30m,
    'lag_seconds',           NEW.lag_seconds,
    'workers_seen_5m',       NEW.workers_seen_5m,
    'heartbeat_age_seconds', NEW.heartbeat_age_seconds,
    'note',                  NEW.note
  );

  -- Fire-and-forget HTTP POST to the ops-alert-email Edge Function
  PERFORM net.http_post(
    url     := 'https://vvbdmjjovzcfmfqywoty.supabase.co/functions/v1/ops-alert-email',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := v_payload
  );

  RETURN NEW;
END;
$$;

-- 3) Create the trigger
DROP TRIGGER IF EXISTS trg_ops_alerts_notify_email ON public.ops_alerts;

CREATE TRIGGER trg_ops_alerts_notify_email
  AFTER INSERT ON public.ops_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.ops_alerts_notify_email();
