-- Add show_all_tab setting to dispatchers table (default false so new users don't see it)
ALTER TABLE public.dispatchers 
ADD COLUMN show_all_tab boolean DEFAULT false;

-- Update existing dispatchers to have show_all_tab = true (for current users/testing)
UPDATE public.dispatchers SET show_all_tab = true WHERE email = 'ben@nexustechsolution.com';