-- Create a sequence-based function for atomic invoice number generation per tenant
-- This prevents race conditions when multiple invoices are created simultaneously

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_number integer;
  v_current_max integer;
BEGIN
  -- Lock tenant row to prevent race conditions
  PERFORM 1 FROM tenants WHERE id = p_tenant_id FOR UPDATE;
  
  -- Get current max invoice number for this tenant
  SELECT COALESCE(MAX(invoice_number::integer), 1000000)
  INTO v_current_max
  FROM invoices
  WHERE tenant_id = p_tenant_id
    AND invoice_number ~ '^\d+$';
  
  -- Increment
  v_next_number := v_current_max + 1;
  
  RETURN v_next_number::text;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO service_role;