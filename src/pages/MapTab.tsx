import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, MapIcon, Satellite, Cloud } from 'lucide-react';
import oilChangeIcon from '@/assets/oil-change-icon.png';
import checkEngineIcon from '@/assets/check-engine-icon.png';
import { toast } from 'sonner';

const MapTab = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [syncing, setSyncing] = useState(false);
  const [weatherCache, setWeatherCache] = useState<Record<string, any>>({});
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('streets');
  const [showWeatherLayer, setShowWeatherLayer] = useState(false);
  const markersRef = useRef<Map<string, { marker: mapboxgl.Marker; popup: mapboxgl.Popup }>>(new Map());

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

  const fetchWeather = async (lat: number, lng: number): Promise<any> => {
    const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    
    if (weatherCache[cacheKey]) {
      return weatherCache[cacheKey];
    }

    try {
      const { data, error } = await supabase.functions.invoke('get-weather', {
        body: { latitude: lat, longitude: lng }
      });

      if (error) {
        console.error('Weather fetch error:', error);
        return null;
      }
      
      setWeatherCache(prev => ({ ...prev, [cacheKey]: data }));
      return data;
    } catch (error) {
      console.error('Error fetching weather:', error);
      return null;
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

      // Add weather layer when map loads
      map.current.on('load', () => {
        if (showWeatherLayer) {
          addWeatherLayer();
        }
      });
    };

    initializeMap();

    return () => {
      markersRef.current.forEach(({ marker }) => marker.remove());
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    
    if (showWeatherLayer) {
      addWeatherLayer();
    } else {
      removeWeatherLayer();
    }
  }, [showWeatherLayer]);

  const addWeatherLayer = async () => {
    if (!map.current) return;
    
    // Remove existing layer if present
    if (map.current.getLayer('rain-layer')) {
      map.current.removeLayer('rain-layer');
    }
    if (map.current.getSource('rain-source')) {
      map.current.removeSource('rain-source');
    }

    try {
      // Fetch latest radar timestamp from RainViewer API
      const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      const data = await response.json();
      
      if (!data.radar?.past?.length) {
        console.error('No radar data available from RainViewer');
        return;
      }

      // Get the most recent radar timestamp
      const latestTimestamp = data.radar.past[data.radar.past.length - 1].path;

      // Add RainViewer radar overlay with valid timestamp
      map.current.addSource('rain-source', {
        type: 'raster',
        tiles: [
          `https://tilecache.rainviewer.com${latestTimestamp}/256/{z}/{x}/{y}/2/1_1.png`
        ],
        tileSize: 256,
      });

      map.current.addLayer({
        id: 'rain-layer',
        type: 'raster',
        source: 'rain-source',
        paint: {
          'raster-opacity': 0.6,
        },
      });
    } catch (error) {
      console.error('Failed to load weather radar:', error);
      toast.error('Failed to load weather radar overlay');
    }
  };

  const removeWeatherLayer = () => {
    if (!map.current) return;
    
    if (map.current.getLayer('rain-layer')) {
      map.current.removeLayer('rain-layer');
    }
    if (map.current.getSource('rain-source')) {
      map.current.removeSource('rain-source');
    }
  };

  const toggleMapStyle = () => {
    if (!map.current) return;
    
    const newStyle = mapStyle === 'streets' ? 'satellite' : 'streets';
    setMapStyle(newStyle);
    
    map.current.setStyle(
      newStyle === 'satellite' 
        ? 'mapbox://styles/mapbox/satellite-streets-v12' 
        : 'mapbox://styles/mapbox/streets-v12'
    );
  };

  const handleVehicleClick = (vehicleId: string) => {
    const markerData = markersRef.current.get(vehicleId);
    if (!markerData || !map.current) return;

    const { marker, popup } = markerData;
    
    // Get marker position
    const lngLat = marker.getLngLat();
    
    // Center map on vehicle
    map.current.flyTo({
      center: [lngLat.lng, lngLat.lat],
      zoom: 12,
      duration: 1000,
    });
    
    // Open popup
    popup.addTo(map.current);
  };

  useEffect(() => {
    if (!map.current || vehicles.length === 0) return;

    const updateMarkers = async () => {
      // Clear existing markers
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current.clear();

      // Add markers for each vehicle with GPS data
      const bounds = new mapboxgl.LngLatBounds();
      
      for (const vehicle of vehicles) {
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
          // Fetch weather for this location
          const weather = await fetchWeather(lat, lng);
          const speed = vehicle.speed || 0;
          const stoppedStatus = vehicle.stopped_status;
          // Show oil change indicator only when due (0 or negative miles remaining)
          const oilChangeDue = vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining <= 0;
          // Show check engine indicator if vehicle has fault codes
          const hasFaultCodes = vehicle.fault_codes && Array.isArray(vehicle.fault_codes) && vehicle.fault_codes.length > 0;
          
          // Determine marker style based on vehicle status
          let markerHTML = '';
          
          if (speed > 0) {
            // Moving Vehicle - Green circle with arrow
            markerHTML = `
              <svg width="40" height="40" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="18" fill="#10b981" stroke="white" stroke-width="3"/>
                <path d="M20 12 L20 28 M20 12 L15 17 M20 12 L25 17" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                ${hasFaultCodes ? `<image href="${checkEngineIcon}" x="25" y="8" width="14" height="14"/>` : ''}
              </svg>
            `;
          } else if (stoppedStatus === 'stopped' || speed === 0) {
            // Stopped - Red square
            markerHTML = `
              <svg width="40" height="40" viewBox="0 0 40 40">
                <rect x="6" y="6" width="28" height="28" fill="#ef4444" stroke="white" stroke-width="3" rx="2"/>
                <rect x="14" y="14" width="12" height="12" fill="white" rx="1"/>
                ${hasFaultCodes ? `<image href="${checkEngineIcon}" x="25" y="8" width="14" height="14"/>` : ''}
              </svg>
            `;
          } else {
            // Idling - Green circle with pause icon
            markerHTML = `
              <svg width="40" height="40" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="18" fill="#10b981" stroke="white" stroke-width="3"/>
                <rect x="14" y="12" width="3" height="16" fill="white" rx="1"/>
                <rect x="23" y="12" width="3" height="16" fill="white" rx="1"/>
                ${hasFaultCodes ? `<image href="${checkEngineIcon}" x="25" y="8" width="14" height="14"/>` : ''}
              </svg>
            `;
          }
          
          const el = document.createElement('div');
          el.className = 'vehicle-marker';
          el.style.cssText = `
            cursor: pointer;
            width: 40px;
            height: 40px;
          `;
          el.innerHTML = markerHTML;

          const weatherHtml = weather ? `
            <!-- Weather Info -->
            <div style="padding: 12px 16px; background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%); color: white; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #2563eb;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <img src="https:${weather.icon}" alt="${weather.condition}" style="width: 40px; height: 40px;" />
                <div>
                  <div style="font-size: 24px; font-weight: 700;">${Math.round(weather.temperature)}°F</div>
                  <div style="font-size: 12px; opacity: 0.9;">${weather.condition}</div>
                </div>
              </div>
              <div style="text-align: right; font-size: 11px; opacity: 0.9;">
                <div>Feels ${Math.round(weather.feelslike_f)}°F</div>
                <div>${weather.humidity}% humidity</div>
                <div>${Math.round(weather.wind_mph)} mph wind</div>
              </div>
            </div>
          ` : '';

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
                <div style="display: flex; align-items: center; gap: 8px;">
                  ${oilChangeDue ? `<img src="${oilChangeIcon}" alt="Oil Change Due" style="width: 20px; height: 20px;" />` : ''}
                  ${hasFaultCodes ? `<img src="${checkEngineIcon}" alt="Check Engine" style="width: 20px; height: 20px;" />` : ''}
                  <div style="background: #10b981; padding: 4px 12px; border-radius: 4px; font-size: 14px; font-weight: 600;">
                    ${vehicle.speed || 0} MPH
                  </div>
                </div>
              </div>
              
              ${weatherHtml}
              
              <!-- Location Info -->
              <div style="padding: 12px 16px; background: white; border-bottom: 1px solid #e5e7eb;">
                <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                  ${vehicle.formatted_address || vehicle.last_location || 'Location unavailable'}
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

          markersRef.current.set(vehicle.id, { marker, popup });
          bounds.extend([lng, lat]);
        }
      }

      // Fit map to show all markers
      if (markersRef.current.size > 0) {
        map.current.fitBounds(bounds, {
          padding: 50,
          maxZoom: 12,
        });
      }
    };

    updateMarkers();
  }, [vehicles, weatherCache]);


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
          {vehicles.map((vehicle) => {
            const speed = vehicle.speed || 0;
            const stoppedStatus = vehicle.stopped_status;
            let statusIcon = '';
            let statusColor = '';
            
            if (speed > 0) {
              statusIcon = '↑'; // Moving
              statusColor = 'bg-emerald-500';
            } else if (stoppedStatus === 'stopped' || speed === 0) {
              statusIcon = '■'; // Stopped
              statusColor = 'bg-red-500';
            } else {
              statusIcon = '‖'; // Idling
              statusColor = 'bg-emerald-500';
            }
            
            // Check if oil change is due (0 or negative miles remaining)
            const oilChangeDue = vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining <= 0;
            // Check if vehicle has fault codes
            const hasFaultCodes = vehicle.fault_codes && Array.isArray(vehicle.fault_codes) && vehicle.fault_codes.length > 0;
            
            return (
              <div
                key={vehicle.id}
                onClick={() => handleVehicleClick(vehicle.id)}
                className="px-4 py-3 border-b hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${statusColor} text-white`}>
                      {statusIcon}
                    </span>
                    <div className="font-medium text-sm">
                      {vehicle.vehicle_number || 'Unknown'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {oilChangeDue && (
                      <span className="flex items-center justify-center w-5 h-5 rounded" title="Oil change due">
                        <img src={oilChangeIcon} alt="Oil change" className="h-4 w-4" />
                      </span>
                    )}
                    {hasFaultCodes && (
                      <span className="flex items-center justify-center w-5 h-5 rounded" title={`${vehicle.fault_codes.length} fault code(s)`}>
                        <img src={checkEngineIcon} alt="Check engine" className="h-4 w-4" />
                      </span>
                    )}
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {speed} MPH
                    </span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {vehicle.formatted_address || vehicle.last_location || 'Location unavailable'}
                </div>
              </div>
            );
          })}
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
        
        {/* Map controls */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
          <Button
            onClick={toggleMapStyle}
            size="sm"
            variant="secondary"
            className="shadow-lg"
          >
            {mapStyle === 'streets' ? (
              <>
                <Satellite className="h-4 w-4 mr-2" />
                Satellite
              </>
            ) : (
              <>
                <MapIcon className="h-4 w-4 mr-2" />
                Streets
              </>
            )}
          </Button>
          <Button
            onClick={() => setShowWeatherLayer(!showWeatherLayer)}
            size="sm"
            variant={showWeatherLayer ? "default" : "secondary"}
            className="shadow-lg"
          >
            <Cloud className="h-4 w-4 mr-2" />
            Weather
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MapTab;
