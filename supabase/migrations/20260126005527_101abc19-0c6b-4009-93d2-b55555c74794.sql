
-- Fix: Remove the problematic DEFAULT 'pending' on driver_status
-- New applications should have driver_status = NULL until explicitly hired

ALTER TABLE applications 
  ALTER COLUMN driver_status DROP DEFAULT;

-- Fix existing data: Reset driver_status to NULL for applications that are:
-- 1. Status = 'in_progress' (not submitted)
-- 2. Status = 'submitted' (submitted but not approved)
-- These should NOT be in the drivers list until explicitly hired via the Hire action

UPDATE applications
SET driver_status = NULL
WHERE (status IN ('in_progress', 'submitted', 'approved') AND driver_status = 'pending')
   OR (driver_status = 'pending' AND submitted_at IS NULL);
