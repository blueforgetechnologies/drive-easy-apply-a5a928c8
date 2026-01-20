
-- Add unique constraints to prevent duplicates (without SSN which doesn't exist)

-- Customers: unique MC number per tenant
CREATE UNIQUE INDEX IF NOT EXISTS customers_mc_number_tenant_unique 
ON customers (tenant_id, mc_number) 
WHERE mc_number IS NOT NULL AND mc_number != '';

-- Carriers: unique MC number per tenant
CREATE UNIQUE INDEX IF NOT EXISTS carriers_mc_number_tenant_unique 
ON carriers (tenant_id, mc_number) 
WHERE mc_number IS NOT NULL AND mc_number != '';

-- Carriers: unique DOT number per tenant
CREATE UNIQUE INDEX IF NOT EXISTS carriers_dot_number_tenant_unique 
ON carriers (tenant_id, dot_number) 
WHERE dot_number IS NOT NULL AND dot_number != '';

-- Vehicles: unique VIN per tenant
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_vin_tenant_unique 
ON vehicles (tenant_id, vin) 
WHERE vin IS NOT NULL AND vin != '';

-- Drivers (in applications table): unique license number per tenant
CREATE UNIQUE INDEX IF NOT EXISTS applications_license_number_tenant_unique 
ON applications (tenant_id, (license_info->>'license_number')) 
WHERE license_info->>'license_number' IS NOT NULL AND license_info->>'license_number' != '';
