-- Add UPDATE and DELETE policies for admins on applications table
CREATE POLICY "Admins can update applications"
ON applications
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete applications"
ON applications
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));