import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

export interface LocationPoint {
  id: string;
  vehicle_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  odometer: number | null;
  recorded_at: string;
  formatted_location: string | null;
}

export interface VehicleHistoryState {
  loading: boolean;
  points: LocationPoint[];
  selectedDate: Date;
  selectedVehicleId: string | null;
  hasStarted: boolean;
}

export function useVehicleHistory() {
  const [state, setState] = useState<VehicleHistoryState>({
    loading: false,
    points: [],
    selectedDate: new Date(),
    selectedVehicleId: null,
    hasStarted: false,
  });

  const fetchHistory = useCallback(async (vehicleId: string, date: Date) => {
    setState(prev => ({ ...prev, loading: true, hasStarted: true }));

    try {
      const dayStart = startOfDay(date).toISOString();
      const dayEnd = endOfDay(date).toISOString();

      const { data, error } = await supabase
        .from('vehicle_location_history')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .gte('recorded_at', dayStart)
        .lte('recorded_at', dayEnd)
        .order('recorded_at', { ascending: true });

      if (error) {
        console.error('Error fetching vehicle history:', error);
        setState(prev => ({ ...prev, loading: false, points: [] }));
        return [];
      }

      const points = (data || []).map(p => ({
        id: p.id,
        vehicle_id: p.vehicle_id,
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
        speed: p.speed ? Number(p.speed) : null,
        heading: p.heading ? Number(p.heading) : null,
        odometer: p.odometer ? Number(p.odometer) : null,
        recorded_at: p.recorded_at,
        formatted_location: (p as any).formatted_location || null,
      }));

      setState(prev => ({ ...prev, loading: false, points }));
      return points;
    } catch (error) {
      console.error('Error fetching vehicle history:', error);
      setState(prev => ({ ...prev, loading: false, points: [] }));
      return [];
    }
  }, []);

  // Just update the date without fetching
  const setSelectedDate = useCallback((date: Date) => {
    setState(prev => ({ ...prev, selectedDate: date, hasStarted: false, points: [] }));
  }, []);

  // Just set the vehicle ID without auto-fetching
  const setSelectedVehicle = useCallback((vehicleId: string | null) => {
    if (vehicleId) {
      setState(prev => ({ ...prev, selectedVehicleId: vehicleId, hasStarted: false, points: [] }));
    } else {
      setState(prev => ({ ...prev, selectedVehicleId: null, points: [], hasStarted: false }));
    }
  }, []);

  // Explicit start function to fetch history
  const startHistory = useCallback(() => {
    if (state.selectedVehicleId) {
      fetchHistory(state.selectedVehicleId, state.selectedDate);
    }
  }, [state.selectedVehicleId, state.selectedDate, fetchHistory]);

  const goToPreviousDay = useCallback(() => {
    const newDate = subDays(state.selectedDate, 1);
    setState(prev => ({ ...prev, selectedDate: newDate, hasStarted: false, points: [] }));
  }, [state.selectedDate]);

  const goToNextDay = useCallback(() => {
    const today = new Date();
    const nextDay = new Date(state.selectedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    // Don't go past today
    if (nextDay <= today) {
      setState(prev => ({ ...prev, selectedDate: nextDay, hasStarted: false, points: [] }));
    }
  }, [state.selectedDate]);

  const clearHistory = useCallback(() => {
    setState(prev => ({ ...prev, points: [], selectedVehicleId: null, hasStarted: false }));
  }, []);

  const getAvailableDates = useCallback(async (vehicleId: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from('vehicle_location_history')
        .select('recorded_at')
        .eq('vehicle_id', vehicleId)
        .order('recorded_at', { ascending: false });

      if (error || !data) return [];

      // Get unique dates
      const uniqueDates = new Set<string>();
      data.forEach(p => {
        uniqueDates.add(format(new Date(p.recorded_at), 'yyyy-MM-dd'));
      });

      return Array.from(uniqueDates);
    } catch {
      return [];
    }
  }, []);

  return {
    ...state,
    fetchHistory,
    setSelectedDate,
    setSelectedVehicle,
    startHistory,
    goToPreviousDay,
    goToNextDay,
    clearHistory,
    getAvailableDates,
  };
}
