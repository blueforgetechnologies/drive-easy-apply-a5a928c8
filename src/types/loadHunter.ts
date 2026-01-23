// LoadHunter Types - Extracted from LoadHunterTab.tsx for reuse across hooks and components

export interface Vehicle {
  id: string;
  tenant_id: string;
  vehicle_number: string | null;
  carrier: string | null;
  bid_as: string | null;
  asset_type: string | null;
  asset_subtype: string | null;
  dimensions_length: number | null;
  driver_1_id: string | null;
  driver_2_id: string | null;
  status: string;
  formatted_address: string | null;
  last_location: string | null;
  odometer: number | null;
  oil_change_remaining: number | null;
  next_service_date: string | null;
  notes: string | null;
  fault_codes: any;
  speed: number | null;
  stopped_status: string | null;
}

export interface Driver {
  id: string;
  personal_info: any;
}

export interface Load {
  id: string;
  truck_driver_carrier: string;
  customer: string;
  received: string;
  expires: string;
  pickup_time: string;
  pickup_date: string;
  delivery_time: string;
  delivery_date: string;
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  empty_drive_miles: number;
  loaded_drive_miles: number;
  vehicle_type: string;
  weight: string;
  pieces: number;
  dimensions: string;
  avail_ft: string;
  source: string;
}

export interface HuntPlan {
  id: string;
  vehicleId: string;
  planName: string;
  vehicleSizes: string[];
  zipCode: string;
  availableFeet: string;
  partial: boolean;
  pickupRadius: string;
  mileLimit: string;
  loadCapacity: string;
  availableDate: string;
  availableTime: string;
  destinationZip: string;
  destinationRadius: string;
  notes: string;
  createdBy: string;
  createdAt: Date;
  lastModified: Date;
  huntCoordinates?: { lat: number; lng: number } | null;
  enabled: boolean;
  floorLoadId?: string | null;
  initialMatchDone?: boolean;
}

export interface LoadEmailData {
  id: string;
  email_id?: string;
  load_id?: string;
  from_email?: string;
  from_name?: string;
  subject?: string;
  body_text?: string;
  body_html?: string;
  received_at?: string;
  expires_at?: string;
  parsed_data?: any;
  status?: string;
  created_at?: string;
  updated_at?: string;
  has_issues?: boolean;
  email_source?: string;
  is_update?: boolean;
  parent_email_id?: string;
  tenant_id?: string;
}

export interface LoadMatch {
  id: string;
  match_id?: string;
  load_email_id: string;
  hunt_plan_id: string;
  vehicle_id: string;
  distance_miles?: number | null;
  is_active: boolean;
  match_status: 'active' | 'skipped' | 'bid' | 'booked' | 'undecided' | 'waitlist' | 'expired';
  tenant_id: string;
  matched_at?: string;
  updated_at?: string;
  bid_rate?: number;
  bid_by?: string;
  bid_at?: string;
  booked_load_id?: string;
  load_emails?: LoadEmailData;
}

export interface DispatcherInfo {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  show_all_tab?: boolean;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface LoadLocationData {
  originZip?: string;
  originLat?: number;
  originLng?: number;
  originCityState?: string;
  loadType?: string;
  vehicleType?: string;
  pickupDate?: string;
}

export interface MatchResult {
  matches: boolean;
  distance?: number;
}

export type LoadHunterTheme = 'classic' | 'aurora';
export type ActiveFilter = 'unreviewed' | 'all' | 'skipped' | 'mybids' | 'booked' | 'undecided' | 'waitlist' | 'missed' | 'expired' | 'issues' | 'vehicle-assignment' | 'dispatcher-metrix';
export type ActiveMode = 'admin' | 'dispatch';
export type EmailTimeWindow = '30m' | '6h' | '24h' | 'session';

// Re-export SoundSettings from useUserPreferences for consistency
// The canonical definition is in useUserPreferences.ts
export type { SoundSettings } from "@/hooks/useUserPreferences";
