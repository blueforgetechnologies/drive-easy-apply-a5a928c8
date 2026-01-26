-- Enable realtime for tables that need live count updates
-- Using IF NOT EXISTS pattern via DO block to avoid errors for already-added tables

DO $$ 
BEGIN
  -- Business Manager tables
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'vehicles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'carriers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.carriers;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'payees'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payees;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'dispatchers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatchers;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'customers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'driver_invites'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_invites;
  END IF;

  -- Operations tables
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'loads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.loads;
  END IF;

  -- Accounting tables
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'invoices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'settlements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.settlements;
  END IF;

  -- load_emails
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'load_emails'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.load_emails;
  END IF;
END $$;