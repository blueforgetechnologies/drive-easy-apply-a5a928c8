-- Ensure all triggers are re-enabled
ALTER TABLE vehicles ENABLE TRIGGER enforce_tenant_isolation_trigger;
ALTER TABLE carriers ENABLE TRIGGER enforce_tenant_isolation_trigger;
ALTER TABLE payees ENABLE TRIGGER enforce_tenant_isolation_trigger;
ALTER TABLE applications ENABLE TRIGGER enforce_tenant_isolation_trigger;
ALTER TABLE dispatchers ENABLE TRIGGER enforce_tenant_isolation_trigger;