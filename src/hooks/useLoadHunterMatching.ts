// Hunt matching logic hook for LoadHunter
// Extracted from LoadHunterTab.tsx for maintainability

import { useRef, useCallback } from 'react';
import type { HuntPlan, LoadLocationData, MatchResult, Coordinates } from '@/types/loadHunter';

interface UseLoadHunterMatchingProps {
  mapboxToken: string;
  vehicleTypeMappings: Map<string, string>;
}

interface UseLoadHunterMatchingReturn {
  geocodeLocation: (locationQuery: string) => Promise<Coordinates | null>;
  extractLoadLocation: (email: any) => LoadLocationData;
  doesLoadMatchHunt: (loadData: LoadLocationData, hunt: HuntPlan) => Promise<MatchResult>;
  calculateDistance: (lat1: number, lon1: number, lat2: number, lon2: number) => number;
  getEasternTimezoneOffset: (date: Date) => number;
}

export function useLoadHunterMatching({
  mapboxToken,
  vehicleTypeMappings,
}: UseLoadHunterMatchingProps): UseLoadHunterMatchingReturn {
  // Cache for geocoded locations (zip codes or city/state) to avoid repeated API calls
  const locationCache = useRef<Map<string, Coordinates | null>>(new Map());

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959; // Radius of the Earth in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Get Eastern timezone offset (handles EST vs EDT automatically)
  const getEasternTimezoneOffset = useCallback((date: Date): number => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'shortOffset',
    });
    
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT-5';
    
    const match = tzPart.match(/GMT([+-]?\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    
    // Fallback: determine based on date (DST is March to November in US)
    const month = date.getMonth();
    if (month >= 2 && month <= 9) {
      return -4; // EDT
    }
    return -5; // EST
  }, []);

  // Geocode a location string (zip code or "City, ST")
  const geocodeLocation = useCallback(async (locationQuery: string): Promise<Coordinates | null> => {
    // Check cache first
    if (locationCache.current.has(locationQuery)) {
      return locationCache.current.get(locationQuery) || null;
    }

    try {
      if (!mapboxToken) return null;
      
      const encoded = encodeURIComponent(locationQuery);
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${mapboxToken}&country=US&limit=1`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        const coords: Coordinates = { lat, lng };
        locationCache.current.set(locationQuery, coords);
        return coords;
      }
      
      locationCache.current.set(locationQuery, null);
      return null;
    } catch (error) {
      console.error('Error geocoding location:', error);
      locationCache.current.set(locationQuery, null);
      return null;
    }
  }, [mapboxToken]);

  // Extract location data from load email
  const extractLoadLocation = useCallback((email: any): LoadLocationData => {
    try {
      if (email.parsed_data) {
        const parsed = email.parsed_data;
        const originCityState = parsed.origin_city && parsed.origin_state
          ? `${parsed.origin_city}, ${parsed.origin_state}`
          : undefined;

        // Extract coordinates - check multiple possible locations
        let originLat = parsed.origin_lat || parsed.pickup_lat;
        let originLng = parsed.origin_lng || parsed.pickup_lng;
        
        // Also check nested pickup_coordinates object (common format from webhook)
        if ((!originLat || !originLng) && parsed.pickup_coordinates) {
          const coords = typeof parsed.pickup_coordinates === 'string' 
            ? JSON.parse(parsed.pickup_coordinates) 
            : parsed.pickup_coordinates;
          if (coords && coords.lat && coords.lng) {
            originLat = coords.lat;
            originLng = coords.lng;
          }
        }

        return {
          originZip: parsed.origin_zip || parsed.pickup_zip,
          originLat,
          originLng,
          originCityState,
          loadType: parsed.load_type,
          vehicleType: parsed.vehicle_type || parsed.equipment_type,
          pickupDate: parsed.pickup_date
        };
      }
      
      // Try extracting from body text if parsed_data not available
      const bodyText = email.body_text || '';
      const zipMatch = bodyText.match(/\b\d{5}\b/);
      return {
        originZip: zipMatch ? zipMatch[0] : undefined
      };
    } catch (error) {
      console.error('Error extracting load location:', error);
      return {};
    }
  }, []);

  // Core matching logic - async to support geocoding
  const doesLoadMatchHunt = useCallback(async (
    loadData: LoadLocationData,
    hunt: HuntPlan
  ): Promise<MatchResult> => {
    // If hunt has no search coordinates or zip, skip matching
    if (!hunt.huntCoordinates && !hunt.zipCode) {
      return { matches: false };
    }

    // Get hunt location
    let huntCoords: Coordinates | null = hunt.huntCoordinates || null;
    
    if (!huntCoords && hunt.zipCode) {
      huntCoords = await geocodeLocation(hunt.zipCode);
    }

    if (!huntCoords) {
      console.log('❌ Could not get hunt coordinates');
      return { matches: false };
    }

    // Get load origin coordinates
    let loadCoords: Coordinates | null = null;
    
    if (loadData.originLat && loadData.originLng) {
      loadCoords = { lat: loadData.originLat, lng: loadData.originLng };
    } else if (loadData.originCityState) {
      loadCoords = await geocodeLocation(loadData.originCityState);
    } else if (loadData.originZip) {
      loadCoords = await geocodeLocation(loadData.originZip);
    }

    if (!loadCoords) {
      console.log('❌ Could not get load origin coordinates');
      return { matches: false };
    }

    // Calculate distance
    const distance = calculateDistance(
      huntCoords.lat, huntCoords.lng,
      loadCoords.lat, loadCoords.lng
    );

    // Check if within pickup radius
    const pickupRadius = parseInt(hunt.pickupRadius) || 100;
    if (distance > pickupRadius) {
      return { matches: false, distance };
    }

    // Vehicle type matching (if hunt specifies vehicle sizes)
    if (hunt.vehicleSizes && hunt.vehicleSizes.length > 0) {
      const loadVehicleType = loadData.vehicleType?.toUpperCase() || '';
      
      // Map the load's vehicle type to canonical form
      const mappedLoadType = vehicleTypeMappings.get(loadVehicleType.toLowerCase()) || loadVehicleType;
      
      // Check if load type matches any of the hunt's accepted sizes
      const vehicleTypeMatches = hunt.vehicleSizes.some(huntSize => {
        const normalizedHuntSize = huntSize.toUpperCase().replace(/-/g, ' ');
        return mappedLoadType.includes(normalizedHuntSize) || 
               normalizedHuntSize.includes(mappedLoadType);
      });

      if (!vehicleTypeMatches && loadVehicleType) {
        // Only reject if load has a type that doesn't match
        // If load has no type, allow it through
        return { matches: false, distance };
      }
    }

    // All checks passed
    return { matches: true, distance };
  }, [geocodeLocation, calculateDistance, vehicleTypeMappings]);

  return {
    geocodeLocation,
    extractLoadLocation,
    doesLoadMatchHunt,
    calculateDistance,
    getEasternTimezoneOffset,
  };
}
