-- =====================================================
-- TENANT-SCOPED RLS POLICIES
-- Replace has_role('admin') with is_tenant_member() for all tenant-owned tables
-- Tenant admins are now restricted to their own tenant
-- Only platform admins (via service-role) can see cross-tenant
-- =====================================================

-- Helper function to check if user is tenant member OR platform admin
CREATE OR REPLACE FUNCTION public.can_access_tenant(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        is_platform_admin(_user_id) 
        OR is_tenant_member(_user_id, _tenant_id)
$$;

-- =====================================================
-- APPLICATIONS TABLE
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all applications" ON public.applications;
DROP POLICY IF EXISTS "Admins can insert applications" ON public.applications;
DROP POLICY IF EXISTS "Admins can update applications" ON public.applications;
DROP POLICY IF EXISTS "Admins can delete applications" ON public.applications;
DROP POLICY IF EXISTS "Dispatchers can view applications" ON public.applications;

CREATE POLICY "Tenant members can view applications"
    ON public.applications FOR SELECT
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert applications"
    ON public.applications FOR INSERT
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update applications"
    ON public.applications FOR UPDATE
    USING (can_access_tenant(auth.uid(), tenant_id))
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete applications"
    ON public.applications FOR DELETE
    USING (can_access_tenant(auth.uid(), tenant_id));

-- =====================================================
-- CARRIERS TABLE
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all carriers" ON public.carriers;
DROP POLICY IF EXISTS "Admins can insert carriers" ON public.carriers;
DROP POLICY IF EXISTS "Admins can update carriers" ON public.carriers;
DROP POLICY IF EXISTS "Admins can delete carriers" ON public.carriers;
DROP POLICY IF EXISTS "Dispatchers can view carriers" ON public.carriers;

CREATE POLICY "Tenant members can view carriers"
    ON public.carriers FOR SELECT
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert carriers"
    ON public.carriers FOR INSERT
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update carriers"
    ON public.carriers FOR UPDATE
    USING (can_access_tenant(auth.uid(), tenant_id))
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete carriers"
    ON public.carriers FOR DELETE
    USING (can_access_tenant(auth.uid(), tenant_id));

-- =====================================================
-- CONTACTS TABLE
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins can insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins can update contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins can delete contacts" ON public.contacts;

CREATE POLICY "Tenant members can view contacts"
    ON public.contacts FOR SELECT
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert contacts"
    ON public.contacts FOR INSERT
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update contacts"
    ON public.contacts FOR UPDATE
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete contacts"
    ON public.contacts FOR DELETE
    USING (can_access_tenant(auth.uid(), tenant_id));

-- =====================================================
-- CUSTOMERS TABLE
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can update customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can delete customers" ON public.customers;
DROP POLICY IF EXISTS "Dispatchers can view customers" ON public.customers;

CREATE POLICY "Tenant members can view customers"
    ON public.customers FOR SELECT
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert customers"
    ON public.customers FOR INSERT
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update customers"
    ON public.customers FOR UPDATE
    USING (can_access_tenant(auth.uid(), tenant_id))
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete customers"
    ON public.customers FOR DELETE
    USING (can_access_tenant(auth.uid(), tenant_id));

-- =====================================================
-- DISPATCHERS TABLE
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all dispatchers" ON public.dispatchers;
DROP POLICY IF EXISTS "Admins can insert dispatchers" ON public.dispatchers;
DROP POLICY IF EXISTS "Admins can update dispatchers" ON public.dispatchers;
DROP POLICY IF EXISTS "Admins can delete dispatchers" ON public.dispatchers;

CREATE POLICY "Tenant members can view dispatchers"
    ON public.dispatchers FOR SELECT
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert dispatchers"
    ON public.dispatchers FOR INSERT
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update dispatchers"
    ON public.dispatchers FOR UPDATE
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete dispatchers"
    ON public.dispatchers FOR DELETE
    USING (can_access_tenant(auth.uid(), tenant_id));

-- =====================================================
-- DRIVER_INVITES TABLE
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all driver invites" ON public.driver_invites;
DROP POLICY IF EXISTS "Admins can insert driver invites" ON public.driver_invites;
DROP POLICY IF EXISTS "Admins can delete driver invites" ON public.driver_invites;

CREATE POLICY "Tenant members can view driver invites"
    ON public.driver_invites FOR SELECT
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert driver invites"
    ON public.driver_invites FOR INSERT
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete driver invites"
    ON public.driver_invites FOR DELETE
    USING (can_access_tenant(auth.uid(), tenant_id));

-- =====================================================
-- EXPENSES TABLE
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins can insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins can update expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins can delete expenses" ON public.expenses;

CREATE POLICY "Tenant members can view expenses"
    ON public.expenses FOR SELECT
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert expenses"
    ON public.expenses FOR INSERT
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update expenses"
    ON public.expenses FOR UPDATE
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete expenses"
    ON public.expenses FOR DELETE
    USING (can_access_tenant(auth.uid(), tenant_id));

-- =====================================================
-- HUNT_PLANS TABLE
-- =====================================================
DROP POLICY IF EXISTS "Dispatchers can view all hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Dispatchers can insert hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Dispatchers can update hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Dispatchers can delete hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Users can view own hunt plans or admins view all" ON public.hunt_plans;
DROP POLICY IF EXISTS "Users can create own hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Users can update own hunt plans or admins update all" ON public.hunt_plans;
DROP POLICY IF EXISTS "Users can delete own hunt plans or admins delete all" ON public.hunt_plans;

CREATE POLICY "Tenant members can view hunt plans"
    ON public.hunt_plans FOR SELECT
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert hunt plans"
    ON public.hunt_plans FOR INSERT
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update hunt plans"
    ON public.hunt_plans FOR UPDATE
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete hunt plans"
    ON public.hunt_plans FOR DELETE
    USING (can_access_tenant(auth.uid(), tenant_id));

-- =====================================================
-- INVOICES TABLE
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can delete invoices" ON public.invoices;

CREATE POLICY "Tenant members can view invoices"
    ON public.invoices FOR SELECT
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert invoices"
    ON public.invoices FOR INSERT
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update invoices"
    ON public.invoices FOR UPDATE
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete invoices"
    ON public.invoices FOR DELETE
    USING (can_access_tenant(auth.uid(), tenant_id));

-- =====================================================
-- LOAD_EXPENSES TABLE
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all load expenses" ON public.load_expenses;
DROP POLICY IF EXISTS "Admins can insert load expenses" ON public.load_expenses;
DROP POLICY IF EXISTS "Admins can update load expenses" ON public.load_expenses;
DROP POLICY IF EXISTS "Admins can delete load expenses" ON public.load_expenses;

CREATE POLICY "Tenant members can view load expenses"
    ON public.load_expenses FOR SELECT
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert load expenses"
    ON public.load_expenses FOR INSERT
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update load expenses"
    ON public.load_expenses FOR UPDATE
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete load expenses"
    ON public.load_expenses FOR DELETE
    USING (can_access_tenant(auth.uid(), tenant_id));

-- =====================================================
-- LOADS TABLE
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all loads" ON public.loads;
DROP POLICY IF EXISTS "Admins can insert loads" ON public.loads;
DROP POLICY IF EXISTS "Admins can update loads" ON public.loads;
DROP POLICY IF EXISTS "Admins can delete loads" ON public.loads;
DROP POLICY IF EXISTS "Dispatchers can view loads" ON public.loads;
DROP POLICY IF EXISTS "Dispatchers can insert loads" ON public.loads;
DROP POLICY IF EXISTS "Dispatchers can update loads" ON public.loads;

CREATE POLICY "Tenant members can view loads"
    ON public.loads FOR SELECT
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert loads"
    ON public.loads FOR INSERT
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update loads"
    ON public.loads FOR UPDATE
    USING (can_access_tenant(auth.uid(), tenant_id))
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete loads"
    ON public.loads FOR DELETE
    USING (can_access_tenant(auth.uid(), tenant_id));

-- =====================================================
-- LOCATIONS TABLE
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all locations" ON public.locations;
DROP POLICY IF EXISTS "Admins can insert locations" ON public.locations;
DROP POLICY IF EXISTS "Admins can update locations" ON public.locations;
DROP POLICY IF EXISTS "Admins can delete locations" ON public.locations;

CREATE POLICY "Tenant members can view locations"
    ON public.locations FOR SELECT
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert locations"
    ON public.locations FOR INSERT
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update locations"
    ON public.locations FOR UPDATE
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete locations"
    ON public.locations FOR DELETE
    USING (can_access_tenant(auth.uid(), tenant_id));

-- =====================================================
-- PAYEES TABLE
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all payees" ON public.payees;
DROP POLICY IF EXISTS "Admins can insert payees" ON public.payees;
DROP POLICY IF EXISTS "Admins can update payees" ON public.payees;
DROP POLICY IF EXISTS "Admins can delete payees" ON public.payees;

CREATE POLICY "Tenant members can view payees"
    ON public.payees FOR SELECT
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert payees"
    ON public.payees FOR INSERT
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update payees"
    ON public.payees FOR UPDATE
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete payees"
    ON public.payees FOR DELETE
    USING (can_access_tenant(auth.uid(), tenant_id));

-- =====================================================
-- SETTLEMENTS TABLE
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all settlements" ON public.settlements;
DROP POLICY IF EXISTS "Admins can insert settlements" ON public.settlements;
DROP POLICY IF EXISTS "Admins can update settlements" ON public.settlements;
DROP POLICY IF EXISTS "Admins can delete settlements" ON public.settlements;

CREATE POLICY "Tenant members can view settlements"
    ON public.settlements FOR SELECT
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert settlements"
    ON public.settlements FOR INSERT
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update settlements"
    ON public.settlements FOR UPDATE
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete settlements"
    ON public.settlements FOR DELETE
    USING (can_access_tenant(auth.uid(), tenant_id));

-- =====================================================
-- VEHICLES TABLE
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can delete vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Dispatchers can view vehicles" ON public.vehicles;

CREATE POLICY "Tenant members can view vehicles"
    ON public.vehicles FOR SELECT
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert vehicles"
    ON public.vehicles FOR INSERT
    WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update vehicles"
    ON public.vehicles FOR UPDATE
    USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete vehicles"
    ON public.vehicles FOR DELETE
    USING (can_access_tenant(auth.uid(), tenant_id));