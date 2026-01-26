-- Patch screenshare_claim_session with required fixes
CREATE OR REPLACE FUNCTION public.screenshare_claim_session(p_session_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_tenant_id uuid;
  v_session RECORD;
  v_result jsonb;
BEGIN
  -- 1. Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- 2. Use server effective tenant (FIX #1)
  v_user_tenant_id := get_current_tenant_id();
  IF v_user_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active tenant context');
  END IF;
  
  -- 3. Find pending session by code in user's tenant (atomic lock)
  SELECT * INTO v_session
  FROM public.screen_share_sessions
  WHERE session_code = UPPER(p_session_code)
    AND tenant_id = v_user_tenant_id
    AND status = 'pending'
  FOR UPDATE;
  
  -- 4. Generic error - no existence leak (FIX #4)
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired code');
  END IF;
  
  -- 5. Prevent joining own session
  IF v_session.admin_user_id = v_user_id OR v_session.client_user_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot join your own session');
  END IF;
  
  -- 6. Claim the session based on who initiated (FIX #2 - prevent overwrite/hijack)
  IF v_session.initiated_by = 'admin' THEN
    -- Admin created session, client is joining -> set client_user_id
    IF v_session.client_user_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Session already claimed');
    END IF;
    
    UPDATE public.screen_share_sessions
    SET 
      client_user_id = v_user_id,
      status = 'active',
      connected_at = now()
    WHERE id = v_session.id;
  ELSE
    -- Client created session, admin is joining -> set admin_user_id
    IF v_session.admin_user_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Session already claimed');
    END IF;
    
    UPDATE public.screen_share_sessions
    SET 
      admin_user_id = v_user_id,
      status = 'active',
      connected_at = now()
    WHERE id = v_session.id;
  END IF;
  
  -- 7. Return the updated session
  SELECT jsonb_build_object(
    'success', true,
    'session', jsonb_build_object(
      'id', s.id,
      'session_code', s.session_code,
      'status', s.status,
      'initiated_by', s.initiated_by,
      'admin_user_id', s.admin_user_id,
      'client_user_id', s.client_user_id,
      'tenant_id', s.tenant_id,
      'created_at', s.created_at,
      'connected_at', s.connected_at
    ),
    'role', CASE 
      WHEN v_session.initiated_by = 'admin' THEN 'client'
      ELSE 'admin'
    END
  ) INTO v_result
  FROM public.screen_share_sessions s
  WHERE s.id = v_session.id;
  
  RETURN v_result;
END;
$$;