
-- Disable only the tenant isolation triggers
ALTER TABLE applications DISABLE TRIGGER enforce_tenant_isolation_trigger;
ALTER TABLE vehicles DISABLE TRIGGER enforce_tenant_isolation_trigger;
ALTER TABLE hunt_plans DISABLE TRIGGER enforce_tenant_isolation_trigger;

-- Move applications (drivers) from Default to Talbi
UPDATE applications 
SET tenant_id = '0b611a2e-3182-4c56-95be-ad5637f53eac'
WHERE tenant_id = '2cd7ce28-d7ec-42cc-8f61-418329650212';

-- Move vehicles from Default to Talbi  
UPDATE vehicles 
SET tenant_id = '0b611a2e-3182-4c56-95be-ad5637f53eac'
WHERE tenant_id = '2cd7ce28-d7ec-42cc-8f61-418329650212';

-- Move hunt_plans from Default to Talbi
UPDATE hunt_plans 
SET tenant_id = '0b611a2e-3182-4c56-95be-ad5637f53eac'
WHERE tenant_id = '2cd7ce28-d7ec-42cc-8f61-418329650212';

-- Re-enable triggers
ALTER TABLE applications ENABLE TRIGGER enforce_tenant_isolation_trigger;
ALTER TABLE vehicles ENABLE TRIGGER enforce_tenant_isolation_trigger;
ALTER TABLE hunt_plans ENABLE TRIGGER enforce_tenant_isolation_trigger;
