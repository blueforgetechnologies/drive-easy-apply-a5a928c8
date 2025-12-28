-- Add expense_group_columns to user_preferences table
ALTER TABLE public.user_preferences 
ADD COLUMN IF NOT EXISTS expense_group_columns text[] DEFAULT NULL;

-- Add expense_group_collapsed to track collapsed state
ALTER TABLE public.user_preferences 
ADD COLUMN IF NOT EXISTS expense_group_collapsed boolean DEFAULT true;