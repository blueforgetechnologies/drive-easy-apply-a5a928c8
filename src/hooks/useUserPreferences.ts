import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export interface SoundSettings {
  loadReceiveSound: string;
  bidSentSound: string;
  volume: number;
}

interface UserPreferences {
  show_column_lines: boolean;
  sound_settings: SoundSettings;
}

const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  loadReceiveSound: "notification",
  bidSentSound: "success",
  volume: 0.5,
};

export function useUserPreferences() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  const { data: preferences, isLoading, refetch } = useQuery({
    queryKey: ["user-preferences", userId],
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('[UserPreferences] Fetch error:', error);
        return null;
      }
      
      // Migrate from localStorage if no DB record exists
      if (!data) {
        const localShowLines = localStorage.getItem('fleet-financials-show-column-lines');
        const localSoundSettings = localStorage.getItem('soundSettings');
        
        if (localShowLines !== null || localSoundSettings !== null) {
          const migratedPrefs = {
            show_column_lines: localShowLines !== null ? localShowLines === 'true' : true,
            sound_settings: localSoundSettings ? JSON.parse(localSoundSettings) : DEFAULT_SOUND_SETTINGS,
          };
          
          // Save to DB
          await supabase.from('user_preferences').upsert({
            user_id: userId,
            ...migratedPrefs,
          }, { onConflict: 'user_id' });
          
          // Clear localStorage after migration
          localStorage.removeItem('fleet-financials-show-column-lines');
          localStorage.removeItem('soundSettings');
          
          return migratedPrefs as UserPreferences;
        }
      }
      
      if (!data) return null;
      
      const soundData = data.sound_settings as unknown as SoundSettings | null;
      return {
        show_column_lines: data.show_column_lines ?? true,
        sound_settings: soundData ?? DEFAULT_SOUND_SETTINGS,
      };
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (updates: Partial<UserPreferences>) => {
      if (!userId) throw new Error("Not authenticated");
      
      const upsertData: Record<string, unknown> = {
        user_id: userId,
        updated_at: new Date().toISOString(),
      };
      
      if (updates.show_column_lines !== undefined) {
        upsertData.show_column_lines = updates.show_column_lines;
      }
      if (updates.sound_settings !== undefined) {
        upsertData.sound_settings = updates.sound_settings;
      }
      
      const { data, error } = await supabase
        .from('user_preferences')
        .upsert(upsertData as any, {
          onConflict: 'user_id',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-preferences", userId] });
    },
  });

  const updateShowColumnLines = (value: boolean) => {
    updatePreferencesMutation.mutate({ show_column_lines: value });
  };

  const updateSoundSettings = (settings: SoundSettings) => {
    updatePreferencesMutation.mutate({ sound_settings: settings });
  };

  return {
    preferences,
    isLoading,
    refetch,
    showColumnLines: preferences?.show_column_lines ?? true,
    soundSettings: preferences?.sound_settings ?? DEFAULT_SOUND_SETTINGS,
    updateShowColumnLines,
    updateSoundSettings,
    isUpdating: updatePreferencesMutation.isPending,
  };
}
