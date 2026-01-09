import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Settings, Play, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useUserPreferences, type SoundSettings } from "@/hooks/useUserPreferences";

interface SoundOption {
  id: string;
  label: string;
  prompt: string;
}

const SOUND_OPTIONS: SoundOption[] = [
  { id: 'chime', label: 'Digital Chime', prompt: 'Short digital notification chime, two ascending tones, clean and modern alert sound' },
  { id: 'bell', label: 'Soft Bell', prompt: 'Gentle bell notification sound, single soft ding, pleasant and non-intrusive' },
  { id: 'ping', label: 'Quick Ping', prompt: 'Quick digital ping sound, short and crisp, high-tech notification' },
  { id: 'success', label: 'Success Tone', prompt: 'Triumphant success sound, short ascending musical notes, positive and uplifting' },
  { id: 'alert', label: 'Alert Beep', prompt: 'Short alert beep, attention-grabbing but not alarming, professional notification' },
  { id: 'whoosh', label: 'Whoosh', prompt: 'Quick digital whoosh sound, fast swooshing motion, modern and sleek' },
];

const DEFAULT_SETTINGS: SoundSettings = {
  loadReceiveSound: 'chime',
  bidSentSound: 'success',
  volume: 0.5,
};

interface SoundSettingsDialogProps {
  onSettingsChange?: (settings: SoundSettings) => void;
  trigger?: React.ReactNode;
}

export function SoundSettingsDialog({ onSettingsChange, trigger }: SoundSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const { soundSettings, updateSoundSettings, isLoading: prefsLoading } = useUserPreferences();
  const [localSettings, setLocalSettings] = useState<SoundSettings>(DEFAULT_SETTINGS);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const soundCacheRef = useRef<Map<string, string>>(new Map());
  const aiSoundsUnavailableRef = useRef(false);
  const aiSoundsUnavailableToastShownRef = useRef(false);
  const previewAudioContextRef = useRef<AudioContext | null>(null);
  
  // Sync local state with database settings
  useEffect(() => {
    if (soundSettings) {
      setLocalSettings(soundSettings);
    }
  }, [soundSettings]);

  const ensureCacheRef = () => {
    if (!(soundCacheRef.current instanceof Map)) {
      (soundCacheRef as any).current = new Map<string, string>();
    }
  };

  const playFallbackPreview = () => {
    try {
      let ctx = previewAudioContextRef.current;
      if (!ctx) {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        previewAudioContextRef.current = ctx;
      }

      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(900, ctx.currentTime);
      oscillator.frequency.setValueAtTime(700, ctx.currentTime + 0.08);
      oscillator.type = 'sine';

      const vol = Math.max(0, Math.min(1, localSettings.volume));
      gainNode.gain.setValueAtTime(0.25 * vol, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.error('Fallback preview sound failed:', e);
    }
  };

  // Save settings to database and notify parent
  const saveSettings = (newSettings: SoundSettings) => {
    setLocalSettings(newSettings);
    updateSoundSettings(newSettings);
    onSettingsChange?.(newSettings);
  };

  const handleLoadSoundChange = (value: string) => {
    saveSettings({ ...localSettings, loadReceiveSound: value });
  };

  const handleBidSoundChange = (value: string) => {
    saveSettings({ ...localSettings, bidSentSound: value });
  };

  const handleVolumeChange = (value: number[]) => {
    saveSettings({ ...localSettings, volume: value[0] / 100 });
  };

  const previewSound = async (_soundId: string) => {
    // ElevenLabs disabled - always use fallback beep
    playFallbackPreview();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="h-4 w-4" />
            Sound Settings
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Sound Settings
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Volume Control */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Volume: {Math.round(localSettings.volume * 100)}%</Label>
            <Slider
              value={[Math.round(localSettings.volume * 100)]}
              onValueChange={handleVolumeChange}
              max={100}
              step={5}
              className="w-full"
            />
          </div>

          {/* Load Receive Sound */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">New Load Match Sound</Label>
            <p className="text-xs text-muted-foreground">Plays when a new load matches your hunt criteria</p>
            <div className="flex gap-2">
              <Select value={localSettings.loadReceiveSound} onValueChange={handleLoadSoundChange}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOUND_OPTIONS.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => previewSound(localSettings.loadReceiveSound)}
                disabled={isGenerating !== null}
              >
                {isGenerating === localSettings.loadReceiveSound ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Bid Sent Sound */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Bid Sent Sound</Label>
            <p className="text-xs text-muted-foreground">Plays when you successfully send a bid</p>
            <div className="flex gap-2">
              <Select value={localSettings.bidSentSound} onValueChange={handleBidSoundChange}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOUND_OPTIONS.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => previewSound(localSettings.bidSentSound)}
                disabled={isGenerating !== null}
              >
                {isGenerating === localSettings.bidSentSound ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Export the sound options and a helper to get the prompt
export function getSoundPrompt(soundId: string): string {
  const option = SOUND_OPTIONS.find(o => o.id === soundId);
  return option?.prompt || SOUND_OPTIONS[0].prompt;
}

// Fallback for when hook is not available (legacy compatibility)
export function loadSoundSettings(): SoundSettings {
  // This now returns defaults - actual settings come from useUserPreferences hook
  return DEFAULT_SETTINGS;
}
