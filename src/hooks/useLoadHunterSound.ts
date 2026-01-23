// Sound and notification management hook for LoadHunter
// Extracted from LoadHunterTab.tsx for maintainability

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { SoundSettings } from '@/hooks/useUserPreferences';

// Default sound settings
const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  loadReceiveSound: 'notification',
  bidSentSound: 'success',
  volume: 50,
};

// Load sound settings from localStorage
export const loadSoundSettings = (): SoundSettings => {
  try {
    const saved = localStorage.getItem('loadHunterSoundSettings');
    if (saved) {
      return { ...DEFAULT_SOUND_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Error loading sound settings:', e);
  }
  return DEFAULT_SOUND_SETTINGS;
};

// Save sound settings to localStorage
export const saveSoundSettings = (settings: SoundSettings): void => {
  try {
    localStorage.setItem('loadHunterSoundSettings', JSON.stringify(settings));
  } catch (e) {
    console.error('Error saving sound settings:', e);
  }
};

// Get AI sound prompt based on sound ID
export const getSoundPrompt = (soundId: string): string => {
  const prompts: Record<string, string> = {
    load_receive: 'A short, upbeat notification chime indicating a new item has arrived. Modern, clean, professional.',
    bid_sent: 'A satisfying confirmation sound, like a successful transaction or send. Brief and positive.',
    match_found: 'An alert sound for an important match, slightly more urgent than a standard notification.',
    notification: 'A short, upbeat notification chime indicating a new item has arrived. Modern, clean, professional.',
    success: 'A satisfying confirmation sound, like a successful transaction or send. Brief and positive.',
  };
  return prompts[soundId] || prompts.notification;
};

interface UseLoadHunterSoundReturn {
  isSoundMuted: boolean;
  soundSettings: SoundSettings;
  notificationsEnabled: boolean;
  audioContext: AudioContext | null;
  toggleSound: () => Promise<void>;
  playSound: (soundId: string, force?: boolean) => Promise<void>;
  playAlertSound: (force?: boolean) => Promise<void>;
  playBidSentSound: () => Promise<void>;
  playFallbackSound: () => void;
  showSystemNotification: (title: string, body: string) => void;
  setSoundSettings: React.Dispatch<React.SetStateAction<SoundSettings>>;
}

export function useLoadHunterSound(): UseLoadHunterSoundReturn {
  const [isSoundMuted, setIsSoundMuted] = useState(false);
  const [soundSettings, setSoundSettingsState] = useState<SoundSettings>(loadSoundSettings());
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  
  // Sound generation refs
  const soundCacheRef = useRef<Map<string, string>>(new Map());
  const isGeneratingSoundRef = useRef<Record<string, boolean>>({});
  const aiSoundsUnavailableRef = useRef(false);
  const aiSoundsUnavailableToastShownRef = useRef(false);

  // Ensure refs are initialized
  const ensureSoundRefs = () => {
    if (!isGeneratingSoundRef.current) {
      isGeneratingSoundRef.current = {};
    }
  };

  // Request notification permission
  const requestNotificationPermission = async (): Promise<boolean> => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
        console.log('✅ Browser notifications enabled');
        return true;
      }
    }
    return false;
  };

  // Show system notification (works even when tab is inactive)
  const showSystemNotification = useCallback((title: string, body: string) => {
    if (!notificationsEnabled || Notification.permission !== 'granted') return;
    
    try {
      const notification = new Notification(title, {
        body,
        icon: '/pwa-192x192.png',
        tag: 'load-hunter-alert',
        requireInteraction: false,
      });
      
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      
      // Auto close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }, [notificationsEnabled]);

  // Fallback sound using Web Audio API
  const playFallbackSound = useCallback(() => {
    try {
      let ctx = audioContext;
      if (!ctx) {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(ctx);
      }
      
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
      
      console.log('✅ Fallback sound played');
    } catch (error) {
      console.error('❌ Error playing fallback sound:', error);
    }
  }, [audioContext]);

  // Main play sound function
  const playSound = useCallback(async (soundId: string, force = false) => {
    ensureSoundRefs();
    
    // Check if muted (unless forced)
    if (isSoundMuted && !force) {
      console.log('🔇 Sound muted, skipping');
      return;
    }

    const volume = soundSettings.volume / 100;

    // If AI sounds are unavailable, use fallback
    if (aiSoundsUnavailableRef.current) {
      playFallbackSound();
      return;
    }

    // Check cache first
    const cacheKey = `${soundId}_${volume}`;
    if (soundCacheRef.current.has(cacheKey)) {
      const cachedUrl = soundCacheRef.current.get(cacheKey)!;
      const audio = new Audio(cachedUrl);
      audio.volume = volume;
      await audio.play();
      console.log(`✅ Cached sound played: ${soundId}`);
      return;
    }

    // Generate AI sound
    if (!isGeneratingSoundRef.current[soundId]) {
      isGeneratingSoundRef.current[soundId] = true;

      try {
        const prompt = getSoundPrompt(soundId);
        const response = await supabase.functions.invoke('elevenlabs-sfx', {
          body: { prompt, duration_seconds: 2 }
        });

        if (!response.data) {
          throw new Error('No audio data received');
        }

        // Handle edge function response
        if (response.error) {
          throw new Error(response.error.message);
        }

        const audioBlob = new Blob([response.data], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);

        // Cache the generated sound
        soundCacheRef.current.set(cacheKey, audioUrl);

        // Play the sound
        const audio = new Audio(audioUrl);
        audio.volume = volume;
        await audio.play();
        console.log(`✅ AI sound generated and played: ${soundId}`);
      } catch (error) {
        console.error('Error generating AI sound, using fallback:', error);
        playFallbackSound();
      } finally {
        ensureSoundRefs();
        isGeneratingSoundRef.current[soundId] = false;
      }
    } else {
      // If already generating, use fallback
      playFallbackSound();
    }
  }, [isSoundMuted, soundSettings, playFallbackSound]);

  // Wrapper for backward compatibility
  const playAlertSound = useCallback(async (force = false) => {
    await playSound('load_receive', force);
  }, [playSound]);

  // Play bid sent sound
  const playBidSentSound = useCallback(async () => {
    await playSound('bid_sent', false);
  }, [playSound]);

  // Toggle sound on/off
  const toggleSound = useCallback(async () => {
    console.log('🔘 toggleSound clicked, current state:', isSoundMuted);
    
    const newMutedState = !isSoundMuted;
    setIsSoundMuted(newMutedState);
    
    console.log('🔘 New muted state:', newMutedState);
    
    // Initialize audio context and play test sound when unmuting
    if (!newMutedState) {
      console.log('🔊 Enabling sound alerts...');
      
      // Request notification permission for background alerts
      const notifGranted = await requestNotificationPermission();
      
      // Create audio context on user interaction
      if (!audioContext) {
        console.log('🎵 Creating AudioContext on user interaction');
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(ctx);
        
        // Resume if needed
        if (ctx.state === 'suspended') {
          ctx.resume().then(() => {
            console.log('🔓 AudioContext resumed');
          });
        }
      }
      
      // Play test sound
      setTimeout(() => {
        console.log('⏰ Playing test sound after delay');
        playAlertSound(true);
        if (notifGranted) {
          toast.success('Sound & background notifications enabled');
        } else {
          toast.success('Sound alerts enabled (enable browser notifications for background alerts)');
        }
      }, 100);
    } else {
      console.log('🔇 Sound alerts muted');
      toast.info('Sound alerts muted');
    }
  }, [isSoundMuted, audioContext, playAlertSound]);

  // Set sound settings wrapper
  const setSoundSettings = useCallback((settings: SoundSettings) => {
    setSoundSettingsState(settings);
    saveSoundSettings(settings);
  }, []);

  return {
    isSoundMuted,
    soundSettings,
    notificationsEnabled,
    audioContext,
    toggleSound,
    playSound,
    playAlertSound,
    playBidSentSound,
    playFallbackSound,
    showSystemNotification,
    setSoundSettings,
  };
}
