import { useCallback, useRef, useEffect } from 'react';

// Singleton audio context for all sounds
let sharedAudioContext: AudioContext | null = null;
let clickSoundEnabled = true;
let clickVolume = 0.3;

// Load settings from localStorage
const loadClickSettings = () => {
  try {
    const saved = localStorage.getItem('clickSoundSettings');
    if (saved) {
      const parsed = JSON.parse(saved);
      clickSoundEnabled = parsed.enabled ?? true;
      clickVolume = parsed.volume ?? 0.3;
    }
  } catch (e) {
    console.error('Error loading click sound settings:', e);
  }
};

// Initialize on load
loadClickSettings();

// Listen for storage changes
if (typeof window !== 'undefined') {
  window.addEventListener('storage', loadClickSettings);
}

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  
  if (!sharedAudioContext) {
    try {
      sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.error('Failed to create AudioContext:', e);
      return null;
    }
  }
  
  // Resume if suspended (happens after user interaction requirement)
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume();
  }
  
  return sharedAudioContext;
};

// Pre-computed sound types for different button actions
type SoundType = 'click' | 'success' | 'soft' | 'toggle' | 'nav';

interface SoundConfig {
  frequency: number;
  frequency2?: number;
  duration: number;
  type: OscillatorType;
  volume: number;
  attack: number;
  decay: number;
}

const SOUND_CONFIGS: Record<SoundType, SoundConfig> = {
  // Modern, subtle click - slightly percussive
  click: {
    frequency: 1200,
    frequency2: 800,
    duration: 0.06,
    type: 'sine',
    volume: 0.15,
    attack: 0.001,
    decay: 0.05,
  },
  // Success/confirmation - gentle ascending
  success: {
    frequency: 880,
    frequency2: 1320,
    duration: 0.12,
    type: 'sine',
    volume: 0.12,
    attack: 0.01,
    decay: 0.1,
  },
  // Soft click for less prominent buttons
  soft: {
    frequency: 600,
    duration: 0.04,
    type: 'sine',
    volume: 0.08,
    attack: 0.001,
    decay: 0.035,
  },
  // Toggle on/off
  toggle: {
    frequency: 1000,
    frequency2: 700,
    duration: 0.08,
    type: 'triangle',
    volume: 0.1,
    attack: 0.002,
    decay: 0.07,
  },
  // Navigation click
  nav: {
    frequency: 500,
    frequency2: 650,
    duration: 0.05,
    type: 'sine',
    volume: 0.1,
    attack: 0.001,
    decay: 0.04,
  },
};

export const playClickSound = (type: SoundType = 'click') => {
  if (!clickSoundEnabled) return;
  
  const ctx = getAudioContext();
  if (!ctx) return;

  const config = SOUND_CONFIGS[type];
  const now = ctx.currentTime;

  // Create oscillator
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  // Optional: add subtle filter for warmth
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(4000, now);
  
  oscillator.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = config.type;
  oscillator.frequency.setValueAtTime(config.frequency, now);
  
  // Frequency sweep for more interesting sound
  if (config.frequency2) {
    oscillator.frequency.exponentialRampToValueAtTime(config.frequency2, now + config.duration * 0.5);
  }

  // Envelope
  const adjustedVolume = config.volume * clickVolume;
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(adjustedVolume, now + config.attack);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + config.duration);

  oscillator.start(now);
  oscillator.stop(now + config.duration);
};

// Hook version for components that need reactive behavior
export const useClickSound = () => {
  const playSound = useCallback((type: SoundType = 'click') => {
    playClickSound(type);
  }, []);

  return { playSound };
};

// Update settings
export const setClickSoundSettings = (enabled: boolean, volume: number = 0.3) => {
  clickSoundEnabled = enabled;
  clickVolume = volume;
  localStorage.setItem('clickSoundSettings', JSON.stringify({ enabled, volume }));
};

export const getClickSoundSettings = () => ({
  enabled: clickSoundEnabled,
  volume: clickVolume,
});

export default useClickSound;
