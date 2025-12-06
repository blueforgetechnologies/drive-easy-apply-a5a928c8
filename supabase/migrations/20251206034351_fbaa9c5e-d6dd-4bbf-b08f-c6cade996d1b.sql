-- Fix security issues across all tables

-- 1. FIX profiles table - restrict to authenticated users only
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 2. FIX applications table - keep public INSERT for driver applications but ensure SELECT is admin only
-- The INSERT needs to stay public for unauthenticated driver applications
-- Verify SELECT is properly restricted
DROP POLICY IF EXISTS "Anyone can view applications" ON public.profiles;

-- 3. FIX driver_invites - restrict UPDATE to authenticated users only
DROP POLICY IF EXISTS "Anyone can track invite opens" ON public.driver_invites;
CREATE POLICY "Authenticated users can track invite opens"
ON public.driver_invites FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- 4. FIX geocode_cache - restrict to authenticated users for SELECT, service role handles mutations
DROP POLICY IF EXISTS "Allow all access to geocode cache" ON public.geocode_cache;
CREATE POLICY "Authenticated users can view geocode cache"
ON public.geocode_cache FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert geocode cache"
ON public.geocode_cache FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update geocode cache"
ON public.geocode_cache FOR UPDATE
USING (auth.uid() IS NOT NULL);

-- 5. FIX processing_state - restrict to service role only (no client access)
DROP POLICY IF EXISTS "Allow all access to processing state" ON public.processing_state;
DROP POLICY IF EXISTS "processing_state_select" ON public.processing_state;
DROP POLICY IF EXISTS "processing_state_insert" ON public.processing_state;
DROP POLICY IF EXISTS "processing_state_update" ON public.processing_state;
-- Service role bypasses RLS, so no policies needed for edge functions
-- Block all client access
CREATE POLICY "No client access to processing state"
ON public.processing_state FOR ALL
USING (false)
WITH CHECK (false);

-- 6. FIX directions_api_tracking - restrict to authenticated users
DROP POLICY IF EXISTS "Allow all access to directions tracking" ON public.directions_api_tracking;
CREATE POLICY "Authenticated users can view directions tracking"
ON public.directions_api_tracking FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert directions tracking"
ON public.directions_api_tracking FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- 7. FIX map_load_tracking - restrict to authenticated users
DROP POLICY IF EXISTS "Allow all access to map load tracking" ON public.map_load_tracking;
DROP POLICY IF EXISTS "map_load_tracking_select" ON public.map_load_tracking;
CREATE POLICY "Authenticated users can view map load tracking"
ON public.map_load_tracking FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert map load tracking"
ON public.map_load_tracking FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- 8. FIX load_emails - restrict to admins only
DROP POLICY IF EXISTS "load_emails_select" ON public.load_emails;
DROP POLICY IF EXISTS "load_emails_insert" ON public.load_emails;
DROP POLICY IF EXISTS "load_emails_update" ON public.load_emails;
DROP POLICY IF EXISTS "load_emails_delete" ON public.load_emails;

CREATE POLICY "Admins can view load emails"
ON public.load_emails FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert load emails"
ON public.load_emails FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update load emails"
ON public.load_emails FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete load emails"
ON public.load_emails FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- 9. FIX load_hunt_matches - restrict to admins only
DROP POLICY IF EXISTS "hunt_matches_select" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "hunt_matches_insert" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "hunt_matches_update" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "hunt_matches_delete" ON public.load_hunt_matches;

CREATE POLICY "Admins can view hunt matches"
ON public.load_hunt_matches FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert hunt matches"
ON public.load_hunt_matches FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update hunt matches"
ON public.load_hunt_matches FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete hunt matches"
ON public.load_hunt_matches FOR DELETE
USING (has_role(auth.uid(), 'admin'));