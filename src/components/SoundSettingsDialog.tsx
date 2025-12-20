import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Settings, Play, Volume2 } from "lucide-react";
import { toast } from "sonner";

export interface SoundSettings {
  loadReceiveSound: string;
  bidSentSound: string;
  volume: number;
}

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
  volume: 50,
};

interface SoundSettingsDialogProps {
  onSettingsChange?: (settings: SoundSettings) => void;
  trigger?: React.ReactNode;
}

export function SoundSettingsDialog({ onSettingsChange, trigger }: SoundSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SoundSettings>(DEFAULT_SETTINGS);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const soundCacheRef = useRef<Map<string, string>>(new Map());

  // Load settings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('soundSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (e) {
        console.error('Error parsing sound settings:', e);
      }
    }
  }, []);

  // Save settings to localStorage and notify parent
  const saveSettings = (newSettings: SoundSettings) => {
    setSettings(newSettings);
    localStorage.setItem('soundSettings', JSON.stringify(newSettings));
    onSettingsChange?.(newSettings);
  };

  const handleLoadSoundChange = (value: string) => {
    saveSettings({ ...settings, loadReceiveSound: value });
  };

  const handleBidSoundChange = (value: string) => {
    saveSettings({ ...settings, bidSentSound: value });
  };

  const handleVolumeChange = (value: number[]) => {
    saveSettings({ ...settings, volume: value[0] });
  };

  const previewSound = async (soundId: string) => {
    const option = SOUND_OPTIONS.find(o => o.id === soundId);
    if (!option) return;

    // Check cache first
    const cachedUrl = soundCacheRef.current.get(soundId);
    if (cachedUrl) {
      const audio = new Audio(cachedUrl);
      audio.volume = settings.volume / 100;
      await audio.play();
      return;
    }

    setIsGenerating(soundId);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-sfx`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            prompt: option.prompt,
            duration: 1
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to generate sound: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Cache it
      soundCacheRef.current.set(soundId, audioUrl);
      
      const audio = new Audio(audioUrl);
      audio.volume = settings.volume / 100;
      await audio.play();
    } catch (error) {
      console.error('Error previewing sound:', error);
      toast.error('Failed to generate sound preview');
    } finally {
      setIsGenerating(null);
    }
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
            <Label className="text-sm font-medium">Volume: {settings.volume}%</Label>
            <Slider
              value={[settings.volume]}
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
              <Select value={settings.loadReceiveSound} onValueChange={handleLoadSoundChange}>
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
                onClick={() => previewSound(settings.loadReceiveSound)}
                disabled={isGenerating !== null}
              >
                {isGenerating === settings.loadReceiveSound ? (
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
              <Select value={settings.bidSentSound} onValueChange={handleBidSoundChange}>
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
                onClick={() => previewSound(settings.bidSentSound)}
                disabled={isGenerating !== null}
              >
                {isGenerating === settings.bidSentSound ? (
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

export function loadSoundSettings(): SoundSettings {
  const saved = localStorage.getItem('soundSettings');
  if (saved) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
  return DEFAULT_SETTINGS;
}
