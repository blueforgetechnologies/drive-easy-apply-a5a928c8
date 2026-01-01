-- Fix ui_action_registry: change ai_features_enabled to ai_parsing_enabled
UPDATE ui_action_registry
SET feature_flag_key = 'ai_parsing_enabled'
WHERE feature_flag_key = 'ai_features_enabled';