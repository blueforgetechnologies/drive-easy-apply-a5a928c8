-- Drop and recreate the INSERT policy for applications to ensure it works properly
DROP POLICY IF EXISTS "Anyone can insert applications" ON public.applications;

-- Create a more explicit policy that allows anonymous and authenticated users to insert
CREATE POLICY "Anyone can insert applications"
  ON public.applications
  FOR INSERT
  TO public
  WITH CHECK (true);