-- Disable tenant isolation triggers temporarily
ALTER TABLE applications DISABLE TRIGGER enforce_tenant_isolation_trigger;
ALTER TABLE vehicles DISABLE TRIGGER enforce_tenant_isolation_trigger;
ALTER TABLE hunt_plans DISABLE TRIGGER enforce_tenant_isolation_trigger;

-- Move applications (drivers) back to Default
UPDATE applications
SET tenant_id = '2cd7ce28-d7ec-42cc-8f61-418329650212'
WHERE tenant_id = '0b611a2e-3182-4c56-95be-ad5637f53eac';

-- Move vehicles back to Default
UPDATE vehicles
SET tenant_id = '2cd7ce28-d7ec-42cc-8f61-418329650212'
WHERE tenant_id = '0b611a2e-3182-4c56-95be-ad5637f53eac';

-- Move hunt_plans back to Default
UPDATE hunt_plans
SET tenant_id = '2cd7ce28-d7ec-42cc-8f61-418329650212'
WHERE tenant_id = '0b611a2e-3182-4c56-95be-ad5637f53eac';

-- Re-enable triggers
ALTER TABLE applications ENABLE TRIGGER enforce_tenant_isolation_trigger;
ALTER TABLE vehicles ENABLE TRIGGER enforce_tenant_isolation_trigger;
ALTER TABLE hunt_plans ENABLE TRIGGER enforce_tenant_isolation_trigger;