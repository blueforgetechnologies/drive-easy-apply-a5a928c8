
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  invite_record RECORD;
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  );
  
  -- Check if user was invited (case-insensitive email match)
  SELECT * INTO invite_record 
  FROM public.invites 
  WHERE LOWER(email) = LOWER(new.email) AND accepted_at IS NULL
  LIMIT 1;
  
  -- If invited, assign admin role, add to tenant, and mark invite as accepted
  IF FOUND THEN
    -- Assign admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'admin')
    ON CONFLICT DO NOTHING;
    
    -- Add user to tenant_users if tenant_id exists on invite
    IF invite_record.tenant_id IS NOT NULL THEN
      INSERT INTO public.tenant_users (user_id, tenant_id, role)
      VALUES (new.id, invite_record.tenant_id, 'admin')
      ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = 'admin', is_active = true;
    END IF;
    
    -- Mark invite as accepted
    UPDATE public.invites 
    SET accepted_at = now()
    WHERE id = invite_record.id;
  END IF;
  
  RETURN new;
END;
$function$;
