-- Drop all existing RLS policies on load_emails
DROP POLICY IF EXISTS "Admin users can view load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Admin users can insert load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Admin users can update load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Admin users can delete load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Admins can view all load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Admins can insert load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Admins can update load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Admins can delete load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Authenticated users can view load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Authenticated users can insert load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Authenticated users can update load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Authenticated users can delete load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Service role can manage load emails" ON public.load_emails;

-- Create simple authenticated policies for load_emails
CREATE POLICY "load_emails_select" ON public.load_emails FOR SELECT TO authenticated USING (true);
CREATE POLICY "load_emails_insert" ON public.load_emails FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "load_emails_update" ON public.load_emails FOR UPDATE TO authenticated USING (true);
CREATE POLICY "load_emails_delete" ON public.load_emails FOR DELETE TO authenticated USING (true);

-- Drop all existing RLS policies on load_hunt_matches
DROP POLICY IF EXISTS "Admin users can view load hunt matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Admin users can insert load hunt matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Admin users can update load hunt matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Admin users can delete load hunt matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Admins can manage load_hunt_matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Authenticated users can view hunt matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Authenticated users can insert hunt matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Authenticated users can update hunt matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Authenticated users can delete hunt matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Service role can manage hunt matches" ON public.load_hunt_matches;

-- Create simple authenticated policies for load_hunt_matches
CREATE POLICY "hunt_matches_select" ON public.load_hunt_matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "hunt_matches_insert" ON public.load_hunt_matches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "hunt_matches_update" ON public.load_hunt_matches FOR UPDATE TO authenticated USING (true);
CREATE POLICY "hunt_matches_delete" ON public.load_hunt_matches FOR DELETE TO authenticated USING (true);

-- Drop all existing RLS policies on hunt_plans
DROP POLICY IF EXISTS "Admin users can view hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Admin users can insert hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Admin users can update hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Admin users can delete hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Admins can view all hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Admins can insert hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Admins can update hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Admins can delete hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Authenticated users can view hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Authenticated users can insert hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Authenticated users can update hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Authenticated users can delete hunt plans" ON public.hunt_plans;

-- Create simple authenticated policies for hunt_plans
CREATE POLICY "hunt_plans_select" ON public.hunt_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "hunt_plans_insert" ON public.hunt_plans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "hunt_plans_update" ON public.hunt_plans FOR UPDATE TO authenticated USING (true);
CREATE POLICY "hunt_plans_delete" ON public.hunt_plans FOR DELETE TO authenticated USING (true);

-- Drop all existing RLS policies on vehicles
DROP POLICY IF EXISTS "Admin users can view vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admin users can insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admin users can update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admin users can delete vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can view all vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can delete vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can view vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can delete vehicles" ON public.vehicles;

-- Create simple authenticated policies for vehicles
CREATE POLICY "vehicles_select" ON public.vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "vehicles_insert" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "vehicles_update" ON public.vehicles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "vehicles_delete" ON public.vehicles FOR DELETE TO authenticated USING (true);

-- Drop all existing RLS policies on dispatchers
DROP POLICY IF EXISTS "Admins can view all dispatchers" ON public.dispatchers;
DROP POLICY IF EXISTS "Admins can insert dispatchers" ON public.dispatchers;
DROP POLICY IF EXISTS "Admins can update dispatchers" ON public.dispatchers;
DROP POLICY IF EXISTS "Admins can delete dispatchers" ON public.dispatchers;

-- Create simple authenticated policies for dispatchers
CREATE POLICY "dispatchers_select" ON public.dispatchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "dispatchers_insert" ON public.dispatchers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "dispatchers_update" ON public.dispatchers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "dispatchers_delete" ON public.dispatchers FOR DELETE TO authenticated USING (true);

-- Drop all existing RLS policies on profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create simple authenticated policies for profiles
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING (true);

-- Drop all existing RLS policies on user_roles  
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

-- Create simple authenticated policies for user_roles
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated USING (true);