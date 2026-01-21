import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { useTenantQuery } from '@/hooks/useTenantQuery';
import { Button } from '@/components/ui/button';
import { useMapLoadTracker } from '@/hooks/useMapLoadTracker';
import { useVehicleHistory, LocationPoint } from '@/hooks/useVehicleHistory';
import { VehicleHistoryControls } from '@/components/VehicleHistoryControls';
import { RefreshCw, MapIcon, Satellite, Cloud, ChevronUp, ChevronDown, Truck, Navigation, AlertTriangle, Info, History, Users } from 'lucide-react';
import oilChangeIcon from '@/assets/oil-change-icon.png';
import checkEngineIcon from '@/assets/check-engine-icon.png';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

type VehicleFilterMode = 'my-trucks' | 'all';

const MapTab = () => {
  useMapLoadTracker('MapTab');
  const isMobile = useIsMobile();
  const { query, tenantId, isReady, shouldFilter, isPlatformAdmin } = useTenantQuery();
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [allVehicles, setAllVehicles] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [syncing, setSyncing] = useState(false);
  const [weatherCache, setWeatherCache] = useState<Record<string, any>>({});
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('streets');
  const [showWeatherLayer, setShowWeatherLayer] = useState(false);
  const markersRef = useRef<Map<string, { marker: mapboxgl.Marker; popup: mapboxgl.Popup }>>(new Map());
  const historyMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [historyMode, setHistoryMode] = useState(false);
  
  // Dispatcher filter state
  const [filterMode, setFilterMode] = useState<VehicleFilterMode>('my-trucks');
  const [currentDispatcherId, setCurrentDispatcherId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Track previous tenant for cleanup
  const prevTenantIdRef = useRef<string | null>(null);
  
  // Separate ref to track if initial bounds have been set
  const initialBoundsSet = useRef(false);
  
  // Vehicle history hook
  const vehicleHistory = useVehicleHistory();
  
  // Fetch current user's dispatcher ID and admin status
  useEffect(() => {
    const fetchUserContext = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !tenantId) return;
      
      // Check if user is admin
      // Check if user has admin-level role
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      
      const userIsAdmin = roles?.some(r => r.role === 'admin') || isPlatformAdmin;
      setIsAdmin(userIsAdmin);
      
      // Get dispatcher ID for this user in this tenant
      const { data: dispatcher } = await supabase
        .from('dispatchers')
        .select('id')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      
      setCurrentDispatcherId(dispatcher?.id || null);
      
      // If user is admin, default to showing all trucks
      if (userIsAdmin) {
        setFilterMode('all');
      }
    };
    
    fetchUserContext();
  }, [tenantId, isPlatformAdmin]);
  
  // Filter vehicles based on mode and dispatcher assignment
  const vehicles = useCallback(() => {
    if (filterMode === 'all' || !currentDispatcherId) {
      return allVehicles;
    }
    
    // Filter to only show vehicles where user is primary or secondary dispatcher
    return allVehicles.filter(v => 
      v.primary_dispatcher_id === currentDispatcherId ||
      (Array.isArray(v.secondary_dispatcher_ids) && v.secondary_dispatcher_ids.includes(currentDispatcherId))
    );
  }, [allVehicles, filterMode, currentDispatcherId])();

  // SECURITY: Clear all markers and state when tenant changes
  const clearAllMarkers = useCallback(() => {
    console.log('[MapTab] Clearing all markers and state');
    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current.clear();
    historyMarkersRef.current.forEach(marker => marker.remove());
    historyMarkersRef.current = [];
    setAllVehicles([]);
    setSelectedVehicle(null);
    initialBoundsSet.current = false; // Reset bounds so new tenant data fits properly
    
    // Clear history layers if they exist
    if (map.current) {
      if (map.current.getLayer('history-line')) {
        map.current.removeLayer('history-line');
      }
      if (map.current.getSource('history-line')) {
        map.current.removeSource('history-line');
      }
    }
  }, []);

  // SECURITY: Effect to detect tenant change and clear stale data
  useEffect(() => {
    if (prevTenantIdRef.current !== null && prevTenantIdRef.current !== tenantId) {
      console.log(`[MapTab] Tenant changed: ${prevTenantIdRef.current} -> ${tenantId} - clearing markers`);
      clearAllMarkers();
    }
    prevTenantIdRef.current = tenantId;
  }, [tenantId, clearAllMarkers]);

  useEffect(() => {
    // SECURITY: Don't load until tenant context is ready
    if (!isReady) {
      console.log('[MapTab] Tenant context not ready, skipping load');
      return;
    }
    
    loadVehicles();
    
    // Auto-refresh vehicle positions every 30 seconds
    const refreshInterval = setInterval(() => {
      if (isReady) loadVehicles();
    }, 30000);

    return () => {
      clearInterval(refreshInterval);
    };
  }, [tenantId, isReady]);

  const loadVehicles = async () => {
    if (!isReady) return;
    
    // DEV LOG: Tenant isolation debugging
    console.log('[MapTab] loadVehicles:', { tenantId, shouldFilter, isPlatformAdmin, isReady });
    
    // SECURITY: Use tenant-scoped query helper
    const { data, error } = await query('vehicles')
      .select('*')
      .not('last_location', 'is', null);

    if (!error && data) {
      console.log(`[MapTab] Loaded ${data.length} vehicles for tenant: ${tenantId}`);
      setAllVehicles(data);
      setLastUpdate(new Date());
    } else if (error) {
      console.error('[MapTab] Error loading vehicles:', error);
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
      // Pass tenantId to sync only this tenant's vehicles
      const { data, error } = await supabase.functions.invoke('sync-vehicles-samsara', {
        body: { tenant_id: tenantId }
      });

      if (error) {
        console.error('Sync error:', error);
        toast.error('Failed to sync vehicles with Samsara');
        return;
      }

      if (data?.success) {
        const results = data.results?.[0] || data.results || {};
        const updated = results.updated ?? 0;
        toast.success(`Successfully synced ${updated} vehicles`);
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
      historyMarkersRef.current.forEach(marker => marker.remove());
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Draw history trail on map
  const drawHistoryTrail = useCallback((points: LocationPoint[]) => {
    if (!map.current) return;

    // Clear existing history markers and line
    historyMarkersRef.current.forEach(marker => marker.remove());
    historyMarkersRef.current = [];

    if (map.current.getLayer('history-line')) {
      map.current.removeLayer('history-line');
    }
    if (map.current.getSource('history-line')) {
      map.current.removeSource('history-line');
    }

    if (points.length === 0) return;

    // Create line coordinates
    const coordinates = points.map(p => [p.longitude, p.latitude]);

    // Add the line source and layer
    map.current.addSource('history-line', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates,
        },
      },
    });

    map.current.addLayer({
      id: 'history-line',
      type: 'line',
      source: 'history-line',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#3b82f6',
        'line-width': 4,
        'line-opacity': 0.8,
      },
    });

    // Add markers for start/end points
    if (points.length > 0) {
      // Start marker (green)
      const startPoint = points[0];
      const startEl = document.createElement('div');
      startEl.innerHTML = `
        <div class="flex items-center justify-center w-6 h-6 bg-emerald-500 rounded-full border-2 border-white shadow-lg">
          <span class="text-white text-xs font-bold">S</span>
        </div>
      `;
      const startMarker = new mapboxgl.Marker({ element: startEl, anchor: 'center' })
        .setLngLat([startPoint.longitude, startPoint.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 10 }).setHTML(`
          <div class="p-2 text-xs">
            <div class="font-semibold">Start</div>
            <div class="text-muted-foreground">${new Date(startPoint.recorded_at).toLocaleTimeString()}</div>
            ${startPoint.speed ? `<div>${startPoint.speed} mph</div>` : ''}
          </div>
        `))
        .addTo(map.current!);
      historyMarkersRef.current.push(startMarker);

      // End marker (red) - if different from start
      if (points.length > 1) {
        const endPoint = points[points.length - 1];
        const endEl = document.createElement('div');
        endEl.innerHTML = `
          <div class="flex items-center justify-center w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg">
            <span class="text-white text-xs font-bold">E</span>
          </div>
        `;
        const endMarker = new mapboxgl.Marker({ element: endEl, anchor: 'center' })
          .setLngLat([endPoint.longitude, endPoint.latitude])
          .setPopup(new mapboxgl.Popup({ offset: 10 }).setHTML(`
            <div class="p-2 text-xs">
              <div class="font-semibold">End</div>
              <div class="text-muted-foreground">${new Date(endPoint.recorded_at).toLocaleTimeString()}</div>
              ${endPoint.speed ? `<div>${endPoint.speed} mph</div>` : ''}
            </div>
          `))
          .addTo(map.current!);
        historyMarkersRef.current.push(endMarker);
      }

      // Fit bounds to show all points
      const bounds = new mapboxgl.LngLatBounds();
      points.forEach(p => bounds.extend([p.longitude, p.latitude]));
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    }
  }, []);

  // Effect to draw history when points change
  useEffect(() => {
    if (historyMode && vehicleHistory.points.length > 0) {
      drawHistoryTrail(vehicleHistory.points);
    }
  }, [historyMode, vehicleHistory.points, drawHistoryTrail]);

  // Clear history trail when exiting history mode
  const exitHistoryMode = useCallback(() => {
    setHistoryMode(false);
    vehicleHistory.clearHistory();
    
    // Clear history visualization
    historyMarkersRef.current.forEach(marker => marker.remove());
    historyMarkersRef.current = [];
    
    if (map.current) {
      if (map.current.getLayer('history-line')) {
        map.current.removeLayer('history-line');
      }
      if (map.current.getSource('history-line')) {
        map.current.removeSource('history-line');
      }
    }
  }, [vehicleHistory]);

  // Enter history mode for a vehicle
  const enterHistoryMode = useCallback((vehicleId: string) => {
    setHistoryMode(true);
    vehicleHistory.setSelectedVehicle(vehicleId);
  }, [vehicleHistory]);

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
          'raster-opacity': 0.95,
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
    
    // Set selected vehicle and collapse sheet on mobile
    setSelectedVehicle(vehicleId);
    if (isMobile) {
      setMobileSheetExpanded(false);
    }
  };


  useEffect(() => {
    if (!map.current || vehicles.length === 0) return;

    const updateMarkers = () => {
      // Track which vehicles we've already added markers for
      const existingVehicleIds = new Set(markersRef.current.keys());
      const currentVehicleIds = new Set<string>();
      const bounds = new mapboxgl.LngLatBounds();
      
      for (const vehicle of vehicles) {
        // Parse location from last_location field or use direct lat/lng if available
        let lat: number | undefined, lng: number | undefined;
        
        if (vehicle.last_location) {
          // Try to parse coordinates from location string
          const coordMatch = vehicle.last_location.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
          if (coordMatch) {
            lat = parseFloat(coordMatch[1]);
            lng = parseFloat(coordMatch[2]);
          }
        }

        // If we have valid coordinates, add or update marker
        if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
          currentVehicleIds.add(vehicle.id);
          bounds.extend([lng, lat]);
          
          // Check if marker already exists
          const existingMarkerData = markersRef.current.get(vehicle.id);
          if (existingMarkerData) {
            // Update existing marker position
            existingMarkerData.marker.setLngLat([lng, lat]);
            continue; // Skip creating new marker
          }
          
          const speed = vehicle.speed || 0;
          const stoppedStatus = vehicle.stopped_status;
          // Show oil change indicator only when due (0 or negative miles remaining)
          const oilChangeDue = vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining <= 0;
          // Show check engine indicator if vehicle has fault codes
          const hasFaultCodes = vehicle.fault_codes && Array.isArray(vehicle.fault_codes) && vehicle.fault_codes.length > 0;
          
          // Determine marker style based on vehicle status
          const unitNumber = vehicle.vehicle_number || '?';
          const shortUnit = unitNumber.length > 4 ? unitNumber.slice(-4) : unitNumber;
          
          // Status determination with clear categories
          let bgColor = '#10b981'; // Green for driving
          let borderColor = '#059669';
          let statusIcon = '';
          let pulseRing = '';
          
          // Determine engine/ignition status
          const isMoving = speed > 0;
          const isIdling = speed === 0 && stoppedStatus === 'idling';
          
          if (isMoving) {
            // DRIVING - Green with animated arrow
            bgColor = '#10b981';
            borderColor = '#059669';
            pulseRing = `
              <circle cx="18" cy="16" r="14" fill="none" stroke="#10b981" stroke-width="2" opacity="0.4">
                <animate attributeName="r" values="14;18;14" dur="1.5s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.4;0;0.4" dur="1.5s" repeatCount="indefinite"/>
              </circle>
            `;
            // Arrow pointing up (motion)
            statusIcon = `
              <g transform="translate(12, 10)">
                <polygon points="6,0 12,10 8,10 8,14 4,14 4,10 0,10" fill="${bgColor}"/>
              </g>
            `;
          } else if (isIdling) {
            // IDLING - Yellow/Amber with engine waves
            bgColor = '#f59e0b';
            borderColor = '#d97706';
            // Engine/wave icon
            statusIcon = `
              <g transform="translate(10, 11)">
                <path d="M3,3 Q5,0 8,3 Q11,6 13,3" stroke="${bgColor}" stroke-width="2" fill="none" stroke-linecap="round"/>
                <path d="M3,9 Q5,6 8,9 Q11,12 13,9" stroke="${bgColor}" stroke-width="2" fill="none" stroke-linecap="round"/>
              </g>
            `;
          } else {
            // PARKED (Engine Off) - Blue with P icon
            bgColor = '#3b82f6';
            borderColor = '#2563eb';
            // Bold P icon
            statusIcon = `
              <text x="18" y="21" font-size="14" font-weight="900" fill="${bgColor}" text-anchor="middle" font-family="system-ui, sans-serif">P</text>
            `;
          }
          
          // Override for alerts - Red for fault codes
          if (hasFaultCodes) {
            bgColor = '#ef4444';
            borderColor = '#dc2626';
          } else if (oilChangeDue) {
            // Orange for service due (only if no fault codes)
            bgColor = '#f97316';
            borderColor = '#ea580c';
          }
          
          const markerHTML = `
            <svg width="36" height="46" viewBox="0 0 36 46" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
              <!-- Animated pulse ring for moving vehicles -->
              ${pulseRing}
              
              <!-- Main pin shape -->
              <path d="M18 42 L10 28 C3 20 3 10 10 5 C17 0 25 0 32 5 C39 10 39 20 32 28 Z" 
                    fill="${bgColor}" stroke="${borderColor}" stroke-width="1.5"/>
              
              <!-- Inner white circle -->
              <circle cx="18" cy="16" r="10" fill="white"/>
              
              <!-- Status icon -->
              ${statusIcon}
              
              <!-- Alert badge for fault codes -->
              ${hasFaultCodes ? `
                <circle cx="28" cy="6" r="6" fill="#ef4444" stroke="white" stroke-width="1.5"/>
                <text x="28" y="9" font-size="9" font-weight="900" fill="white" text-anchor="middle" font-family="system-ui">!</text>
              ` : ''}
              
              <!-- Service due badge -->
              ${oilChangeDue && !hasFaultCodes ? `
                <circle cx="28" cy="6" r="6" fill="#f97316" stroke="white" stroke-width="1.5"/>
                <text x="28" y="9" font-size="8" font-weight="700" fill="white" text-anchor="middle">⚠</text>
              ` : ''}
              
              <!-- Unit number pill -->
              <rect x="4" y="32" width="28" height="12" rx="6" fill="rgba(0,0,0,0.85)"/>
              <text x="18" y="41" font-size="8" font-weight="700" fill="white" text-anchor="middle" font-family="system-ui, sans-serif">${shortUnit}</text>
            </svg>
          `;
          
          const el = document.createElement('div');
          el.className = 'vehicle-marker';
          el.style.cssText = `
            cursor: pointer;
            width: 36px;
            height: 46px;
          `;
          el.innerHTML = markerHTML;
          
          // Add hover effect to the SVG inside (not the container - that breaks Mapbox positioning)
          const svg = el.querySelector('svg');
          if (svg) {
            svg.style.transition = 'transform 0.2s ease';
            svg.style.transformOrigin = 'bottom center';
            el.addEventListener('mouseenter', () => {
              svg.style.transform = 'scale(1.15)';
            });
            el.addEventListener('mouseleave', () => {
              svg.style.transform = 'scale(1)';
            });
          }

          // Create popup with weather fetched on demand when opened
          const popup = new mapboxgl.Popup({ 
            offset: [0, -46],
            maxWidth: '280px',
            className: 'vehicle-popup',
            anchor: 'bottom'
          });

          // Set popup content when opened (fetches weather on demand)
          popup.on('open', async () => {
            const weather = await fetchWeather(lat!, lng!);
            popup.setHTML(createPopupHTML(vehicle, weather, oilChangeDue, hasFaultCodes));
          });

          // Set initial content without weather
          popup.setHTML(createPopupHTML(vehicle, null, oilChangeDue, hasFaultCodes));

          const marker = new mapboxgl.Marker({
            element: el,
            anchor: 'bottom',
            offset: [0, 0]
          })
            .setLngLat([lng, lat])
            .setPopup(popup)
            .addTo(map.current!);

          markersRef.current.set(vehicle.id, { marker, popup });
        }
      }

      // Remove markers for vehicles no longer in the list
      existingVehicleIds.forEach(id => {
        if (!currentVehicleIds.has(id)) {
          const markerData = markersRef.current.get(id);
          if (markerData) {
            markerData.marker.remove();
            markersRef.current.delete(id);
          }
        }
      });

      // Fit map to show all markers only on initial load
      if (!initialBoundsSet.current && markersRef.current.size > 0 && bounds.getNorthEast()) {
        map.current!.fitBounds(bounds, {
          padding: 50,
          maxZoom: 12,
        });
        initialBoundsSet.current = true;
      }
    };

    // Helper function to create popup HTML
    const createPopupHTML = (vehicle: any, weather: any, oilChangeDue: boolean, hasFaultCodes: boolean) => `
      <div style="padding: 0; font-family: system-ui, -apple-system, sans-serif; min-width: 240px; border-radius: 12px; overflow: hidden;">
        <!-- Header -->
        <div style="padding: 10px 12px; background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)) 100%); color: white; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/>
              <circle cx="6.5" cy="16.5" r="2.5"/>
              <circle cx="16.5" cy="16.5" r="2.5"/>
            </svg>
            <span style="font-size: 15px; font-weight: 600;">${vehicle.vehicle_number || 'Unknown'}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            ${oilChangeDue ? `<img src="${oilChangeIcon}" alt="Oil Change Due" style="width: 16px; height: 16px;" />` : ''}
            ${hasFaultCodes ? `<img src="${checkEngineIcon}" alt="Check Engine" style="width: 16px; height: 16px;" />` : ''}
            <div style="background: #10b981; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
              ${vehicle.speed || 0} MPH
            </div>
          </div>
        </div>
        
        ${weather ? `
        <!-- Weather Info Compact -->
        <div style="padding: 8px 12px; background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%); color: white; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <img src="https:${weather.icon}" alt="${weather.condition}" style="width: 28px; height: 28px;" />
            <div>
              <div style="font-size: 16px; font-weight: 700;">${Math.round(weather.temperature)}°F</div>
              <div style="font-size: 10px; opacity: 0.9;">${weather.condition}</div>
            </div>
          </div>
          <div style="text-align: right; font-size: 10px; opacity: 0.9;">
            <div>${weather.humidity}% humidity</div>
            <div>${Math.round(weather.wind_mph)} mph wind</div>
          </div>
        </div>
        ` : ''}
        
        <!-- Location Info -->
        <div style="padding: 8px 12px; background: white; border-bottom: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #6b7280; font-size: 11px; line-height: 1.4;">
            ${vehicle.formatted_address || vehicle.last_location || 'Location unavailable'}
          </p>
        </div>
        
        ${vehicle.odometer ? `
        <div style="padding: 6px 12px; background: white; display: flex; align-items: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          <span style="color: #374151; font-size: 11px;">
            <strong>${vehicle.odometer.toLocaleString()}</strong> miles
          </span>
        </div>
        ` : ''}
      </div>
    `;

    updateMarkers();
  }, [vehicles]);


  // Count vehicles by status
  const movingCount = vehicles.filter(v => (v.speed || 0) > 0).length;
  const idlingCount = vehicles.filter(v => (v.speed || 0) === 0 && v.stopped_status === 'idling').length;
  const parkedCount = vehicles.filter(v => (v.speed || 0) === 0 && v.stopped_status !== 'idling').length;
  const alertCount = vehicles.filter(v => 
    (v.oil_change_remaining !== null && v.oil_change_remaining <= 0) || 
    (v.fault_codes && Array.isArray(v.fault_codes) && v.fault_codes.length > 0)
  ).length;

  // Render vehicle card for both mobile and desktop
  const renderVehicleCard = (vehicle: any) => {
    const speed = vehicle.speed || 0;
    const stoppedStatus = vehicle.stopped_status;
    const isSelected = selectedVehicle === vehicle.id;
    
    let statusIcon: React.ReactNode;
    let statusBg = '';
    let statusText = '';
    
    if (speed > 0) {
      statusIcon = <Navigation className="h-3 w-3 text-white" />;
      statusBg = 'bg-emerald-500';
      statusText = 'Driving';
    } else if (stoppedStatus === 'idling') {
      statusIcon = <div className="flex gap-0.5"><div className="w-0.5 h-2 bg-white rounded" /><div className="w-0.5 h-2 bg-white rounded" /></div>;
      statusBg = 'bg-amber-500';
      statusText = 'Idling';
    } else {
      statusIcon = <span className="text-white font-bold text-[10px]">P</span>;
      statusBg = 'bg-blue-500';
      statusText = 'Parked';
    }
    
    const oilChangeDue = vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining <= 0;
    const hasFaultCodes = vehicle.fault_codes && Array.isArray(vehicle.fault_codes) && vehicle.fault_codes.length > 0;
    const hasAlert = oilChangeDue || hasFaultCodes;
    
    return (
      <div
        key={vehicle.id}
        className={`
          group relative p-3 rounded-xl transition-all duration-200 
          ${isSelected 
            ? 'bg-primary/10 border-primary/30 shadow-md ring-1 ring-primary/20' 
            : 'bg-card/50 hover:bg-card/80 border-border/50 hover:border-border hover:shadow-sm'
          }
          border backdrop-blur-sm
          ${hasAlert ? 'border-l-2 border-l-destructive' : ''}
        `}
      >
        <div 
          className="flex items-start justify-between gap-3 cursor-pointer"
          onClick={() => handleVehicleClick(vehicle.id)}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Status indicator */}
            <div className={`
              flex items-center justify-center w-8 h-8 rounded-lg ${statusBg} 
              shadow-sm transition-transform group-hover:scale-105
            `}>
              {statusIcon}
            </div>
            
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground truncate">
                  {vehicle.vehicle_number || 'Unknown'}
                </span>
                {hasAlert && (
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {vehicle.formatted_address || vehicle.last_location || 'Location unavailable'}
              </p>
            </div>
          </div>
          
          {/* Speed badge */}
          <div className="flex flex-col items-end gap-1">
            <div className={`
              px-2.5 py-1 rounded-full text-xs font-bold
              ${speed > 0 
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
                : 'bg-muted text-muted-foreground'
              }
            `}>
              {speed} mph
            </div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {statusText}
            </span>
          </div>
        </div>
        
        {/* Action row with history button */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2">
            {oilChangeDue && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <img src={oilChangeIcon} alt="Oil change" className="h-4 w-4" />
                <span>Oil change due</span>
              </div>
            )}
            {hasFaultCodes && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <img src={checkEngineIcon} alt="Check engine" className="h-4 w-4" />
                <span>{vehicle.fault_codes.length} fault{vehicle.fault_codes.length > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
          
          {/* History button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1.5"
            onClick={(e) => {
              e.stopPropagation();
              enterHistoryMode(vehicle.id);
            }}
          >
            <History className="h-3.5 w-3.5" />
            History
          </Button>
        </div>
      </div>
    );
  };

  // Get selected vehicle name for history controls
  const selectedVehicleForHistory = vehicles.find(v => v.id === vehicleHistory.selectedVehicleId);

  return (
    <div className="h-[calc(100vh-120px)] md:h-[calc(100vh-120px)] relative flex flex-col md:flex-row md:gap-4">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-80 max-w-sm bg-background/80 backdrop-blur-xl border rounded-2xl shadow-xl overflow-hidden flex-col">
        {/* Header */}
        <div className="px-4 py-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Fleet Tracker</h3>
                <p className="text-xs text-muted-foreground">
                  {vehicles.length} active asset{vehicles.length !== 1 ? 's' : ''}
                  {filterMode === 'my-trucks' && allVehicles.length !== vehicles.length && (
                    <span className="text-muted-foreground/70"> of {allVehicles.length}</span>
                  )}
                </p>
              </div>
            </div>
          </div>
          
          {/* Filter Toggle - My Trucks / All */}
          {(isAdmin || currentDispatcherId) && (
            <div className="flex items-center justify-between mt-3 p-2 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="fleet-filter" className="text-xs font-medium cursor-pointer">
                  {filterMode === 'all' ? 'All Trucks' : 'My Trucks'}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">My</span>
                <Switch
                  id="fleet-filter"
                  checked={filterMode === 'all'}
                  onCheckedChange={(checked) => setFilterMode(checked ? 'all' : 'my-trucks')}
                  disabled={!isAdmin && !currentDispatcherId}
                />
                <span className="text-[10px] text-muted-foreground">All</span>
              </div>
            </div>
          )}
          
          {/* Quick stats */}
          <div className="flex gap-2 mt-3">
            <div className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/10 text-center">
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{movingCount}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Driving</div>
            </div>
            <div className="flex-1 px-3 py-2 rounded-lg bg-amber-500/10 text-center">
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{idlingCount}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Idling</div>
            </div>
            <div className="flex-1 px-3 py-2 rounded-lg bg-blue-500/10 text-center">
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{parkedCount}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Parked</div>
            </div>
            {alertCount > 0 && (
              <div className="flex-1 px-3 py-2 rounded-lg bg-destructive/10 text-center">
                <div className="text-lg font-bold text-destructive">{alertCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Alerts</div>
              </div>
            )}
          </div>
        </div>
        
        {/* Vehicle list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {vehicles.map(renderVehicleCard)}
          {vehicles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <Truck className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No assets with GPS</p>
              <p className="text-xs text-muted-foreground mt-1">Sync with Samsara to get started</p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-4 py-3 border-t bg-muted/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
            <span>Updated {lastUpdate.toLocaleTimeString()}</span>
            <span className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <Button 
            onClick={handleSync} 
            disabled={syncing}
            size="sm"
            className="w-full"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync with Samsara'}
          </Button>
        </div>
      </aside>

      {/* Map container - full width on mobile */}
      <div className="relative flex-1 h-full">
        <div ref={mapContainer} className="absolute inset-0 md:rounded-2xl" />
        
        {/* History mode controls */}
        <VehicleHistoryControls
          isActive={historyMode}
          selectedDate={vehicleHistory.selectedDate}
          selectedVehicleName={selectedVehicleForHistory?.vehicle_number || null}
          pointsCount={vehicleHistory.points.length}
          loading={vehicleHistory.loading}
          hasStarted={vehicleHistory.hasStarted}
          onPreviousDay={vehicleHistory.goToPreviousDay}
          onNextDay={vehicleHistory.goToNextDay}
          onDateSelect={vehicleHistory.setSelectedDate}
          onStart={vehicleHistory.startHistory}
          onClose={exitHistoryMode}
        />
        
        {/* Map controls - repositioned for mobile */}
        <div className={`absolute z-10 flex gap-2 ${isMobile ? 'top-4 left-4' : 'top-4 right-4 flex-col'}`}>
          {/* Mobile: Quick stats bar with toggle buttons */}
          {isMobile && (
            <div className="flex items-center gap-2 bg-background/90 backdrop-blur-xl rounded-full px-3 py-1.5 shadow-lg border">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium">{movingCount}</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-xs font-medium">{idlingCount}</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-xs font-medium">{parkedCount}</span>
              </div>
              {alertCount > 0 && (
                <>
                  <div className="w-px h-4 bg-border" />
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                    <span className="text-xs font-medium text-destructive">{alertCount}</span>
                  </div>
                </>
              )}
              <div className="w-px h-4 bg-border" />
              <button
                onClick={toggleMapStyle}
                className="p-1 rounded-full hover:bg-muted/50"
              >
                {mapStyle === 'streets' ? (
                  <Satellite className="h-4 w-4" />
                ) : (
                  <MapIcon className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => setShowWeatherLayer(!showWeatherLayer)}
                className={`p-1 rounded-full ${showWeatherLayer ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`}
              >
                <Cloud className="h-4 w-4" />
              </button>
            </div>
          )}
          
          {/* Desktop: Control buttons */}
          {!isMobile && (
            <div className="flex flex-col gap-2">
              <Button
                onClick={toggleMapStyle}
                size="sm"
                variant="secondary"
                className="shadow-lg backdrop-blur-sm bg-background/90 hover:bg-background"
              >
                {mapStyle === 'streets' ? (
                  <>
                    <Satellite className="h-4 w-4" />
                    <span className="ml-2">Satellite</span>
                  </>
                ) : (
                  <>
                    <MapIcon className="h-4 w-4" />
                    <span className="ml-2">Streets</span>
                  </>
                )}
              </Button>
              <Button
                onClick={() => setShowWeatherLayer(!showWeatherLayer)}
                size="sm"
                variant={showWeatherLayer ? "default" : "secondary"}
                className={`shadow-lg ${!showWeatherLayer ? 'backdrop-blur-sm bg-background/90 hover:bg-background' : ''}`}
              >
                <Cloud className="h-4 w-4" />
                <span className="ml-2">Weather</span>
              </Button>
            </div>
          )}
        </div>
        
        {/* Legend Button & Panel */}
        <div className={`absolute z-10 ${isMobile ? 'bottom-44 left-4' : 'bottom-4 left-4'}`}>
          <Button
            onClick={() => setShowLegend(!showLegend)}
            size="sm"
            variant="secondary"
            className="shadow-lg backdrop-blur-sm bg-background/90 hover:bg-background"
          >
            <Info className="h-4 w-4" />
            {!isMobile && <span className="ml-2">Legend</span>}
          </Button>
          
          {showLegend && (
            <div className="absolute bottom-12 left-0 bg-background/95 backdrop-blur-xl border rounded-xl shadow-xl p-4 min-w-[200px] animate-in slide-in-from-bottom-2">
              <h4 className="font-semibold text-sm mb-3 text-foreground">Vehicle Status</h4>
              <div className="space-y-2.5">
                {/* Driving */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="white">
                      <polygon points="10,2 18,16 12,16 12,18 8,18 8,16 2,16"/>
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Driving</div>
                    <div className="text-xs text-muted-foreground">Engine on, moving</div>
                  </div>
                </div>
                
                {/* Idling */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center shadow-sm">
                    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                      <path d="M2,3 Q5,0 8,3 Q11,6 14,3"/>
                      <path d="M2,9 Q5,6 8,9 Q11,12 14,9"/>
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Idling</div>
                    <div className="text-xs text-muted-foreground">Engine on, stationary</div>
                  </div>
                </div>
                
                {/* Parked */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shadow-sm">
                    <span className="text-white font-bold text-sm">P</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Parked</div>
                    <div className="text-xs text-muted-foreground">Engine off</div>
                  </div>
                </div>
                
                <div className="border-t pt-2.5 mt-2.5">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Alerts</div>
                  
                  {/* Fault */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow-sm relative">
                      <span className="text-white font-bold text-sm">!</span>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Fault Code</div>
                      <div className="text-xs text-muted-foreground">Check engine light</div>
                    </div>
                  </div>
                  
                  {/* Service */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center shadow-sm">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                        <path d="M6,2 L6,6 M4,5 L8,5"/>
                        <circle cx="6" cy="9" r="1" fill="white"/>
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Service Due</div>
                      <div className="text-xs text-muted-foreground">Oil change needed</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Mobile: Sync button */}
        {isMobile && (
          <Button
            onClick={handleSync}
            disabled={syncing}
            size="icon"
            variant="secondary"
            className="absolute bottom-44 right-4 z-10 shadow-lg backdrop-blur-sm bg-background/90 hover:bg-background h-12 w-12 rounded-full"
          >
            <RefreshCw className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      {/* Mobile: Bottom Sheet */}
      {isMobile && (
        <div 
          className={`
            fixed left-0 right-0 z-20
            bg-background/95 backdrop-blur-xl border-t rounded-t-3xl shadow-2xl
            transition-all duration-300 ease-out
            ${mobileSheetExpanded ? 'h-[70vh]' : 'h-auto'}
          `}
          style={{ bottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {/* Handle bar */}
          <button
            onClick={() => setMobileSheetExpanded(!mobileSheetExpanded)}
            className="w-full flex flex-col items-center pt-3 pb-2 touch-manipulation"
          >
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </button>
          
          {/* Header */}
          <div className="px-4 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Truck className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Fleet Tracker</h3>
                <p className="text-xs text-muted-foreground">
                  {vehicles.length} active • Updated {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Mobile filter toggle */}
              {(isAdmin || currentDispatcherId) && (
                <button
                  onClick={() => setFilterMode(filterMode === 'all' ? 'my-trucks' : 'all')}
                  className={`
                    px-2 py-1 rounded-md text-[10px] font-medium transition-colors
                    ${filterMode === 'my-trucks' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground'
                    }
                  `}
                >
                  {filterMode === 'my-trucks' ? 'My' : 'All'}
                </button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileSheetExpanded(!mobileSheetExpanded)}
                className="h-8 w-8"
              >
                {mobileSheetExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
              </Button>
            </div>
          </div>
          
          {/* Expanded content */}
          {mobileSheetExpanded && (
            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2" style={{ maxHeight: 'calc(70vh - 80px)' }}>
              {vehicles.map(renderVehicleCard)}
              {vehicles.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
                    <Truck className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">No assets with GPS</p>
                  <p className="text-xs text-muted-foreground mt-1">Sync with Samsara to get started</p>
                </div>
              )}
            </div>
          )}
          
          {/* Collapsed: Quick vehicle preview */}
          {!mobileSheetExpanded && vehicles.length > 0 && (
            <div className="px-4 pb-6">
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                {vehicles.slice(0, 5).map((vehicle) => {
                  const speed = vehicle.speed || 0;
                  const stoppedStatus = vehicle.stopped_status;
                  const hasAlert = (vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining <= 0) || 
                    (vehicle.fault_codes && Array.isArray(vehicle.fault_codes) && vehicle.fault_codes.length > 0);
                  
                  // Determine status color
                  let statusColor = 'bg-blue-500'; // Parked
                  if (speed > 0) statusColor = 'bg-emerald-500'; // Driving
                  else if (stoppedStatus === 'idling') statusColor = 'bg-amber-500'; // Idling
                  
                  return (
                    <button
                      key={vehicle.id}
                      onClick={() => handleVehicleClick(vehicle.id)}
                      className={`
                        flex-shrink-0 px-4 py-2.5 rounded-xl border transition-all
                        ${selectedVehicle === vehicle.id 
                          ? 'bg-primary/10 border-primary/30' 
                          : 'bg-card/50 border-border/50 active:scale-95'
                        }
                        ${hasAlert ? 'border-l-2 border-l-destructive' : ''}
                      `}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                        <span className="font-medium text-sm">{vehicle.vehicle_number || 'N/A'}</span>
                        <span className="text-xs text-muted-foreground">{speed} mph</span>
                      </div>
                    </button>
                  );
                })}
                {vehicles.length > 5 && (
                  <button
                    onClick={() => setMobileSheetExpanded(true)}
                    className="flex-shrink-0 px-4 py-2.5 rounded-xl border border-dashed border-border/50 text-muted-foreground text-sm"
                  >
                    +{vehicles.length - 5} more
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MapTab;
