-- Add column to control carrier visibility in Fleet Financials tab
ALTER TABLE public.carriers 
ADD COLUMN show_in_fleet_financials boolean NOT NULL DEFAULT true;