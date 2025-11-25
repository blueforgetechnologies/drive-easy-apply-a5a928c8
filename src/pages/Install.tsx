import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Smartphone, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
      setIsInstallable(false);
    }

    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full p-8">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
              <Smartphone className="w-12 h-12 text-primary" />
            </div>
          </div>

          <div>
            <h1 className="text-3xl font-bold mb-2">Install Driver App</h1>
            <p className="text-muted-foreground">
              Get quick access to your application from your home screen
            </p>
          </div>

          {isInstalled ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-success">
                <Check className="w-6 h-6" />
                <span className="font-semibold">App is installed!</span>
              </div>
              <Button onClick={() => navigate("/")} className="w-full">
                Go to Application
              </Button>
            </div>
          ) : isInstallable ? (
            <div className="space-y-4">
              <Button onClick={handleInstall} size="lg" className="w-full">
                <Download className="w-5 h-5 mr-2" />
                Install App
              </Button>
              <Button onClick={() => navigate("/")} variant="outline" className="w-full">
                Continue in Browser
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Card className="p-4 bg-muted/50">
                <h3 className="font-semibold mb-2">Manual Installation</h3>
                <div className="text-sm text-muted-foreground space-y-2 text-left">
                  <p><strong>iPhone/iPad:</strong></p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Tap the Share button in Safari</li>
                    <li>Scroll down and tap "Add to Home Screen"</li>
                    <li>Tap "Add" to confirm</li>
                  </ol>
                  <p className="mt-3"><strong>Android:</strong></p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Tap the menu (three dots) in your browser</li>
                    <li>Tap "Add to Home screen" or "Install app"</li>
                    <li>Tap "Add" to confirm</li>
                  </ol>
                </div>
              </Card>
              <Button onClick={() => navigate("/")} className="w-full">
                Continue to Application
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                <Smartphone className="w-6 h-6 text-primary" />
              </div>
              <h4 className="font-semibold text-sm">Works Offline</h4>
              <p className="text-xs text-muted-foreground">Access anytime</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                <Download className="w-6 h-6 text-primary" />
              </div>
              <h4 className="font-semibold text-sm">Fast Loading</h4>
              <p className="text-xs text-muted-foreground">Instant access</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                <Check className="w-6 h-6 text-primary" />
              </div>
              <h4 className="font-semibold text-sm">No App Store</h4>
              <p className="text-xs text-muted-foreground">Install directly</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
