-- Add DELETE policy for driver invites
CREATE POLICY "Admins can delete driver invites"
ON driver_invites
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));