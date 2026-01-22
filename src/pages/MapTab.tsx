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

// Samsara can report small non-zero speeds while a vehicle is effectively stopped.
// Use a threshold to avoid misclassifying idle/parked as driving.
const MOVING_SPEED_THRESHOLD_MPH = 2;

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
  
  // Status filter state
  type StatusFilter = 'all' | 'driving' | 'idling' | 'parked';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const getVehicleStatus = useCallback((v: any): Exclude<StatusFilter, 'all'> => {
    const speed = v?.speed ?? 0;
    const engineState = (v?.provider_status ?? '').toString().trim().toLowerCase();
    const hasEngineState = engineState.length > 0;
    const engineOff = engineState === 'off';

    if (speed > MOVING_SPEED_THRESHOLD_MPH) return 'driving';
    if (hasEngineState && !engineOff) return 'idling';
    return 'parked';
  }, []);
  
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
  
  // Filter vehicles based on mode, dispatcher assignment, and status
  const vehicles = useCallback(() => {
    let filtered = allVehicles;
    
    // "My Trucks" mode - filter to only assigned trucks
    if (filterMode !== 'all' && currentDispatcherId) {
      filtered = filtered.filter(v => 
        v.primary_dispatcher_id === currentDispatcherId ||
        (Array.isArray(v.secondary_dispatcher_ids) && v.secondary_dispatcher_ids.includes(currentDispatcherId))
      );
    } else if (filterMode !== 'all' && !currentDispatcherId) {
      // No dispatcher ID means they have no assigned trucks in "My" mode
      return [];
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(v => {
        const status = getVehicleStatus(v);
        if (statusFilter === 'driving') return status === 'driving';
        if (statusFilter === 'idling') return status === 'idling';
        if (statusFilter === 'parked') return status === 'parked';
        return true;
      });
    }
    
    return filtered;
  }, [allVehicles, filterMode, currentDispatcherId, statusFilter, getVehicleStatus])();

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
    try {
      if (!tenantId) {
        toast.error('No tenant selected');
        return;
      }

      // Ensure we have a real user session; otherwise Supabase will send the anon key
      // as the Bearer token, which will be rejected by tenant access checks.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Please sign in to sync vehicles');
        return;
      }

      setSyncing(true);

      // Pass tenantId to sync only this tenant's vehicles
      const { data, error } = await supabase.functions.invoke('sync-vehicles-samsara', {
        body: { tenant_id: tenantId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
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

    // Add markers for ALL points with hover popups
    points.forEach((point, index) => {
      const isStart = index === 0;
      const isEnd = index === points.length - 1;
      const isMoving = point.speed !== null && point.speed > 0;
      const hasHeading = point.heading !== null;
      
      // Format odometer
      const odometerText = point.odometer 
        ? `${Math.round(point.odometer).toLocaleString()} mi` 
        : 'N/A';
      
      // Format speed
      const speedText = point.speed !== null ? `${Math.round(point.speed)} mph` : 'N/A';
      
      // Format location (city, state from Samsara)
      const locationText = point.formatted_location || 'Location unavailable';
      
      // Format time
      const timeText = new Date(point.recorded_at).toLocaleTimeString();
      
      // Create marker element
      const el = document.createElement('div');
      
      if (isStart) {
        // Start marker (green, larger)
        el.innerHTML = `
          <div class="flex items-center justify-center w-6 h-6 bg-emerald-500 rounded-full border-2 border-white shadow-lg cursor-pointer">
            <span class="text-white text-xs font-bold">S</span>
          </div>
        `;
      } else if (isEnd) {
        // End marker (red, larger)
        el.innerHTML = `
          <div class="flex items-center justify-center w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg cursor-pointer">
            <span class="text-white text-xs font-bold">E</span>
          </div>
        `;
      } else if (isMoving && hasHeading) {
        // Moving point with heading - green arrow rotated to direction
        const rotation = point.heading || 0;
        el.innerHTML = `
          <div style="transform: rotate(${rotation}deg); transition: transform 0.2s;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#10b981" class="cursor-pointer hover:scale-125 transition-transform drop-shadow-md">
              <path d="M12 2L4 20h16L12 2z" stroke="white" stroke-width="1.5"/>
            </svg>
          </div>
        `;
      } else if (isMoving) {
        // Moving but no heading - green dot
        el.innerHTML = `
          <div class="w-3.5 h-3.5 bg-emerald-500 rounded-full border border-white shadow-md cursor-pointer hover:scale-150 transition-transform"></div>
        `;
      } else {
        // Stationary point - small blue dot
        el.innerHTML = `
          <div class="w-2.5 h-2.5 bg-blue-400 rounded-full border border-white shadow-sm cursor-pointer hover:scale-150 transition-transform opacity-70"></div>
        `;
      }
      
      // Create popup with all the info
      const popupHtml = `
        <div style="padding: 8px 10px; min-width: 160px; font-family: system-ui, sans-serif;">
          <div style="font-weight: 600; font-size: 11px; color: #374151; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">
            ${isStart ? '🟢 Start' : isEnd ? '🔴 End' : '📍 Point ' + (index + 1)}
            <span style="float: right; font-weight: 400; color: #6b7280;">${timeText}</span>
          </div>
          <div style="display: grid; gap: 4px; font-size: 11px;">
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #6b7280;">Speed:</span>
              <span style="font-weight: 600; color: ${point.speed && point.speed > 0 ? '#10b981' : '#6b7280'};">${speedText}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #6b7280;">Odometer:</span>
              <span style="font-weight: 600; color: #374151;">${odometerText}</span>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 10px;">📍 ${locationText}</span>
            </div>
          </div>
        </div>
      `;
      
      const popup = new mapboxgl.Popup({ 
        offset: isStart || isEnd ? 12 : 8,
        closeButton: false,
        closeOnClick: false,
      }).setHTML(popupHtml);
      
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([point.longitude, point.latitude])
        .setPopup(popup)
        .addTo(map.current!);
      
      // Show popup on hover
      el.addEventListener('mouseenter', () => popup.addTo(map.current!));
      el.addEventListener('mouseleave', () => popup.remove());
      
      historyMarkersRef.current.push(marker);
    });

    // Fit bounds to show all points
    const bounds = new mapboxgl.LngLatBounds();
    points.forEach(p => bounds.extend([p.longitude, p.latitude]));
    map.current.fitBounds(bounds, { padding: 60, maxZoom: 14 });
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
    if (!map.current) return;

    // Clear markers not in the current filtered vehicle list
    const currentVehicleIds = new Set(vehicles.map(v => v.id));
    markersRef.current.forEach(({ marker }, vehicleId) => {
      if (!currentVehicleIds.has(vehicleId)) {
        marker.remove();
        markersRef.current.delete(vehicleId);
      }
    });

    if (vehicles.length === 0) return;

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
          
           const status = getVehicleStatus(vehicle);
           const isMoving = status === 'driving';
           const isIdling = status === 'idling';
          
          // Get heading for rotation (0 = North, 90 = East, etc.)
          const heading = vehicle.heading || 0;
          
          if (isMoving) {
            // DRIVING - Green with directional arrow rotated to heading
            bgColor = '#10b981';
            borderColor = '#059669';
            pulseRing = `
              <circle cx="18" cy="16" r="14" fill="none" stroke="#10b981" stroke-width="2" opacity="0.4">
                <animate attributeName="r" values="14;18;14" dur="1.5s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.4;0;0.4" dur="1.5s" repeatCount="indefinite"/>
              </circle>
            `;
            // Arrow rotated to heading direction
            statusIcon = `
              <g transform="rotate(${heading}, 18, 16)">
                <polygon points="18,6 24,20 18,17 12,20" fill="${bgColor}" stroke="${borderColor}" stroke-width="0.5"/>
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
            // PARKED (Engine Off) - Black with P icon
            bgColor = '#1f2937';
            borderColor = '#111827';
            // Bold P icon
            statusIcon = `
              <text x="18" y="21" font-size="14" font-weight="900" fill="${bgColor}" text-anchor="middle" font-family="system-ui, sans-serif">P</text>
            `;
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
    const createPopupHTML = (vehicle: any, weather: any, oilChangeDue: boolean, hasFaultCodes: boolean) => {
      // Format the location timestamp
      const locationTime = vehicle.last_updated 
        ? new Date(vehicle.last_updated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
        : null;
      
      return `
      <div style="padding: 0; font-family: system-ui, -apple-system, sans-serif; min-width: 220px; max-width: 260px; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.18);">
        <!-- Header - Puffy gradient -->
        <div style="padding: 10px 12px; background: linear-gradient(180deg, hsl(221, 83%, 58%) 0%, hsl(221, 83%, 48%) 100%); color: white; display: flex; justify-content: space-between; align-items: center; box-shadow: inset 0 1px 0 rgba(255,255,255,0.2);">
          <div style="display: flex; align-items: center; gap: 6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/>
              <circle cx="6.5" cy="16.5" r="2.5"/>
              <circle cx="16.5" cy="16.5" r="2.5"/>
            </svg>
            <span style="font-size: 14px; font-weight: 700;">${vehicle.vehicle_number || 'Unknown'}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            ${oilChangeDue ? `<img src="${oilChangeIcon}" alt="Oil Change Due" style="width: 14px; height: 14px;" />` : ''}
            ${hasFaultCodes ? `<img src="${checkEngineIcon}" alt="Check Engine" style="width: 14px; height: 14px;" />` : ''}
            <div style="background: linear-gradient(180deg, #22c55e 0%, #16a34a 100%); padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.25);">
              ${vehicle.speed || 0} MPH
            </div>
          </div>
        </div>
        
        ${weather ? `
        <!-- Weather - Compact puffy -->
        <div style="padding: 6px 10px; background: linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%); color: white; display: flex; align-items: center; justify-content: space-between; box-shadow: inset 0 1px 0 rgba(255,255,255,0.15);">
          <div style="display: flex; align-items: center; gap: 4px;">
            <img src="https:${weather.icon}" alt="${weather.condition}" style="width: 24px; height: 24px;" />
            <div>
              <div style="font-size: 14px; font-weight: 700;">${Math.round(weather.temperature)}°F</div>
              <div style="font-size: 9px; opacity: 0.85;">${weather.condition}</div>
            </div>
          </div>
          <div style="text-align: right; font-size: 9px; opacity: 0.85;">
            <div>${weather.humidity}% humidity</div>
            <div>${Math.round(weather.wind_mph)} mph wind</div>
          </div>
        </div>
        ` : ''}
        
        <!-- Location + Time - Puffy card -->
        <div style="padding: 8px 10px; background: linear-gradient(180deg, #fafafa 0%, #f3f4f6 100%); border-bottom: 1px solid #e5e7eb;">
          <p style="margin: 0 0 4px 0; color: #374151; font-size: 11px; line-height: 1.3; font-weight: 500;">
            ${vehicle.formatted_address || vehicle.last_location || 'Location unavailable'}
          </p>
          ${locationTime ? `
          <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px;">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            <span style="color: #6b7280; font-size: 10px;">Updated ${locationTime}</span>
          </div>
          ` : ''}
        </div>
        
        ${vehicle.odometer ? `
        <!-- Odometer - Puffy pill -->
        <div style="padding: 6px 10px; background: white; display: flex; align-items: center; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 4px; background: linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%); padding: 3px 8px; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8);">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            <span style="color: #374151; font-size: 10px; font-weight: 600;">
              ${vehicle.odometer.toLocaleString()} mi
            </span>
          </div>
        </div>
        ` : ''}
      </div>
    `;
    };

    updateMarkers();
  }, [vehicles, filterMode, statusFilter]);


  // Count vehicles by status (from allVehicles for consistent counts, but filtered by dispatcher mode)
  const baseVehicles = filterMode === 'all' ? allVehicles : (currentDispatcherId ? allVehicles.filter(v => 
    v.primary_dispatcher_id === currentDispatcherId ||
    (Array.isArray(v.secondary_dispatcher_ids) && v.secondary_dispatcher_ids.includes(currentDispatcherId))
  ) : []);
   const movingCount = baseVehicles.filter(v => getVehicleStatus(v) === 'driving').length;
   const idlingCount = baseVehicles.filter(v => getVehicleStatus(v) === 'idling').length;
   const parkedCount = baseVehicles.filter(v => getVehicleStatus(v) === 'parked').length;

  // Render vehicle card - Modern puffy style
  const renderVehicleCard = (vehicle: any, index: number) => {
    const speed = vehicle.speed || 0;
    const status = getVehicleStatus(vehicle);
    const isSelected = selectedVehicle === vehicle.id;
    const isHistorySelected = vehicleHistory.selectedVehicleId === vehicle.id;
    const isHistoryStarted = isHistorySelected && vehicleHistory.hasStarted;
    const isViewingHistory = isHistoryStarted;
    
    let statusGradient = '';
    let statusBorderColor = '';
    let statusText = '';
    
    if (status === 'driving') {
      statusGradient = 'linear-gradient(180deg, #34d399 0%, #10b981 100%)';
      statusBorderColor = '#059669';
      statusText = 'DRIVING';
    } else if (status === 'idling') {
      statusGradient = 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)';
      statusBorderColor = '#d97706';
      statusText = 'IDLING';
    } else {
      statusGradient = 'linear-gradient(180deg, #374151 0%, #1f2937 100%)';
      statusBorderColor = '#111827';
      statusText = 'PARKED';
    }
    
    const oilChangeDue = vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining <= 0;
    const hasFaultCodes = vehicle.fault_codes && Array.isArray(vehicle.fault_codes) && vehicle.fault_codes.length > 0;
    
    // Determine card styling based on state - Modern puffy design
    const getCardStyle = () => {
      if (isSelected) {
        return {
          background: 'linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)',
          boxShadow: '0 0 0 2px #3b82f6, 0 6px 16px rgba(59,130,246,0.25), inset 0 1px 0 rgba(255,255,255,1)',
          border: 'none',
          borderRadius: '16px',
        };
      }
      return {
        background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 14% 97%) 100%)',
        boxShadow: '0 2px 8px rgba(37,99,235,0.08), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(37,99,235,0.05)',
        border: '1px solid hsl(220 13% 90%)',
        borderRadius: '16px',
      };
    };
    
    return (
      <div
        key={vehicle.id}
        className={`
          group flex items-center gap-3 p-2.5 cursor-pointer transition-all duration-200
          hover:scale-[1.02] hover:shadow-md
        `}
        style={getCardStyle()}
        onClick={() => handleVehicleClick(vehicle.id)}
      >
        {/* Status badge - puffy rounded */}
        <div 
          className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-transform group-hover:scale-105"
          style={{
            background: statusGradient,
            boxShadow: `0 4px 12px ${statusBorderColor}40, inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 ${statusBorderColor}`,
          }}
        >
          {status === 'driving' ? (
            <Navigation className="h-4.5 w-4.5 text-white" />
          ) : status === 'idling' ? (
            <div className="flex gap-0.5">
              <div className="w-0.5 h-3 bg-white rounded-full" />
              <div className="w-0.5 h-3 bg-white rounded-full" />
            </div>
          ) : (
            <span className="text-white font-black text-sm">P</span>
          )}
        </div>
        
        {/* Vehicle info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm text-foreground truncate">
              {vehicle.vehicle_number || 'Unknown'}
            </span>
            {oilChangeDue && (
              <img src={oilChangeIcon} alt="Oil change" className="h-4 w-4 flex-shrink-0" />
            )}
            {hasFaultCodes && (
              <img src={checkEngineIcon} alt="Check engine" className="h-4 w-4 flex-shrink-0" />
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
            {vehicle.formatted_address || vehicle.last_location || 'Location unavailable'}
          </p>
        </div>
        
        {/* Speed badge - puffy pill */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div 
            className="px-2.5 py-1 rounded-full text-xs font-bold text-white"
            style={{
              background: statusGradient,
              boxShadow: `0 2px 6px ${statusBorderColor}35, inset 0 1px 0 rgba(255,255,255,0.2)`,
            }}
          >
            {speed} mph
          </div>
          <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
            {statusText}
          </span>
        </div>
        
        {/* History button - puffy style */}
        <button
          className={`flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0 transition-all hover:scale-110 ${isHistoryStarted ? 'animate-pulse' : ''}`}
          style={isHistoryStarted ? {
            background: 'linear-gradient(180deg, #34d399 0%, #10b981 100%)',
            boxShadow: '0 0 16px rgba(16,185,129,0.5), 0 4px 12px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.3)',
          } : isHistorySelected ? {
            background: 'linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)',
            boxShadow: '0 0 0 2px #10b981, 0 2px 8px rgba(16,185,129,0.2)',
          } : {
            background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 14% 96%) 100%)',
            boxShadow: '0 2px 6px rgba(37,99,235,0.1), inset 0 1px 0 rgba(255,255,255,0.9)',
            border: '1px solid hsl(220 13% 88%)',
          }}
          onClick={(e) => {
            e.stopPropagation();
            enterHistoryMode(vehicle.id);
          }}
          title={isHistoryStarted ? "Viewing history" : isHistorySelected ? "Click Start to view" : "View history"}
        >
          <History className={`h-4 w-4 ${isHistoryStarted ? 'text-white' : isHistorySelected ? 'text-emerald-700' : 'text-primary'}`} />
        </button>
      </div>
    );
  };

  // Get selected vehicle name for history controls
  const selectedVehicleForHistory = vehicles.find(v => v.id === vehicleHistory.selectedVehicleId);

  return (
    <div className="h-[calc(100vh-120px)] md:h-[calc(100vh-120px)] relative flex flex-col md:flex-row md:gap-4">
      {/* Desktop Sidebar - Classic Blue Style */}
      <aside 
        className="hidden md:flex w-72 max-w-sm overflow-hidden flex-col rounded-2xl"
        style={{
          background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 14% 98%) 50%, hsl(220 14% 96%) 100%)',
          boxShadow: '0 8px 30px rgba(37,99,235,0.12), 0 2px 10px rgba(37,99,235,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
          border: '1px solid hsl(220 13% 85%)',
        }}
      >
        {/* Header - Modern Puffy Blue gradient with timestamp */}
        <div 
          className="px-3 py-3"
          style={{
            background: 'linear-gradient(135deg, hsl(221 83% 53%) 0%, hsl(221 83% 60%) 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 8px rgba(37,99,235,0.25)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.1) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.15)',
                  border: '1px solid rgba(255,255,255,0.2)',
                }}
              >
                <Truck className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Fleet Tracker</h3>
                <p className="text-[11px] text-white/75">
                  {vehicles.length} asset{vehicles.length !== 1 ? 's' : ''}
                  {filterMode === 'my-trucks' && allVehicles.length !== vehicles.length && (
                    <span className="text-white/50"> of {allVehicles.length}</span>
                  )}
                </p>
              </div>
            </div>
            {/* Last Updated timestamp */}
            <div className="text-right">
              <div className="text-[10px] text-white/60 font-medium">Updated</div>
              <div className="text-xs text-white font-semibold">
                {lastUpdate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
              </div>
            </div>
          </div>
        </div>
        
        {/* Filter + Stats section - compact */}
        <div className="px-2 py-1.5 space-y-1.5">
          {/* Filter Toggle */}
          {(isAdmin || currentDispatcherId) && (
            <div 
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
              style={{
                background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 14% 96%) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 2px 4px rgba(0,0,0,0.06)',
                border: '1px solid hsl(220 13% 88%)',
              }}
            >
              <Users className="h-3.5 w-3.5 text-blue-600 shrink-0" />
              
              <div 
                className="flex gap-1 flex-1"
                style={{
                  background: 'hsl(220 14% 90%)',
                  padding: '3px',
                  borderRadius: '8px',
                }}
              >
                {/* All Fleet - Left */}
                <button
                  onClick={() => setFilterMode('all')}
                  disabled={!isAdmin && !currentDispatcherId}
                  className={`
                    flex-1 px-3 py-1.5 text-[10px] font-bold rounded-md transition-all
                    ${!isAdmin && !currentDispatcherId ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                  style={filterMode === 'all' ? {
                    background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    boxShadow: '0 2px 6px rgba(37,99,235,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                    border: '1px solid rgba(30,64,175,0.3)',
                  } : {
                    background: 'transparent',
                    color: '#6b7280',
                  }}
                >
                  All Fleet
                </button>
                
                {/* My Trucks - Right */}
                <button
                  onClick={() => setFilterMode('my-trucks')}
                  disabled={!currentDispatcherId}
                  className={`
                    flex-1 px-3 py-1.5 text-[10px] font-bold rounded-md transition-all
                    ${!currentDispatcherId ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                  style={filterMode === 'my-trucks' ? {
                    background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    boxShadow: '0 2px 6px rgba(5,150,105,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                    border: '1px solid rgba(4,120,87,0.3)',
                  } : {
                    background: 'transparent',
                    color: '#6b7280',
                  }}
                >
                  My Trucks
                </button>
              </div>
            </div>
          )}
          
          {/* Quick stats - Clickable filters */}
          <div className="flex gap-1">
            <button 
              className={`flex-1 px-1.5 py-1 rounded-md text-center transition-all cursor-pointer hover:scale-[1.02] ${statusFilter === 'all' ? 'ring-2 ring-slate-500 ring-offset-1' : ''}`}
              style={{
                background: 'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)',
                boxShadow: statusFilter === 'all' 
                  ? '0 2px 8px rgba(100,116,139,0.3), inset 0 1px 0 rgba(255,255,255,0.6)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(100,116,139,0.12)',
                border: '1px solid rgba(100,116,139,0.2)',
                borderBottom: '2px solid rgba(100,116,139,0.25)',
              }}
              onClick={() => setStatusFilter('all')}
            >
              <div className="text-base font-black text-slate-700">{allVehicles.length}</div>
              <div className="text-[7px] font-bold text-slate-600 uppercase tracking-wide">All</div>
            </button>
            <button 
              className={`flex-1 px-1.5 py-1 rounded-md text-center transition-all cursor-pointer hover:scale-[1.02] ${statusFilter === 'driving' ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`}
              style={{
                background: 'linear-gradient(180deg, #d1fae5 0%, #a7f3d0 100%)',
                boxShadow: statusFilter === 'driving' 
                  ? '0 2px 8px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.6)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(16,185,129,0.12)',
                border: '1px solid rgba(16,185,129,0.2)',
                borderBottom: '2px solid rgba(16,185,129,0.25)',
              }}
              onClick={() => setStatusFilter(statusFilter === 'driving' ? 'all' : 'driving')}
            >
              <div className="text-base font-black text-emerald-700">{movingCount}</div>
              <div className="text-[7px] font-bold text-emerald-600 uppercase tracking-wide">Driving</div>
            </button>
            <button 
              className={`flex-1 px-1.5 py-1 rounded-md text-center transition-all cursor-pointer hover:scale-[1.02] ${statusFilter === 'idling' ? 'ring-2 ring-amber-500 ring-offset-1' : ''}`}
              style={{
                background: 'linear-gradient(180deg, #fef3c7 0%, #fde68a 100%)',
                boxShadow: statusFilter === 'idling'
                  ? '0 2px 8px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.6)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.2)',
                borderBottom: '2px solid rgba(245,158,11,0.25)',
              }}
              onClick={() => setStatusFilter(statusFilter === 'idling' ? 'all' : 'idling')}
            >
              <div className="text-base font-black text-amber-700">{idlingCount}</div>
              <div className="text-[7px] font-bold text-amber-600 uppercase tracking-wide">Idling</div>
            </button>
            <button 
              className={`flex-1 px-1.5 py-1 rounded-md text-center transition-all cursor-pointer hover:scale-[1.02] ${statusFilter === 'parked' ? 'ring-2 ring-gray-800 ring-offset-1' : ''}`}
              style={{
                background: 'linear-gradient(180deg, #374151 0%, #1f2937 100%)',
                boxShadow: statusFilter === 'parked'
                  ? '0 2px 8px rgba(31,41,55,0.4), inset 0 1px 0 rgba(255,255,255,0.15)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 2px rgba(31,41,55,0.2)',
                border: '1px solid rgba(17,24,39,0.3)',
                borderBottom: '2px solid rgba(17,24,39,0.4)',
              }}
              onClick={() => setStatusFilter(statusFilter === 'parked' ? 'all' : 'parked')}
            >
              <div className="text-base font-black text-white">{parkedCount}</div>
              <div className="text-[7px] font-bold text-gray-300 uppercase tracking-wide">Parked</div>
            </button>
          </div>
        </div>
        
        {/* Vehicle list - compact spacing */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {vehicles.map((vehicle, index) => renderVehicleCard(vehicle, index))}
          {vehicles.length === 0 && (
            <div 
              className="flex flex-col items-center justify-center py-8 text-center rounded-lg"
              style={{
                background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 14% 97%) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 3px rgba(37,99,235,0.06)',
                border: '1px solid hsl(220 13% 88%)',
              }}
            >
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                style={{
                  background: 'linear-gradient(180deg, #dbeafe 0%, #bfdbfe 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 3px rgba(59,130,246,0.15)',
                  border: '1px solid rgba(59,130,246,0.2)',
                }}
              >
                <Truck className="h-6 w-6 text-blue-600" />
              </div>
              <p className="text-xs font-semibold text-gray-600">No assets with GPS</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Sync with Samsara to get started</p>
            </div>
          )}
        </div>
        
        {/* Footer - Classic blue */}
        <div 
          className="px-2 py-2"
          style={{
            background: 'linear-gradient(180deg, hsl(220 14% 97%) 0%, hsl(220 14% 94%) 100%)',
            borderTop: '1px solid hsl(220 13% 88%)',
          }}
        >
          <div className="flex items-center justify-between text-[10px] mb-2">
            <span className="text-gray-500 font-medium">Updated {lastUpdate.toLocaleTimeString()}</span>
            <span className="flex items-center gap-1 text-emerald-600 font-semibold">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-white text-sm font-semibold transition-all hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
            style={{
              background: 'linear-gradient(180deg, hsl(221 83% 53%) 0%, hsl(221 83% 45%) 100%)',
              boxShadow: '0 3px 10px rgba(37,99,235,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
              border: '1px solid hsl(221 83% 40%)',
              borderBottom: '2px solid hsl(221 83% 35%)',
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync with Samsara'}
          </button>
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
                  <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shadow-sm">
                    <span className="text-white font-bold text-sm">P</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Parked</div>
                    <div className="text-xs text-muted-foreground">Engine off</div>
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
            bg-background border-t rounded-t-3xl shadow-2xl
            transition-all duration-300 ease-out
            ${mobileSheetExpanded ? 'h-[70vh]' : 'h-auto'}
          `}
          style={{ bottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {/* Handle bar */}
          <button
            onClick={() => setMobileSheetExpanded(!mobileSheetExpanded)}
            className="w-full flex flex-col items-center pt-2 pb-1 touch-manipulation"
          >
            <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
          </button>
          
          {/* Header - Puffy modern design */}
          <div className="px-3 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center shadow-sm">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <h3 className="font-bold text-sm leading-tight">Fleet Tracker</h3>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">{vehicles.length} active</span>
                  <span>•</span>
                  <span>Updated {lastUpdate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Mobile filter toggle - puffy pill style */}
              {(isAdmin || currentDispatcherId) && (
                <button
                  onClick={() => setFilterMode(filterMode === 'all' ? 'my-trucks' : 'all')}
                  className={`
                    px-3 py-1.5 rounded-full text-xs font-semibold transition-all shadow-sm
                    ${filterMode === 'my-trucks' 
                      ? 'bg-gradient-to-b from-primary to-primary/90 text-primary-foreground shadow-primary/25' 
                      : 'bg-muted/80 text-muted-foreground hover:bg-muted'
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
                className="h-8 w-8 rounded-xl hover:bg-muted/50"
              >
                {mobileSheetExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
              </Button>
            </div>
          </div>
          
          {/* Expanded content */}
          {mobileSheetExpanded && (
            <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-2" style={{ maxHeight: 'calc(70vh - 80px)' }}>
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
          
          {/* Collapsed: Quick vehicle preview - Puffy pill cards */}
          {!mobileSheetExpanded && vehicles.length > 0 && (
            <div className="px-3 pb-4">
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-hide">
                {vehicles.slice(0, 5).map((vehicle) => {
                  const speed = vehicle.speed || 0;
                  const status = getVehicleStatus(vehicle);
                  const hasAlert = (vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining <= 0) || 
                    (vehicle.fault_codes && Array.isArray(vehicle.fault_codes) && vehicle.fault_codes.length > 0);
                  
                  // Determine status color
                  let statusDot = 'bg-gray-400'; // Parked
                  if (status === 'driving') statusDot = 'bg-emerald-500';
                  else if (status === 'idling') statusDot = 'bg-amber-500';
                  
                  return (
                    <button
                      key={vehicle.id}
                      onClick={() => handleVehicleClick(vehicle.id)}
                      className={`
                        flex-shrink-0 px-3 py-2 rounded-2xl transition-all shadow-sm
                        ${selectedVehicle === vehicle.id 
                          ? 'bg-gradient-to-b from-primary/15 to-primary/5 ring-1 ring-primary/30' 
                          : 'bg-muted/60 hover:bg-muted active:scale-95'
                        }
                        ${hasAlert ? 'ring-1 ring-destructive/50' : ''}
                      `}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${statusDot} shadow-sm`} />
                        <span className="font-semibold text-sm">{vehicle.vehicle_number || 'N/A'}</span>
                        <span className="text-xs text-muted-foreground font-medium">{speed} mph</span>
                      </div>
                    </button>
                  );
                })}
                {vehicles.length > 5 && (
                  <button
                    onClick={() => setMobileSheetExpanded(true)}
                    className="flex-shrink-0 px-3 py-2 rounded-2xl border border-dashed border-muted-foreground/30 text-muted-foreground text-xs font-medium"
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
