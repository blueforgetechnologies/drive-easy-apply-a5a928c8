import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const MapTab = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [syncing, setSyncing] = useState(false);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    loadVehicles();
    
    // Auto-refresh vehicle positions every 30 seconds
    const refreshInterval = setInterval(() => {
      loadVehicles();
    }, 30000);

    return () => {
      clearInterval(refreshInterval);
    };
  }, []);

  const loadVehicles = async () => {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .not('last_location', 'is', null);

    if (!error && data) {
      setVehicles(data);
      setLastUpdate(new Date());
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-vehicles-samsara');

      if (error) {
        console.error('Sync error:', error);
        toast.error('Failed to sync vehicles with Samsara');
        return;
      }

      if (data?.success) {
        toast.success(`Successfully synced ${data.results.updated} vehicles`);
        // Reload vehicles after sync
        await loadVehicles();
      }
    } catch (error) {
      console.error('Sync error:', error);
      toast.error('Failed to sync vehicles');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const initializeMap = async () => {
      if (!mapContainer.current || map.current) return;

      // Fetch Mapbox token from backend
      const { data: tokenData, error: tokenError } = await supabase.functions.invoke('get-mapbox-token');
      
      if (tokenError || !tokenData?.token) {
        console.error('Failed to fetch Mapbox token:', tokenError);
        return;
      }

      // Initialize map with token from backend
      mapboxgl.accessToken = tokenData.token;
      
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-98, 39], // Center of USA
        zoom: 4,
      });

      map.current.addControl(
        new mapboxgl.NavigationControl({
          visualizePitch: true,
        }),
        'top-right'
      );
    };

    initializeMap();

    return () => {
      markersRef.current.forEach(marker => marker.remove());
      map.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!map.current || vehicles.length === 0) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add markers for each vehicle with GPS data
    const bounds = new mapboxgl.LngLatBounds();
    
    vehicles.forEach(vehicle => {
      // Parse location from last_location field or use direct lat/lng if available
      let lat, lng;
      
      if (vehicle.last_location) {
        // Try to parse coordinates from location string
        const coordMatch = vehicle.last_location.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
        if (coordMatch) {
          lat = parseFloat(coordMatch[1]);
          lng = parseFloat(coordMatch[2]);
        }
      }

      // If we have valid coordinates, add marker
      if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
        const el = document.createElement('div');
        el.className = 'vehicle-marker';
        el.style.cssText = `
          background-color: hsl(var(--primary));
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 3px solid hsl(var(--background));
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: hsl(var(--primary-foreground));
          font-size: 12px;
        `;
        el.textContent = vehicle.vehicle_number || '?';

        const popup = new mapboxgl.Popup({ 
          offset: 25,
          maxWidth: '350px',
          className: 'vehicle-popup'
        }).setHTML(`
          <div style="padding: 0; font-family: system-ui, -apple-system, sans-serif; min-width: 320px;">
            <!-- Header -->
            <div style="padding: 12px 16px; background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)) 100%); color: white; display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/>
                  <circle cx="6.5" cy="16.5" r="2.5"/>
                  <circle cx="16.5" cy="16.5" r="2.5"/>
                </svg>
                <span style="font-size: 18px; font-weight: 600;">${vehicle.vehicle_number || 'Unknown'}</span>
              </div>
              <div style="background: #10b981; padding: 4px 12px; border-radius: 4px; font-size: 14px; font-weight: 600;">
                ${vehicle.speed || 0} MPH
              </div>
            </div>
            
            <!-- Location Info -->
            <div style="padding: 12px 16px; background: white; border-bottom: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                ${vehicle.last_location || 'Location unavailable'}
              </p>
            </div>
            
            ${vehicle.odometer ? `
            <div style="padding: 8px 16px; background: white; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 8px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              <span style="color: #374151; font-size: 13px;">
                <strong>${vehicle.odometer.toLocaleString()}</strong> miles
              </span>
            </div>
            ` : ''}
            
            <!-- Camera Image -->
            ${vehicle.camera_image_url ? `
            <div style="position: relative; width: 100%; height: 180px; overflow: hidden;">
              <img 
                src="${vehicle.camera_image_url}" 
                alt="Vehicle camera view" 
                style="width: 100%; height: 100%; object-fit: cover;"
                onerror="this.parentElement.innerHTML='<div style=\\'display: flex; align-items: center; justify-content: center; height: 100%; background: #f3f4f6; color: #9ca3af;\\'>Camera image unavailable</div>'"
              />
            </div>
            ` : `
            <div style="width: 100%; height: 180px; background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 13px;">
              <div style="text-align: center;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 8px;">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <div>Camera view unavailable</div>
              </div>
            </div>
            `}
            
            <!-- Action Icons -->
            <div style="padding: 8px 16px; background: white; display: flex; gap: 16px; border-top: 1px solid #e5e7eb;">
              <button style="background: none; border: none; padding: 8px; cursor: pointer; color: #6b7280; display: flex; align-items: center; gap: 4px; font-size: 12px;" onmouseover="this.style.color='hsl(var(--primary))'" onmouseout="this.style.color='#6b7280'">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                History
              </button>
              <button style="background: none; border: none; padding: 8px; cursor: pointer; color: #6b7280; display: flex; align-items: center; gap: 4px; font-size: 12px;" onmouseover="this.style.color='hsl(var(--primary))'" onmouseout="this.style.color='#6b7280'">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                </svg>
                Fullscreen
              </button>
            </div>
          </div>
        `);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map.current!);

        markersRef.current.push(marker);
        bounds.extend([lng, lat]);
      }
    });

    // Fit map to show all markers
    if (markersRef.current.length > 0) {
      map.current.fitBounds(bounds, {
        padding: 50,
        maxZoom: 12,
      });
    }
  }, [vehicles]);


  return (
    <div className="h-[calc(100vh-120px)] flex gap-4">
      {/* Sidebar with asset list */}
      <aside className="w-80 max-w-sm bg-background/95 backdrop-blur border rounded-lg shadow-lg overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b">
          <h3 className="font-semibold">Assets</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} with live location
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {vehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              className="px-4 py-3 border-b hover:bg-muted/30 cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium text-sm">
                  {vehicle.vehicle_number || 'Unknown'}
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                  {vehicle.speed || 0} MPH
                </span>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {vehicle.last_location || 'Location unavailable'}
              </div>
            </div>
          ))}
          {vehicles.length === 0 && (
            <div className="px-4 py-6 text-xs text-muted-foreground text-center">
              No assets with GPS location yet. Try syncing with Samsara.
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t text-xs text-muted-foreground space-y-1">
          <div>Last updated: {lastUpdate.toLocaleTimeString()}</div>
          <div>Auto-refresh: every 30s</div>
          <Button 
            onClick={handleSync} 
            disabled={syncing}
            size="sm"
            className="w-full mt-2"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync with Samsara'}
          </Button>
        </div>
      </aside>

      {/* Map container */}
      <div className="relative flex-1">
        <div ref={mapContainer} className="absolute inset-0 rounded-lg" />
      </div>
    </div>
  );
};

export default MapTab;
