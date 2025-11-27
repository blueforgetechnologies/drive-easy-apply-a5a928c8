export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          account_name: string | null
          account_type: string | null
          application_date: string | null
          bank_name: string | null
          cell_phone: string | null
          checking_number: string | null
          contractor_agreement: Json
          direct_deposit: Json
          document_upload: Json
          driver_address: string | null
          driver_dispatch_sheet: Json
          driver_password: string | null
          driver_record_expiry: string | null
          driver_salary: string | null
          driver_status: string | null
          driving_history: Json
          drug_alcohol_policy: Json
          emergency_contacts: Json | null
          employment_history: Json
          green_card_expiry: string | null
          hired_date: string | null
          home_phone: string | null
          id: string
          license_info: Json
          medical_card_expiry: string | null
          national_registry: string | null
          no_rider_policy: Json
          pay_method: string | null
          pay_per_mile: number | null
          payroll_policy: Json
          personal_info: Json
          restrictions: string | null
          routing_number: string | null
          safe_driving_policy: Json
          score_card: string | null
          status: string | null
          submitted_at: string | null
          termination_date: string | null
          vehicle_note: string | null
          weekly_salary: number | null
          why_hire_you: Json
          work_permit_expiry: string | null
        }
        Insert: {
          account_name?: string | null
          account_type?: string | null
          application_date?: string | null
          bank_name?: string | null
          cell_phone?: string | null
          checking_number?: string | null
          contractor_agreement: Json
          direct_deposit: Json
          document_upload: Json
          driver_address?: string | null
          driver_dispatch_sheet: Json
          driver_password?: string | null
          driver_record_expiry?: string | null
          driver_salary?: string | null
          driver_status?: string | null
          driving_history: Json
          drug_alcohol_policy: Json
          emergency_contacts?: Json | null
          employment_history: Json
          green_card_expiry?: string | null
          hired_date?: string | null
          home_phone?: string | null
          id?: string
          license_info: Json
          medical_card_expiry?: string | null
          national_registry?: string | null
          no_rider_policy: Json
          pay_method?: string | null
          pay_per_mile?: number | null
          payroll_policy: Json
          personal_info: Json
          restrictions?: string | null
          routing_number?: string | null
          safe_driving_policy: Json
          score_card?: string | null
          status?: string | null
          submitted_at?: string | null
          termination_date?: string | null
          vehicle_note?: string | null
          weekly_salary?: number | null
          why_hire_you: Json
          work_permit_expiry?: string | null
        }
        Update: {
          account_name?: string | null
          account_type?: string | null
          application_date?: string | null
          bank_name?: string | null
          cell_phone?: string | null
          checking_number?: string | null
          contractor_agreement?: Json
          direct_deposit?: Json
          document_upload?: Json
          driver_address?: string | null
          driver_dispatch_sheet?: Json
          driver_password?: string | null
          driver_record_expiry?: string | null
          driver_salary?: string | null
          driver_status?: string | null
          driving_history?: Json
          drug_alcohol_policy?: Json
          emergency_contacts?: Json | null
          employment_history?: Json
          green_card_expiry?: string | null
          hired_date?: string | null
          home_phone?: string | null
          id?: string
          license_info?: Json
          medical_card_expiry?: string | null
          national_registry?: string | null
          no_rider_policy?: Json
          pay_method?: string | null
          pay_per_mile?: number | null
          payroll_policy?: Json
          personal_info?: Json
          restrictions?: string | null
          routing_number?: string | null
          safe_driving_policy?: Json
          score_card?: string | null
          status?: string | null
          submitted_at?: string | null
          termination_date?: string | null
          vehicle_note?: string | null
          weekly_salary?: number | null
          why_hire_you?: Json
          work_permit_expiry?: string | null
        }
        Relationships: []
      }
      driver_invites: {
        Row: {
          application_started_at: string | null
          email: string
          id: string
          invited_at: string | null
          invited_by: string
          name: string | null
          opened_at: string | null
        }
        Insert: {
          application_started_at?: string | null
          email: string
          id?: string
          invited_at?: string | null
          invited_by: string
          name?: string | null
          opened_at?: string | null
        }
        Update: {
          application_started_at?: string | null
          email?: string
          id?: string
          invited_at?: string | null
          invited_by?: string
          name?: string | null
          opened_at?: string | null
        }
        Relationships: []
      }
      invites: {
        Row: {
          accepted_at: string | null
          email: string
          id: string
          invited_at: string | null
          invited_by: string
        }
        Insert: {
          accepted_at?: string | null
          email: string
          id?: string
          invited_at?: string | null
          invited_by: string
        }
        Update: {
          accepted_at?: string | null
          email?: string
          id?: string
          invited_at?: string | null
          invited_by?: string
        }
        Relationships: []
      }
      login_history: {
        Row: {
          id: string
          ip_address: string | null
          location: string | null
          logged_in_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          id?: string
          ip_address?: string | null
          location?: string | null
          logged_in_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          id?: string
          ip_address?: string | null
          location?: string | null
          logged_in_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
