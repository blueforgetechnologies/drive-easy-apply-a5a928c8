
-- Delete redundant/legacy feature flags that are duplicates of active ones
-- bid_automation → keep bid_automation_enabled
-- load_hunter → keep load_hunter_enabled  
-- load_hunter_geocoding → keep geocoding_enabled

-- First remove any channel defaults referencing these flags
DELETE FROM release_channel_feature_flags 
WHERE feature_flag_id IN (
  '79e7772b-07d1-4c6e-bd89-c24b5dd50cf8', -- bid_automation
  '9be96591-9b9b-4e9e-b68b-210ea645e7ca', -- load_hunter
  '4476aa4e-ae66-425e-9b11-693294d9e7c7'  -- load_hunter_geocoding
);

-- Remove any tenant overrides referencing these flags
DELETE FROM tenant_feature_flags 
WHERE feature_flag_id IN (
  '79e7772b-07d1-4c6e-bd89-c24b5dd50cf8',
  '9be96591-9b9b-4e9e-b68b-210ea645e7ca',
  '4476aa4e-ae66-425e-9b11-693294d9e7c7'
);

-- Remove any audit log entries referencing these flags
DELETE FROM feature_flag_audit_log 
WHERE feature_flag_id IN (
  '79e7772b-07d1-4c6e-bd89-c24b5dd50cf8',
  '9be96591-9b9b-4e9e-b68b-210ea645e7ca',
  '4476aa4e-ae66-425e-9b11-693294d9e7c7'
);

-- Finally delete the redundant feature flags
DELETE FROM feature_flags 
WHERE id IN (
  '79e7772b-07d1-4c6e-bd89-c24b5dd50cf8', -- bid_automation
  '9be96591-9b9b-4e9e-b68b-210ea645e7ca', -- load_hunter
  '4476aa4e-ae66-425e-9b11-693294d9e7c7'  -- load_hunter_geocoding
);
