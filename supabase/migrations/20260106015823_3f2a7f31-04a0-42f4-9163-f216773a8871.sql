-- Fix the recursive reset_stale_email_queue function
-- Replace with non-recursive implementation that unlocks stale rows
-- Uses actual columns: processing_started_at, status (not locked_at/locked_by)

create or replace function public.reset_stale_email_queue()
returns integer
language sql
as $$
  with updated as (
    update public.email_queue
    set
      status = 'pending',
      processing_started_at = null
    where status = 'processing'
      and processing_started_at is not null
      and processing_started_at < now() - interval '5 minutes'
    returning 1
  )
  select count(*)::integer from updated;
$$;