-- Create table for user Fleet Financials column preferences
CREATE TABLE public.user_fleet_column_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  columns JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE public.user_fleet_column_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own column preferences" 
ON public.user_fleet_column_preferences 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own column preferences" 
ON public.user_fleet_column_preferences 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own column preferences" 
ON public.user_fleet_column_preferences 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_fleet_column_preferences_updated_at
BEFORE UPDATE ON public.user_fleet_column_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();