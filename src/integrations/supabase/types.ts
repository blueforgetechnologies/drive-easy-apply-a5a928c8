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
      ai_usage_tracking: {
        Row: {
          completion_tokens: number | null
          created_at: string
          feature: string | null
          id: string
          model: string | null
          month_year: string | null
          prompt_tokens: number | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number | null
          created_at?: string
          feature?: string | null
          id?: string
          model?: string | null
          month_year?: string | null
          prompt_tokens?: number | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number | null
          created_at?: string
          feature?: string | null
          id?: string
          model?: string | null
          month_year?: string | null
          prompt_tokens?: number | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      applications: {
        Row: {
          account_name: string | null
          account_type: string | null
          application_date: string | null
          bank_name: string | null
          base_salary: number | null
          cell_phone: string | null
          checking_number: string | null
          contractor_agreement: Json
          detention_pay: number | null
          direct_deposit: Json
          document_upload: Json
          driver_address: string | null
          driver_dispatch_sheet: Json
          driver_record_expiry: string | null
          driver_salary: string | null
          driver_status: string | null
          driving_history: Json
          drug_alcohol_policy: Json
          emergency_contacts: Json | null
          employment_history: Json
          equipment_lease: number | null
          escrow_deduction: number | null
          fuel_bonus: number | null
          green_card_expiry: string | null
          hired_date: string | null
          holiday_pay_rate: string | null
          home_phone: string | null
          hourly_rate: number | null
          hours_per_week: number | null
          id: string
          insurance_deduction: number | null
          invite_id: string | null
          layover_pay: number | null
          license_info: Json
          load_percentage: number | null
          medical_card_expiry: string | null
          national_registry: string | null
          no_rider_policy: Json
          other_deductions: number | null
          overtime_eligible: boolean | null
          overtime_multiplier: string | null
          pay_method: string | null
          pay_method_active: boolean | null
          pay_per_mile: number | null
          payee_id: string | null
          payroll_policy: Json
          per_diem: number | null
          personal_info: Json
          referral_bonus: number | null
          restrictions: string | null
          routing_number: string | null
          safe_driving_policy: Json
          safety_bonus: number | null
          score_card: string | null
          sign_on_bonus: number | null
          status: string | null
          stop_pay: number | null
          submitted_at: string | null
          termination_date: string | null
          vehicle_note: string | null
          weekend_premium: number | null
          weekly_salary: number | null
          why_hire_you: Json
          work_permit_expiry: string | null
        }
        Insert: {
          account_name?: string | null
          account_type?: string | null
          application_date?: string | null
          bank_name?: string | null
          base_salary?: number | null
          cell_phone?: string | null
          checking_number?: string | null
          contractor_agreement: Json
          detention_pay?: number | null
          direct_deposit: Json
          document_upload: Json
          driver_address?: string | null
          driver_dispatch_sheet: Json
          driver_record_expiry?: string | null
          driver_salary?: string | null
          driver_status?: string | null
          driving_history: Json
          drug_alcohol_policy: Json
          emergency_contacts?: Json | null
          employment_history: Json
          equipment_lease?: number | null
          escrow_deduction?: number | null
          fuel_bonus?: number | null
          green_card_expiry?: string | null
          hired_date?: string | null
          holiday_pay_rate?: string | null
          home_phone?: string | null
          hourly_rate?: number | null
          hours_per_week?: number | null
          id?: string
          insurance_deduction?: number | null
          invite_id?: string | null
          layover_pay?: number | null
          license_info: Json
          load_percentage?: number | null
          medical_card_expiry?: string | null
          national_registry?: string | null
          no_rider_policy: Json
          other_deductions?: number | null
          overtime_eligible?: boolean | null
          overtime_multiplier?: string | null
          pay_method?: string | null
          pay_method_active?: boolean | null
          pay_per_mile?: number | null
          payee_id?: string | null
          payroll_policy: Json
          per_diem?: number | null
          personal_info: Json
          referral_bonus?: number | null
          restrictions?: string | null
          routing_number?: string | null
          safe_driving_policy: Json
          safety_bonus?: number | null
          score_card?: string | null
          sign_on_bonus?: number | null
          status?: string | null
          stop_pay?: number | null
          submitted_at?: string | null
          termination_date?: string | null
          vehicle_note?: string | null
          weekend_premium?: number | null
          weekly_salary?: number | null
          why_hire_you: Json
          work_permit_expiry?: string | null
        }
        Update: {
          account_name?: string | null
          account_type?: string | null
          application_date?: string | null
          bank_name?: string | null
          base_salary?: number | null
          cell_phone?: string | null
          checking_number?: string | null
          contractor_agreement?: Json
          detention_pay?: number | null
          direct_deposit?: Json
          document_upload?: Json
          driver_address?: string | null
          driver_dispatch_sheet?: Json
          driver_record_expiry?: string | null
          driver_salary?: string | null
          driver_status?: string | null
          driving_history?: Json
          drug_alcohol_policy?: Json
          emergency_contacts?: Json | null
          employment_history?: Json
          equipment_lease?: number | null
          escrow_deduction?: number | null
          fuel_bonus?: number | null
          green_card_expiry?: string | null
          hired_date?: string | null
          holiday_pay_rate?: string | null
          home_phone?: string | null
          hourly_rate?: number | null
          hours_per_week?: number | null
          id?: string
          insurance_deduction?: number | null
          invite_id?: string | null
          layover_pay?: number | null
          license_info?: Json
          load_percentage?: number | null
          medical_card_expiry?: string | null
          national_registry?: string | null
          no_rider_policy?: Json
          other_deductions?: number | null
          overtime_eligible?: boolean | null
          overtime_multiplier?: string | null
          pay_method?: string | null
          pay_method_active?: boolean | null
          pay_per_mile?: number | null
          payee_id?: string | null
          payroll_policy?: Json
          per_diem?: number | null
          personal_info?: Json
          referral_bonus?: number | null
          restrictions?: string | null
          routing_number?: string | null
          safe_driving_policy?: Json
          safety_bonus?: number | null
          score_card?: string | null
          sign_on_bonus?: number | null
          status?: string | null
          stop_pay?: number | null
          submitted_at?: string | null
          termination_date?: string | null
          vehicle_note?: string | null
          weekend_premium?: number | null
          weekly_salary?: number | null
          why_hire_you?: Json
          work_permit_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "driver_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "payees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          entity_id: string
          entity_type: string
          field_name: string | null
          id: string
          ip_address: string | null
          new_value: string | null
          notes: string | null
          old_value: string | null
          timestamp: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          entity_id: string
          entity_type: string
          field_name?: string | null
          id?: string
          ip_address?: string | null
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          timestamp?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          entity_id?: string
          entity_type?: string
          field_name?: string | null
          id?: string
          ip_address?: string | null
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          timestamp?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      carrier_rate_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          id: string
          load_id: string
          new_payload: number | null
          new_rate: number
          notes: string | null
          old_payload: number | null
          old_rate: number | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          id?: string
          load_id: string
          new_payload?: number | null
          new_rate: number
          notes?: string | null
          old_payload?: number | null
          old_rate?: number | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          id?: string
          load_id?: string
          new_payload?: number | null
          new_rate?: number
          notes?: string | null
          old_payload?: number | null
          old_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "carrier_rate_history_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      carriers: {
        Row: {
          address: string | null
          after_hours_phone: string | null
          carrier_symbol: string | null
          contact_name: string | null
          created_at: string | null
          dispatch_email: string | null
          dispatch_name: string | null
          dispatch_phone: string | null
          dot_number: string | null
          dun_bradstreet: string | null
          email: string | null
          emergency_contact_cell_phone: string | null
          emergency_contact_email: string | null
          emergency_contact_home_phone: string | null
          emergency_contact_name: string | null
          emergency_contact_title: string | null
          id: string
          logo_url: string | null
          mc_number: string | null
          name: string
          payee_id: string | null
          personal_business: string | null
          phone: string | null
          safer_status: string | null
          safety_rating: string | null
          show_in_fleet_financials: boolean
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          after_hours_phone?: string | null
          carrier_symbol?: string | null
          contact_name?: string | null
          created_at?: string | null
          dispatch_email?: string | null
          dispatch_name?: string | null
          dispatch_phone?: string | null
          dot_number?: string | null
          dun_bradstreet?: string | null
          email?: string | null
          emergency_contact_cell_phone?: string | null
          emergency_contact_email?: string | null
          emergency_contact_home_phone?: string | null
          emergency_contact_name?: string | null
          emergency_contact_title?: string | null
          id?: string
          logo_url?: string | null
          mc_number?: string | null
          name: string
          payee_id?: string | null
          personal_business?: string | null
          phone?: string | null
          safer_status?: string | null
          safety_rating?: string | null
          show_in_fleet_financials?: boolean
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          after_hours_phone?: string | null
          carrier_symbol?: string | null
          contact_name?: string | null
          created_at?: string | null
          dispatch_email?: string | null
          dispatch_name?: string | null
          dispatch_phone?: string | null
          dot_number?: string | null
          dun_bradstreet?: string | null
          email?: string | null
          emergency_contact_cell_phone?: string | null
          emergency_contact_email?: string | null
          emergency_contact_home_phone?: string | null
          emergency_contact_name?: string | null
          emergency_contact_title?: string | null
          id?: string
          logo_url?: string | null
          mc_number?: string | null
          name?: string
          payee_id?: string | null
          personal_business?: string | null
          phone?: string | null
          safer_status?: string | null
          safety_rating?: string | null
          show_in_fleet_financials?: boolean
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carriers_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "payees"
            referencedColumns: ["id"]
          },
        ]
      }
      cleanup_job_logs: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          executed_at: string
          id: string
          job_name: string
          records_affected: number | null
          success: boolean | null
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string
          id?: string
          job_name: string
          records_affected?: number | null
          success?: boolean | null
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string
          id?: string
          job_name?: string
          records_affected?: number | null
          success?: boolean | null
        }
        Relationships: []
      }
      company_profile: {
        Row: {
          address: string | null
          billing_terms: string | null
          city: string | null
          company_name: string
          country: string | null
          created_at: string | null
          default_carrier_id: string | null
          default_currency: string | null
          default_timezone: string | null
          dot_number: string | null
          email: string | null
          factoring_company_address: string | null
          factoring_company_city: string | null
          factoring_company_name: string | null
          factoring_company_state: string | null
          factoring_company_zip: string | null
          factoring_contact_email: string | null
          factoring_contact_name: string | null
          factoring_contact_phone: string | null
          factoring_percentage: number | null
          id: string
          legal_name: string | null
          logo_url: string | null
          mc_number: string | null
          phone: string | null
          remittance_info: string | null
          state: string | null
          tax_id: string | null
          updated_at: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          billing_terms?: string | null
          city?: string | null
          company_name: string
          country?: string | null
          created_at?: string | null
          default_carrier_id?: string | null
          default_currency?: string | null
          default_timezone?: string | null
          dot_number?: string | null
          email?: string | null
          factoring_company_address?: string | null
          factoring_company_city?: string | null
          factoring_company_name?: string | null
          factoring_company_state?: string | null
          factoring_company_zip?: string | null
          factoring_contact_email?: string | null
          factoring_contact_name?: string | null
          factoring_contact_phone?: string | null
          factoring_percentage?: number | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          mc_number?: string | null
          phone?: string | null
          remittance_info?: string | null
          state?: string | null
          tax_id?: string | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          billing_terms?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string | null
          default_carrier_id?: string | null
          default_currency?: string | null
          default_timezone?: string | null
          dot_number?: string | null
          email?: string | null
          factoring_company_address?: string | null
          factoring_company_city?: string | null
          factoring_company_name?: string | null
          factoring_company_state?: string | null
          factoring_company_zip?: string | null
          factoring_contact_email?: string | null
          factoring_contact_name?: string | null
          factoring_contact_phone?: string | null
          factoring_percentage?: number | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          mc_number?: string | null
          phone?: string | null
          remittance_info?: string | null
          state?: string | null
          tax_id?: string | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_profile_default_carrier_id_fkey"
            columns: ["default_carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string | null
          email: string | null
          entity_id: string
          entity_type: string
          id: string
          is_primary: boolean | null
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          entity_id: string
          entity_type: string
          id?: string
          is_primary?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          is_primary?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      custom_roles: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_system_role: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_system_role?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_system_role?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          contact_name: string | null
          created_at: string | null
          credit_limit: number | null
          customer_type: string | null
          dot_number: string | null
          email: string | null
          email_secondary: string | null
          factoring_approval: string | null
          id: string
          mc_number: string | null
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          phone_fax: string | null
          phone_mobile: string | null
          phone_secondary: string | null
          state: string | null
          status: string | null
          updated_at: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string | null
          credit_limit?: number | null
          customer_type?: string | null
          dot_number?: string | null
          email?: string | null
          email_secondary?: string | null
          factoring_approval?: string | null
          id?: string
          mc_number?: string | null
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          phone_fax?: string | null
          phone_mobile?: string | null
          phone_secondary?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string | null
          credit_limit?: number | null
          customer_type?: string | null
          dot_number?: string | null
          email?: string | null
          email_secondary?: string | null
          factoring_approval?: string | null
          id?: string
          mc_number?: string | null
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          phone_fax?: string | null
          phone_mobile?: string | null
          phone_secondary?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      directions_api_tracking: {
        Row: {
          created_at: string
          id: string
          load_id: string | null
          month_year: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          load_id?: string | null
          month_year?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          load_id?: string | null
          month_year?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      dispatchers: {
        Row: {
          address: string | null
          application_status: string | null
          assigned_trucks: number | null
          contract_agreement: string | null
          created_at: string | null
          dob: string | null
          email: string
          emergency_contact_1_name: string | null
          emergency_contact_1_phone: string | null
          emergency_contact_1_relationship: string | null
          emergency_contact_2_name: string | null
          emergency_contact_2_phone: string | null
          emergency_contact_2_relationship: string | null
          first_name: string
          hire_date: string | null
          id: string
          last_name: string
          license_expiration_date: string | null
          license_issued_date: string | null
          license_number: string | null
          must_change_password: boolean | null
          notes: string | null
          pay_percentage: number | null
          payee_id: string | null
          phone: string | null
          role: string | null
          show_all_tab: boolean | null
          status: string | null
          termination_date: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          application_status?: string | null
          assigned_trucks?: number | null
          contract_agreement?: string | null
          created_at?: string | null
          dob?: string | null
          email: string
          emergency_contact_1_name?: string | null
          emergency_contact_1_phone?: string | null
          emergency_contact_1_relationship?: string | null
          emergency_contact_2_name?: string | null
          emergency_contact_2_phone?: string | null
          emergency_contact_2_relationship?: string | null
          first_name: string
          hire_date?: string | null
          id?: string
          last_name: string
          license_expiration_date?: string | null
          license_issued_date?: string | null
          license_number?: string | null
          must_change_password?: boolean | null
          notes?: string | null
          pay_percentage?: number | null
          payee_id?: string | null
          phone?: string | null
          role?: string | null
          show_all_tab?: boolean | null
          status?: string | null
          termination_date?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          application_status?: string | null
          assigned_trucks?: number | null
          contract_agreement?: string | null
          created_at?: string | null
          dob?: string | null
          email?: string
          emergency_contact_1_name?: string | null
          emergency_contact_1_phone?: string | null
          emergency_contact_1_relationship?: string | null
          emergency_contact_2_name?: string | null
          emergency_contact_2_phone?: string | null
          emergency_contact_2_relationship?: string | null
          first_name?: string
          hire_date?: string | null
          id?: string
          last_name?: string
          license_expiration_date?: string | null
          license_issued_date?: string | null
          license_number?: string | null
          must_change_password?: boolean | null
          notes?: string | null
          pay_percentage?: number | null
          payee_id?: string | null
          phone?: string | null
          role?: string | null
          show_all_tab?: boolean | null
          status?: string | null
          termination_date?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatchers_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "payees"
            referencedColumns: ["id"]
          },
        ]
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
      email_queue: {
        Row: {
          attempts: number
          gmail_history_id: string | null
          gmail_message_id: string
          id: string
          last_error: string | null
          processed_at: string | null
          queued_at: string
          status: string
        }
        Insert: {
          attempts?: number
          gmail_history_id?: string | null
          gmail_message_id: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          queued_at?: string
          status?: string
        }
        Update: {
          attempts?: number
          gmail_history_id?: string | null
          gmail_message_id?: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          queued_at?: string
          status?: string
        }
        Relationships: []
      }
      email_send_tracking: {
        Row: {
          created_at: string
          email_type: string
          id: string
          month_year: string | null
          recipient_email: string | null
          success: boolean | null
        }
        Insert: {
          created_at?: string
          email_type: string
          id?: string
          month_year?: string | null
          recipient_email?: string | null
          success?: boolean | null
        }
        Update: {
          created_at?: string
          email_type?: string
          id?: string
          month_year?: string | null
          recipient_email?: string | null
          success?: boolean | null
        }
        Relationships: []
      }
      email_volume_stats: {
        Row: {
          avg_processing_time_ms: number | null
          created_at: string
          emails_failed: number
          emails_pending: number
          emails_processed: number
          emails_received: number
          hour_start: string
          id: string
          matches_count: number | null
          recorded_at: string
        }
        Insert: {
          avg_processing_time_ms?: number | null
          created_at?: string
          emails_failed?: number
          emails_pending?: number
          emails_processed?: number
          emails_received?: number
          hour_start: string
          id?: string
          matches_count?: number | null
          recorded_at?: string
        }
        Update: {
          avg_processing_time_ms?: number | null
          created_at?: string
          emails_failed?: number
          emails_pending?: number
          emails_processed?: number
          emails_received?: number
          hour_start?: string
          id?: string
          matches_count?: number | null
          recorded_at?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number | null
          category_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          driver_id: string | null
          expense_date: string | null
          id: string
          load_id: string | null
          notes: string | null
          payee: string | null
          payment_method: string | null
          receipt_url: string | null
          status: string | null
          vehicle_id: string | null
        }
        Insert: {
          amount?: number | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          driver_id?: string | null
          expense_date?: string | null
          id?: string
          load_id?: string | null
          notes?: string | null
          payee?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          status?: string | null
          vehicle_id?: string | null
        }
        Update: {
          amount?: number | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          driver_id?: string | null
          expense_date?: string | null
          id?: string
          load_id?: string | null
          notes?: string | null
          payee?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          status?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      gcp_usage_baselines: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          metric_name: string
          metric_value: number
          notes: string | null
          period_days: number
          period_end: string
          period_start: string
          service_name: string
          source: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          metric_name: string
          metric_value: number
          notes?: string | null
          period_days: number
          period_end: string
          period_start: string
          service_name: string
          source?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          metric_name?: string
          metric_value?: number
          notes?: string | null
          period_days?: number
          period_end?: string
          period_start?: string
          service_name?: string
          source?: string | null
        }
        Relationships: []
      }
      geocode_cache: {
        Row: {
          city: string | null
          created_at: string
          hit_count: number | null
          id: string
          latitude: number
          location_key: string
          longitude: number
          month_created: string | null
          state: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          hit_count?: number | null
          id?: string
          latitude: number
          location_key: string
          longitude: number
          month_created?: string | null
          state?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          hit_count?: number | null
          id?: string
          latitude?: number
          location_key?: string
          longitude?: number
          month_created?: string | null
          state?: string | null
        }
        Relationships: []
      }
      geocode_cache_daily_stats: {
        Row: {
          created_at: string
          estimated_savings: number
          hits_today: number
          id: string
          new_locations_today: number
          recorded_at: string
          total_hits: number
          total_locations: number
        }
        Insert: {
          created_at?: string
          estimated_savings?: number
          hits_today?: number
          id?: string
          new_locations_today?: number
          recorded_at?: string
          total_hits?: number
          total_locations?: number
        }
        Update: {
          created_at?: string
          estimated_savings?: number
          hits_today?: number
          id?: string
          new_locations_today?: number
          recorded_at?: string
          total_hits?: number
          total_locations?: number
        }
        Relationships: []
      }
      geocoding_api_tracking: {
        Row: {
          created_at: string
          id: string
          location_query: string | null
          month_year: string | null
          user_id: string | null
          was_cache_hit: boolean | null
        }
        Insert: {
          created_at?: string
          id?: string
          location_query?: string | null
          month_year?: string | null
          user_id?: string | null
          was_cache_hit?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          location_query?: string | null
          month_year?: string | null
          user_id?: string | null
          was_cache_hit?: boolean | null
        }
        Relationships: []
      }
      gmail_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          id: string
          refresh_token: string
          token_expiry: string
          updated_at: string | null
          user_email: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          id?: string
          refresh_token: string
          token_expiry: string
          updated_at?: string | null
          user_email: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          id?: string
          refresh_token?: string
          token_expiry?: string
          updated_at?: string | null
          user_email?: string
        }
        Relationships: []
      }
      hunt_plans: {
        Row: {
          available_date: string | null
          available_feet: string | null
          available_time: string | null
          created_at: string
          created_by: string | null
          destination_radius: string | null
          destination_zip: string | null
          enabled: boolean
          floor_load_id: string | null
          hunt_coordinates: Json | null
          id: string
          initial_match_done: boolean | null
          last_modified: string
          load_capacity: string | null
          mile_limit: string | null
          notes: string | null
          partial: boolean | null
          pickup_radius: string | null
          plan_name: string
          regional_bounds: Json | null
          sources: Database["public"]["Enums"]["email_source"][] | null
          updated_at: string | null
          vehicle_id: string
          vehicle_size: string | null
          zip_code: string | null
        }
        Insert: {
          available_date?: string | null
          available_feet?: string | null
          available_time?: string | null
          created_at?: string
          created_by?: string | null
          destination_radius?: string | null
          destination_zip?: string | null
          enabled?: boolean
          floor_load_id?: string | null
          hunt_coordinates?: Json | null
          id?: string
          initial_match_done?: boolean | null
          last_modified?: string
          load_capacity?: string | null
          mile_limit?: string | null
          notes?: string | null
          partial?: boolean | null
          pickup_radius?: string | null
          plan_name: string
          regional_bounds?: Json | null
          sources?: Database["public"]["Enums"]["email_source"][] | null
          updated_at?: string | null
          vehicle_id: string
          vehicle_size?: string | null
          zip_code?: string | null
        }
        Update: {
          available_date?: string | null
          available_feet?: string | null
          available_time?: string | null
          created_at?: string
          created_by?: string | null
          destination_radius?: string | null
          destination_zip?: string | null
          enabled?: boolean
          floor_load_id?: string | null
          hunt_coordinates?: Json | null
          id?: string
          initial_match_done?: boolean | null
          last_modified?: string
          load_capacity?: string | null
          mile_limit?: string | null
          notes?: string | null
          partial?: boolean | null
          pickup_radius?: string | null
          plan_name?: string
          regional_bounds?: Json | null
          sources?: Database["public"]["Enums"]["email_source"][] | null
          updated_at?: string | null
          vehicle_id?: string
          vehicle_size?: string | null
          zip_code?: string | null
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
      invoice_loads: {
        Row: {
          amount: number | null
          description: string | null
          id: string
          invoice_id: string | null
          load_id: string | null
        }
        Insert: {
          amount?: number | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          load_id?: string | null
        }
        Update: {
          amount?: number | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          load_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_loads_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_loads_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          advance_issued: number | null
          amount_paid: number | null
          balance_due: number | null
          billing_party: string | null
          created_at: string | null
          customer_address: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          due_date: string | null
          expected_deposit: number | null
          id: string
          invoice_date: string | null
          invoice_number: string
          notes: string | null
          paid_at: string | null
          payment_date: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_terms: string | null
          sent_at: string | null
          status: string | null
          subtotal: number | null
          tax: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          advance_issued?: number | null
          amount_paid?: number | null
          balance_due?: number | null
          billing_party?: string | null
          created_at?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          due_date?: string | null
          expected_deposit?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number: string
          notes?: string | null
          paid_at?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_terms?: string | null
          sent_at?: string | null
          status?: string | null
          subtotal?: number | null
          tax?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          advance_issued?: number | null
          amount_paid?: number | null
          balance_due?: number | null
          billing_party?: string | null
          created_at?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          due_date?: string | null
          expected_deposit?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string
          notes?: string | null
          paid_at?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_terms?: string | null
          sent_at?: string | null
          status?: string | null
          subtotal?: number | null
          tax?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      load_bids: {
        Row: {
          bid_amount: number
          carrier_id: string | null
          created_at: string
          dispatcher_id: string | null
          id: string
          load_email_id: string | null
          load_id: string
          match_id: string | null
          status: string | null
          to_email: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          bid_amount: number
          carrier_id?: string | null
          created_at?: string
          dispatcher_id?: string | null
          id?: string
          load_email_id?: string | null
          load_id: string
          match_id?: string | null
          status?: string | null
          to_email?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          bid_amount?: number
          carrier_id?: string | null
          created_at?: string
          dispatcher_id?: string | null
          id?: string
          load_email_id?: string | null
          load_id?: string
          match_id?: string | null
          status?: string | null
          to_email?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "load_bids_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_bids_dispatcher_id_fkey"
            columns: ["dispatcher_id"]
            isOneToOne: false
            referencedRelation: "dispatchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_bids_load_email_id_fkey"
            columns: ["load_email_id"]
            isOneToOne: false
            referencedRelation: "load_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_bids_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "load_hunt_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_bids_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "unreviewed_matches"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "load_bids_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      load_documents: {
        Row: {
          document_type: string | null
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          load_id: string | null
          notes: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          document_type?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          load_id?: string | null
          notes?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          document_type?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          load_id?: string | null
          notes?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "load_documents_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      load_emails: {
        Row: {
          assigned_load_id: string | null
          body_html: string | null
          body_text: string | null
          created_at: string
          email_id: string
          email_source: string
          expires_at: string | null
          from_email: string
          from_name: string | null
          has_issues: boolean | null
          id: string
          issue_notes: string | null
          load_id: string | null
          marked_missed_at: string | null
          parsed_data: Json | null
          received_at: string
          status: string
          subject: string | null
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_load_id?: string | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          email_id: string
          email_source?: string
          expires_at?: string | null
          from_email: string
          from_name?: string | null
          has_issues?: boolean | null
          id?: string
          issue_notes?: string | null
          load_id?: string | null
          marked_missed_at?: string | null
          parsed_data?: Json | null
          received_at: string
          status?: string
          subject?: string | null
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_load_id?: string | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          email_id?: string
          email_source?: string
          expires_at?: string | null
          from_email?: string
          from_name?: string | null
          has_issues?: boolean | null
          id?: string
          issue_notes?: string | null
          load_id?: string | null
          marked_missed_at?: string | null
          parsed_data?: Json | null
          received_at?: string
          status?: string
          subject?: string | null
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_load_emails_load"
            columns: ["assigned_load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      load_emails_archive: {
        Row: {
          archived_at: string
          assigned_load_id: string | null
          body_html: string | null
          body_text: string | null
          email_id: string
          email_source: string
          expires_at: string | null
          from_email: string
          from_name: string | null
          has_issues: boolean | null
          id: string
          issue_notes: string | null
          load_id: string | null
          marked_missed_at: string | null
          original_created_at: string
          original_id: string
          original_updated_at: string
          parsed_data: Json | null
          received_at: string
          status: string
          subject: string | null
          thread_id: string | null
        }
        Insert: {
          archived_at?: string
          assigned_load_id?: string | null
          body_html?: string | null
          body_text?: string | null
          email_id: string
          email_source: string
          expires_at?: string | null
          from_email: string
          from_name?: string | null
          has_issues?: boolean | null
          id?: string
          issue_notes?: string | null
          load_id?: string | null
          marked_missed_at?: string | null
          original_created_at: string
          original_id: string
          original_updated_at: string
          parsed_data?: Json | null
          received_at: string
          status: string
          subject?: string | null
          thread_id?: string | null
        }
        Update: {
          archived_at?: string
          assigned_load_id?: string | null
          body_html?: string | null
          body_text?: string | null
          email_id?: string
          email_source?: string
          expires_at?: string | null
          from_email?: string
          from_name?: string | null
          has_issues?: boolean | null
          id?: string
          issue_notes?: string | null
          load_id?: string | null
          marked_missed_at?: string | null
          original_created_at?: string
          original_id?: string
          original_updated_at?: string
          parsed_data?: Json | null
          received_at?: string
          status?: string
          subject?: string | null
          thread_id?: string | null
        }
        Relationships: []
      }
      load_expenses: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          description: string | null
          expense_type: string
          id: string
          incurred_date: string | null
          load_id: string | null
          notes: string | null
          paid_by: string | null
          receipt_url: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expense_type: string
          id?: string
          incurred_date?: string | null
          load_id?: string | null
          notes?: string | null
          paid_by?: string | null
          receipt_url?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expense_type?: string
          id?: string
          incurred_date?: string | null
          load_id?: string | null
          notes?: string | null
          paid_by?: string | null
          receipt_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "load_expenses_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      load_hunt_matches: {
        Row: {
          bid_at: string | null
          bid_by: string | null
          bid_rate: number | null
          booked_load_id: string | null
          created_at: string
          distance_miles: number | null
          hunt_plan_id: string
          id: string
          is_active: boolean
          load_email_id: string
          match_score: number | null
          match_status: string
          matched_at: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          bid_at?: string | null
          bid_by?: string | null
          bid_rate?: number | null
          booked_load_id?: string | null
          created_at?: string
          distance_miles?: number | null
          hunt_plan_id: string
          id?: string
          is_active?: boolean
          load_email_id: string
          match_score?: number | null
          match_status?: string
          matched_at?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          bid_at?: string | null
          bid_by?: string | null
          bid_rate?: number | null
          booked_load_id?: string | null
          created_at?: string
          distance_miles?: number | null
          hunt_plan_id?: string
          id?: string
          is_active?: boolean
          load_email_id?: string
          match_score?: number | null
          match_status?: string
          matched_at?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "load_hunt_matches_booked_load_id_fkey"
            columns: ["booked_load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_hunt_matches_hunt_plan_id_fkey"
            columns: ["hunt_plan_id"]
            isOneToOne: false
            referencedRelation: "hunt_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_hunt_matches_load_email_id_fkey"
            columns: ["load_email_id"]
            isOneToOne: false
            referencedRelation: "load_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_hunt_matches_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      load_hunt_matches_archive: {
        Row: {
          archive_reason: string
          archived_at: string
          distance_miles: number | null
          hunt_plan_id: string
          id: string
          is_active: boolean
          load_email_id: string
          match_score: number | null
          match_status: string
          matched_at: string
          original_created_at: string
          original_match_id: string
          original_updated_at: string
          vehicle_id: string
        }
        Insert: {
          archive_reason?: string
          archived_at?: string
          distance_miles?: number | null
          hunt_plan_id: string
          id?: string
          is_active: boolean
          load_email_id: string
          match_score?: number | null
          match_status: string
          matched_at: string
          original_created_at: string
          original_match_id: string
          original_updated_at: string
          vehicle_id: string
        }
        Update: {
          archive_reason?: string
          archived_at?: string
          distance_miles?: number | null
          hunt_plan_id?: string
          id?: string
          is_active?: boolean
          load_email_id?: string
          match_score?: number | null
          match_status?: string
          matched_at?: string
          original_created_at?: string
          original_match_id?: string
          original_updated_at?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      load_stops: {
        Row: {
          actual_arrival: string | null
          actual_departure: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          detention_end: string | null
          detention_start: string | null
          id: string
          load_id: string | null
          location_address: string | null
          location_city: string | null
          location_id: string | null
          location_name: string | null
          location_state: string | null
          location_zip: string | null
          notes: string | null
          reference_numbers: string | null
          required_documents: string[] | null
          scheduled_date: string | null
          scheduled_time_end: string | null
          scheduled_time_start: string | null
          status: string | null
          stop_sequence: number
          stop_type: string
          updated_at: string | null
        }
        Insert: {
          actual_arrival?: string | null
          actual_departure?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          detention_end?: string | null
          detention_start?: string | null
          id?: string
          load_id?: string | null
          location_address?: string | null
          location_city?: string | null
          location_id?: string | null
          location_name?: string | null
          location_state?: string | null
          location_zip?: string | null
          notes?: string | null
          reference_numbers?: string | null
          required_documents?: string[] | null
          scheduled_date?: string | null
          scheduled_time_end?: string | null
          scheduled_time_start?: string | null
          status?: string | null
          stop_sequence: number
          stop_type: string
          updated_at?: string | null
        }
        Update: {
          actual_arrival?: string | null
          actual_departure?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          detention_end?: string | null
          detention_start?: string | null
          id?: string
          load_id?: string | null
          location_address?: string | null
          location_city?: string | null
          location_id?: string | null
          location_name?: string | null
          location_state?: string | null
          location_zip?: string | null
          notes?: string | null
          reference_numbers?: string | null
          required_documents?: string[] | null
          scheduled_date?: string | null
          scheduled_time_end?: string | null
          scheduled_time_start?: string | null
          status?: string | null
          stop_sequence?: number
          stop_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "load_stops_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_stops_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      loadboard_filters: {
        Row: {
          auto_mapped: boolean
          canonical_value: string[] | null
          created_at: string
          filter_type: string
          id: string
          is_hidden: boolean
          original_value: string
          reviewed_at: string | null
          source: Database["public"]["Enums"]["email_source"]
          updated_at: string
        }
        Insert: {
          auto_mapped?: boolean
          canonical_value?: string[] | null
          created_at?: string
          filter_type: string
          id?: string
          is_hidden?: boolean
          original_value: string
          reviewed_at?: string | null
          source: Database["public"]["Enums"]["email_source"]
          updated_at?: string
        }
        Update: {
          auto_mapped?: boolean
          canonical_value?: string[] | null
          created_at?: string
          filter_type?: string
          id?: string
          is_hidden?: boolean
          original_value?: string
          reviewed_at?: string | null
          source?: Database["public"]["Enums"]["email_source"]
          updated_at?: string
        }
        Relationships: []
      }
      loads: {
        Row: {
          accessorial_charges: number | null
          actual_delivery_date: string | null
          actual_miles: number | null
          actual_pickup_date: string | null
          approved_payload: number | null
          assigned_dispatcher_id: string | null
          assigned_driver_id: string | null
          assigned_vehicle_id: string | null
          available_feet: string | null
          bid_placed_at: string | null
          bid_placed_by: string | null
          billing_notes: string | null
          billing_party_address: string | null
          billing_party_city: string | null
          billing_party_contact: string | null
          billing_party_email: string | null
          billing_party_name: string | null
          billing_party_phone: string | null
          billing_party_state: string | null
          billing_party_zip: string | null
          bol_number: string | null
          broker_address: string | null
          broker_city: string | null
          broker_contact: string | null
          broker_email: string | null
          broker_fee: number | null
          broker_name: string | null
          broker_phone: string | null
          broker_state: string | null
          broker_zip: string | null
          cancelled_at: string | null
          cargo_description: string | null
          cargo_dimensions: string | null
          cargo_height: string | null
          cargo_length: string | null
          cargo_pieces: number | null
          cargo_weight: number | null
          cargo_width: string | null
          carrier_approved: boolean | null
          carrier_id: string | null
          carrier_rate: number | null
          commodity_type: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          current_location: string | null
          customer_id: string | null
          customer_rate: number | null
          delivery_address: string | null
          delivery_city: string | null
          delivery_contact: string | null
          delivery_date: string | null
          delivery_location: string | null
          delivery_notes: string | null
          delivery_phone: string | null
          delivery_state: string | null
          delivery_time: string | null
          delivery_zip: string | null
          detention_charges: number | null
          dispatch_notes: string | null
          email_source: string | null
          empty_miles: number | null
          equipment_type: string | null
          estimated_miles: number | null
          eta: string | null
          external_truck_reference: string | null
          financial_status: string | null
          fuel_surcharge: number | null
          hazmat: boolean | null
          id: string
          invoice_number: string | null
          last_updated_location: string | null
          layover_charges: number | null
          load_email_id: string | null
          load_number: string
          load_owner_id: string | null
          load_type: string | null
          match_id: string | null
          notes: string | null
          other_charges: number | null
          pickup_address: string | null
          pickup_city: string | null
          pickup_contact: string | null
          pickup_date: string | null
          pickup_location: string | null
          pickup_notes: string | null
          pickup_phone: string | null
          pickup_state: string | null
          pickup_time: string | null
          pickup_zip: string | null
          po_number: string | null
          pro_number: string | null
          profit_margin: number | null
          rate: number | null
          receiver_address: string | null
          receiver_city: string | null
          receiver_contact: string | null
          receiver_email: string | null
          receiver_name: string | null
          receiver_phone: string | null
          receiver_state: string | null
          receiver_zip: string | null
          reference_number: string | null
          route_notes: string | null
          settlement_status: string | null
          shipper_address: string | null
          shipper_city: string | null
          shipper_contact: string | null
          shipper_email: string | null
          shipper_load_id: string | null
          shipper_name: string | null
          shipper_phone: string | null
          shipper_state: string | null
          shipper_zip: string | null
          special_instructions: string | null
          status: string | null
          team_required: boolean | null
          temperature_required: string | null
          total_charges: number | null
          total_cost: number | null
          total_revenue: number | null
          truck_type_at_booking: string | null
          updated_at: string | null
          vehicle_size: string | null
        }
        Insert: {
          accessorial_charges?: number | null
          actual_delivery_date?: string | null
          actual_miles?: number | null
          actual_pickup_date?: string | null
          approved_payload?: number | null
          assigned_dispatcher_id?: string | null
          assigned_driver_id?: string | null
          assigned_vehicle_id?: string | null
          available_feet?: string | null
          bid_placed_at?: string | null
          bid_placed_by?: string | null
          billing_notes?: string | null
          billing_party_address?: string | null
          billing_party_city?: string | null
          billing_party_contact?: string | null
          billing_party_email?: string | null
          billing_party_name?: string | null
          billing_party_phone?: string | null
          billing_party_state?: string | null
          billing_party_zip?: string | null
          bol_number?: string | null
          broker_address?: string | null
          broker_city?: string | null
          broker_contact?: string | null
          broker_email?: string | null
          broker_fee?: number | null
          broker_name?: string | null
          broker_phone?: string | null
          broker_state?: string | null
          broker_zip?: string | null
          cancelled_at?: string | null
          cargo_description?: string | null
          cargo_dimensions?: string | null
          cargo_height?: string | null
          cargo_length?: string | null
          cargo_pieces?: number | null
          cargo_weight?: number | null
          cargo_width?: string | null
          carrier_approved?: boolean | null
          carrier_id?: string | null
          carrier_rate?: number | null
          commodity_type?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_location?: string | null
          customer_id?: string | null
          customer_rate?: number | null
          delivery_address?: string | null
          delivery_city?: string | null
          delivery_contact?: string | null
          delivery_date?: string | null
          delivery_location?: string | null
          delivery_notes?: string | null
          delivery_phone?: string | null
          delivery_state?: string | null
          delivery_time?: string | null
          delivery_zip?: string | null
          detention_charges?: number | null
          dispatch_notes?: string | null
          email_source?: string | null
          empty_miles?: number | null
          equipment_type?: string | null
          estimated_miles?: number | null
          eta?: string | null
          external_truck_reference?: string | null
          financial_status?: string | null
          fuel_surcharge?: number | null
          hazmat?: boolean | null
          id?: string
          invoice_number?: string | null
          last_updated_location?: string | null
          layover_charges?: number | null
          load_email_id?: string | null
          load_number: string
          load_owner_id?: string | null
          load_type?: string | null
          match_id?: string | null
          notes?: string | null
          other_charges?: number | null
          pickup_address?: string | null
          pickup_city?: string | null
          pickup_contact?: string | null
          pickup_date?: string | null
          pickup_location?: string | null
          pickup_notes?: string | null
          pickup_phone?: string | null
          pickup_state?: string | null
          pickup_time?: string | null
          pickup_zip?: string | null
          po_number?: string | null
          pro_number?: string | null
          profit_margin?: number | null
          rate?: number | null
          receiver_address?: string | null
          receiver_city?: string | null
          receiver_contact?: string | null
          receiver_email?: string | null
          receiver_name?: string | null
          receiver_phone?: string | null
          receiver_state?: string | null
          receiver_zip?: string | null
          reference_number?: string | null
          route_notes?: string | null
          settlement_status?: string | null
          shipper_address?: string | null
          shipper_city?: string | null
          shipper_contact?: string | null
          shipper_email?: string | null
          shipper_load_id?: string | null
          shipper_name?: string | null
          shipper_phone?: string | null
          shipper_state?: string | null
          shipper_zip?: string | null
          special_instructions?: string | null
          status?: string | null
          team_required?: boolean | null
          temperature_required?: string | null
          total_charges?: number | null
          total_cost?: number | null
          total_revenue?: number | null
          truck_type_at_booking?: string | null
          updated_at?: string | null
          vehicle_size?: string | null
        }
        Update: {
          accessorial_charges?: number | null
          actual_delivery_date?: string | null
          actual_miles?: number | null
          actual_pickup_date?: string | null
          approved_payload?: number | null
          assigned_dispatcher_id?: string | null
          assigned_driver_id?: string | null
          assigned_vehicle_id?: string | null
          available_feet?: string | null
          bid_placed_at?: string | null
          bid_placed_by?: string | null
          billing_notes?: string | null
          billing_party_address?: string | null
          billing_party_city?: string | null
          billing_party_contact?: string | null
          billing_party_email?: string | null
          billing_party_name?: string | null
          billing_party_phone?: string | null
          billing_party_state?: string | null
          billing_party_zip?: string | null
          bol_number?: string | null
          broker_address?: string | null
          broker_city?: string | null
          broker_contact?: string | null
          broker_email?: string | null
          broker_fee?: number | null
          broker_name?: string | null
          broker_phone?: string | null
          broker_state?: string | null
          broker_zip?: string | null
          cancelled_at?: string | null
          cargo_description?: string | null
          cargo_dimensions?: string | null
          cargo_height?: string | null
          cargo_length?: string | null
          cargo_pieces?: number | null
          cargo_weight?: number | null
          cargo_width?: string | null
          carrier_approved?: boolean | null
          carrier_id?: string | null
          carrier_rate?: number | null
          commodity_type?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_location?: string | null
          customer_id?: string | null
          customer_rate?: number | null
          delivery_address?: string | null
          delivery_city?: string | null
          delivery_contact?: string | null
          delivery_date?: string | null
          delivery_location?: string | null
          delivery_notes?: string | null
          delivery_phone?: string | null
          delivery_state?: string | null
          delivery_time?: string | null
          delivery_zip?: string | null
          detention_charges?: number | null
          dispatch_notes?: string | null
          email_source?: string | null
          empty_miles?: number | null
          equipment_type?: string | null
          estimated_miles?: number | null
          eta?: string | null
          external_truck_reference?: string | null
          financial_status?: string | null
          fuel_surcharge?: number | null
          hazmat?: boolean | null
          id?: string
          invoice_number?: string | null
          last_updated_location?: string | null
          layover_charges?: number | null
          load_email_id?: string | null
          load_number?: string
          load_owner_id?: string | null
          load_type?: string | null
          match_id?: string | null
          notes?: string | null
          other_charges?: number | null
          pickup_address?: string | null
          pickup_city?: string | null
          pickup_contact?: string | null
          pickup_date?: string | null
          pickup_location?: string | null
          pickup_notes?: string | null
          pickup_phone?: string | null
          pickup_state?: string | null
          pickup_time?: string | null
          pickup_zip?: string | null
          po_number?: string | null
          pro_number?: string | null
          profit_margin?: number | null
          rate?: number | null
          receiver_address?: string | null
          receiver_city?: string | null
          receiver_contact?: string | null
          receiver_email?: string | null
          receiver_name?: string | null
          receiver_phone?: string | null
          receiver_state?: string | null
          receiver_zip?: string | null
          reference_number?: string | null
          route_notes?: string | null
          settlement_status?: string | null
          shipper_address?: string | null
          shipper_city?: string | null
          shipper_contact?: string | null
          shipper_email?: string | null
          shipper_load_id?: string | null
          shipper_name?: string | null
          shipper_phone?: string | null
          shipper_state?: string | null
          shipper_zip?: string | null
          special_instructions?: string | null
          status?: string | null
          team_required?: boolean | null
          temperature_required?: string | null
          total_charges?: number | null
          total_cost?: number | null
          total_revenue?: number | null
          truck_type_at_booking?: string | null
          updated_at?: string | null
          vehicle_size?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loads_assigned_dispatcher_id_fkey"
            columns: ["assigned_dispatcher_id"]
            isOneToOne: false
            referencedRelation: "dispatchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_assigned_vehicle_id_fkey"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_bid_placed_by_fkey"
            columns: ["bid_placed_by"]
            isOneToOne: false
            referencedRelation: "dispatchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_load_email_id_fkey"
            columns: ["load_email_id"]
            isOneToOne: false
            referencedRelation: "load_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_load_owner_id_fkey"
            columns: ["load_owner_id"]
            isOneToOne: false
            referencedRelation: "dispatchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "load_hunt_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "unreviewed_matches"
            referencedColumns: ["match_id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string | null
          delivery_instructions: string | null
          hours: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          pickup_instructions: string | null
          state: string | null
          status: string | null
          type: string | null
          updated_at: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          delivery_instructions?: string | null
          hours?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          pickup_instructions?: string | null
          state?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          delivery_instructions?: string | null
          hours?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          pickup_instructions?: string | null
          state?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
          zip?: string | null
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
      maintenance_records: {
        Row: {
          asset_id: string | null
          cost: number | null
          created_at: string | null
          created_by: string | null
          description: string
          downtime_hours: number | null
          engine_hours: number | null
          id: string
          invoice_number: string | null
          invoice_url: string | null
          maintenance_type: string
          next_service_date: string | null
          next_service_odometer: number | null
          notes: string | null
          odometer: number | null
          performed_by: string | null
          service_date: string
          status: string | null
          vendor: string | null
        }
        Insert: {
          asset_id?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          description: string
          downtime_hours?: number | null
          engine_hours?: number | null
          id?: string
          invoice_number?: string | null
          invoice_url?: string | null
          maintenance_type: string
          next_service_date?: string | null
          next_service_odometer?: number | null
          notes?: string | null
          odometer?: number | null
          performed_by?: string | null
          service_date: string
          status?: string | null
          vendor?: string | null
        }
        Update: {
          asset_id?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          downtime_hours?: number | null
          engine_hours?: number | null
          id?: string
          invoice_number?: string | null
          invoice_url?: string | null
          maintenance_type?: string
          next_service_date?: string | null
          next_service_odometer?: number | null
          notes?: string | null
          odometer?: number | null
          performed_by?: string | null
          service_date?: string
          status?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_records_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      map_load_tracking: {
        Row: {
          component_name: string
          created_at: string
          id: string
          month_year: string | null
          user_id: string | null
        }
        Insert: {
          component_name: string
          created_at?: string
          id?: string
          month_year?: string | null
          user_id?: string | null
        }
        Update: {
          component_name?: string
          created_at?: string
          id?: string
          month_year?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      mapbox_billing_history: {
        Row: {
          baseline_set_at: string | null
          billing_end: string
          billing_period: string
          billing_start: string
          created_at: string
          directions_requests: number
          geocoding_requests: number
          id: string
          invoice_date: string | null
          is_baseline: boolean | null
          map_loads: number
          notes: string | null
          total_cost: number
          updated_at: string
        }
        Insert: {
          baseline_set_at?: string | null
          billing_end: string
          billing_period: string
          billing_start: string
          created_at?: string
          directions_requests?: number
          geocoding_requests?: number
          id?: string
          invoice_date?: string | null
          is_baseline?: boolean | null
          map_loads?: number
          notes?: string | null
          total_cost?: number
          updated_at?: string
        }
        Update: {
          baseline_set_at?: string | null
          billing_end?: string
          billing_period?: string
          billing_start?: string
          created_at?: string
          directions_requests?: number
          geocoding_requests?: number
          id?: string
          invoice_date?: string | null
          is_baseline?: boolean | null
          map_loads?: number
          notes?: string | null
          total_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      mapbox_monthly_usage: {
        Row: {
          created_at: string
          directions_api_calls: number | null
          directions_cost: number | null
          geocoding_api_calls: number
          geocoding_cost: number
          id: string
          last_synced_at: string | null
          map_loads: number
          map_loads_cost: number
          month_year: string
          total_cost: number
        }
        Insert: {
          created_at?: string
          directions_api_calls?: number | null
          directions_cost?: number | null
          geocoding_api_calls?: number
          geocoding_cost?: number
          id?: string
          last_synced_at?: string | null
          map_loads?: number
          map_loads_cost?: number
          month_year: string
          total_cost?: number
        }
        Update: {
          created_at?: string
          directions_api_calls?: number | null
          directions_cost?: number | null
          geocoding_api_calls?: number
          geocoding_cost?: number
          id?: string
          last_synced_at?: string | null
          map_loads?: number
          map_loads_cost?: number
          month_year?: string
          total_cost?: number
        }
        Relationships: []
      }
      match_action_history: {
        Row: {
          action_details: Json | null
          action_type: string
          created_at: string
          dispatcher_email: string | null
          dispatcher_id: string | null
          dispatcher_name: string | null
          id: string
          match_id: string
        }
        Insert: {
          action_details?: Json | null
          action_type: string
          created_at?: string
          dispatcher_email?: string | null
          dispatcher_id?: string | null
          dispatcher_name?: string | null
          id?: string
          match_id: string
        }
        Update: {
          action_details?: Json | null
          action_type?: string
          created_at?: string
          dispatcher_email?: string | null
          dispatcher_id?: string | null
          dispatcher_name?: string | null
          id?: string
          match_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_action_history_dispatcher_id_fkey"
            columns: ["dispatcher_id"]
            isOneToOne: false
            referencedRelation: "dispatchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_action_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "load_hunt_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_action_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "unreviewed_matches"
            referencedColumns: ["match_id"]
          },
        ]
      }
      missed_loads_history: {
        Row: {
          created_at: string | null
          dispatcher_id: string | null
          from_email: string | null
          hunt_plan_id: string | null
          id: string
          load_email_id: string
          match_id: string | null
          missed_at: string
          received_at: string | null
          reset_at: string | null
          subject: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string | null
          dispatcher_id?: string | null
          from_email?: string | null
          hunt_plan_id?: string | null
          id?: string
          load_email_id: string
          match_id?: string | null
          missed_at?: string
          received_at?: string | null
          reset_at?: string | null
          subject?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string | null
          dispatcher_id?: string | null
          from_email?: string | null
          hunt_plan_id?: string | null
          id?: string
          load_email_id?: string
          match_id?: string | null
          missed_at?: string
          received_at?: string | null
          reset_at?: string | null
          subject?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "missed_loads_history_hunt_plan_id_fkey"
            columns: ["hunt_plan_id"]
            isOneToOne: false
            referencedRelation: "hunt_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missed_loads_history_load_email_id_fkey"
            columns: ["load_email_id"]
            isOneToOne: false
            referencedRelation: "load_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missed_loads_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      parser_hints: {
        Row: {
          context_after: string | null
          context_before: string | null
          created_at: string
          created_by: string | null
          email_source: string
          example_value: string | null
          field_name: string
          id: string
          is_active: boolean | null
          notes: string | null
          pattern: string
          priority: number | null
          updated_at: string
        }
        Insert: {
          context_after?: string | null
          context_before?: string | null
          created_at?: string
          created_by?: string | null
          email_source?: string
          example_value?: string | null
          field_name: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          pattern: string
          priority?: number | null
          updated_at?: string
        }
        Update: {
          context_after?: string | null
          context_before?: string | null
          created_at?: string
          created_by?: string | null
          email_source?: string
          example_value?: string | null
          field_name?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          pattern?: string
          priority?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      pay_structures: {
        Row: {
          applies_to: string
          created_at: string | null
          description: string | null
          entity_id: string
          entity_type: string
          id: string
          is_active: boolean
          pay_type: string
          priority: number
          rate: number
          updated_at: string | null
        }
        Insert: {
          applies_to: string
          created_at?: string | null
          description?: string | null
          entity_id: string
          entity_type: string
          id?: string
          is_active?: boolean
          pay_type: string
          priority?: number
          rate: number
          updated_at?: string | null
        }
        Update: {
          applies_to?: string
          created_at?: string | null
          description?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          is_active?: boolean
          pay_type?: string
          priority?: number
          rate?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      payees: {
        Row: {
          account_number: string | null
          address: string | null
          bank_name: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          payment_method: string | null
          phone: string | null
          routing_number: string | null
          status: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          account_number?: string | null
          address?: string | null
          bank_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          payment_method?: string | null
          phone?: string | null
          routing_number?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          account_number?: string | null
          address?: string | null
          bank_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          payment_method?: string | null
          phone?: string | null
          routing_number?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_formulas: {
        Row: {
          add_columns: string[]
          created_at: string
          formula_name: string
          id: string
          subtract_columns: string[]
          updated_at: string
        }
        Insert: {
          add_columns?: string[]
          created_at?: string
          formula_name: string
          id?: string
          subtract_columns?: string[]
          updated_at?: string
        }
        Update: {
          add_columns?: string[]
          created_at?: string
          formula_name?: string
          id?: string
          subtract_columns?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          category: string
          code: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          parent_permission_id: string | null
          permission_type: string
          sort_order: number | null
        }
        Insert: {
          category: string
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          parent_permission_id?: string | null
          permission_type?: string
          sort_order?: number | null
        }
        Update: {
          category?: string
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          parent_permission_id?: string | null
          permission_type?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "permissions_parent_permission_id_fkey"
            columns: ["parent_permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_state: {
        Row: {
          floor_load_id: string
          floor_received_at: string
          id: string
          last_processed_load_id: string | null
          last_processed_received_at: string | null
          updated_at: string | null
        }
        Insert: {
          floor_load_id?: string
          floor_received_at?: string
          id?: string
          last_processed_load_id?: string | null
          last_processed_received_at?: string | null
          updated_at?: string | null
        }
        Update: {
          floor_load_id?: string
          floor_received_at?: string
          id?: string
          last_processed_load_id?: string | null
          last_processed_received_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          notes: string | null
          phone: string | null
          phone_secondary: string | null
          state: string | null
          status: string | null
          timezone: string | null
          updated_at: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          notes?: string | null
          phone?: string | null
          phone_secondary?: string | null
          state?: string | null
          status?: string | null
          timezone?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          phone_secondary?: string | null
          state?: string | null
          status?: string | null
          timezone?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      pubsub_tracking: {
        Row: {
          created_at: string
          id: string
          message_size_bytes: number | null
          message_type: string | null
          month_year: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message_size_bytes?: number | null
          message_type?: string | null
          month_year?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message_size_bytes?: number | null
          message_type?: string | null
          month_year?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string | null
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      screen_share_sessions: {
        Row: {
          admin_offer: string | null
          admin_user_id: string | null
          client_answer: string | null
          client_user_id: string | null
          connected_at: string | null
          created_at: string
          ended_at: string | null
          expires_at: string
          ice_candidates: Json | null
          id: string
          initiated_by: string
          session_code: string
          status: string
        }
        Insert: {
          admin_offer?: string | null
          admin_user_id?: string | null
          client_answer?: string | null
          client_user_id?: string | null
          connected_at?: string | null
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          ice_candidates?: Json | null
          id?: string
          initiated_by: string
          session_code: string
          status?: string
        }
        Update: {
          admin_offer?: string | null
          admin_user_id?: string | null
          client_answer?: string | null
          client_user_id?: string | null
          connected_at?: string | null
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          ice_candidates?: Json | null
          id?: string
          initiated_by?: string
          session_code?: string
          status?: string
        }
        Relationships: []
      }
      settlement_loads: {
        Row: {
          driver_pay: number | null
          id: string
          load_id: string | null
          miles: number | null
          rate: number | null
          settlement_id: string | null
        }
        Insert: {
          driver_pay?: number | null
          id?: string
          load_id?: string | null
          miles?: number | null
          rate?: number | null
          settlement_id?: string | null
        }
        Update: {
          driver_pay?: number | null
          id?: string
          load_id?: string | null
          miles?: number | null
          rate?: number | null
          settlement_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlement_loads_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_loads_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          accessorial_pay: number | null
          advance_deduction: number | null
          approved_at: string | null
          approved_by: string | null
          base_rate: number | null
          bonus_pay: number | null
          created_at: string | null
          detention_pay: number | null
          driver_id: string | null
          equipment_lease: number | null
          escrow_deduction: number | null
          fuel_advance: number | null
          fuel_deduction: number | null
          gross_pay: number | null
          id: string
          insurance_deduction: number | null
          layover_pay: number | null
          maintenance_deduction: number | null
          net_pay: number | null
          notes: string | null
          other_deductions: number | null
          other_earnings: number | null
          payee_id: string | null
          payment_date: string | null
          payment_method: string | null
          payment_reference: string | null
          period_end: string | null
          period_start: string | null
          settlement_number: string
          settlement_type: string | null
          status: string | null
          total_deductions: number | null
          total_loads: number | null
          total_miles: number | null
          updated_at: string | null
        }
        Insert: {
          accessorial_pay?: number | null
          advance_deduction?: number | null
          approved_at?: string | null
          approved_by?: string | null
          base_rate?: number | null
          bonus_pay?: number | null
          created_at?: string | null
          detention_pay?: number | null
          driver_id?: string | null
          equipment_lease?: number | null
          escrow_deduction?: number | null
          fuel_advance?: number | null
          fuel_deduction?: number | null
          gross_pay?: number | null
          id?: string
          insurance_deduction?: number | null
          layover_pay?: number | null
          maintenance_deduction?: number | null
          net_pay?: number | null
          notes?: string | null
          other_deductions?: number | null
          other_earnings?: number | null
          payee_id?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          period_end?: string | null
          period_start?: string | null
          settlement_number: string
          settlement_type?: string | null
          status?: string | null
          total_deductions?: number | null
          total_loads?: number | null
          total_miles?: number | null
          updated_at?: string | null
        }
        Update: {
          accessorial_pay?: number | null
          advance_deduction?: number | null
          approved_at?: string | null
          approved_by?: string | null
          base_rate?: number | null
          bonus_pay?: number | null
          created_at?: string | null
          detention_pay?: number | null
          driver_id?: string | null
          equipment_lease?: number | null
          escrow_deduction?: number | null
          fuel_advance?: number | null
          fuel_deduction?: number | null
          gross_pay?: number | null
          id?: string
          insurance_deduction?: number | null
          layover_pay?: number | null
          maintenance_deduction?: number | null
          net_pay?: number | null
          notes?: string | null
          other_deductions?: number | null
          other_earnings?: number | null
          payee_id?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          period_end?: string | null
          period_start?: string | null
          settlement_number?: string
          settlement_type?: string | null
          status?: string | null
          total_deductions?: number | null
          total_loads?: number | null
          total_miles?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      spend_alerts: {
        Row: {
          alert_threshold: number
          created_at: string
          id: string
          is_active: boolean | null
          last_alerted_amount: number | null
          last_alerted_at: string | null
          total_spent: number | null
          updated_at: string
          user_email: string
        }
        Insert: {
          alert_threshold?: number
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_alerted_amount?: number | null
          last_alerted_at?: string | null
          total_spent?: number | null
          updated_at?: string
          user_email: string
        }
        Update: {
          alert_threshold?: number
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_alerted_amount?: number | null
          last_alerted_at?: string | null
          total_spent?: number | null
          updated_at?: string
          user_email?: string
        }
        Relationships: []
      }
      sylectus_type_config: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          mapped_to: string | null
          original_value: string
          type_category: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          mapped_to?: string | null
          original_value: string
          type_category: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          mapped_to?: string | null
          original_value?: string
          type_category?: string
        }
        Relationships: []
      }
      user_cost_settings: {
        Row: {
          cloud_calibrated_rate: number | null
          created_at: string
          id: string
          mapbox_calibrated_multiplier: number | null
          monthly_budget: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cloud_calibrated_rate?: number | null
          created_at?: string
          id?: string
          mapbox_calibrated_multiplier?: number | null
          monthly_budget?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cloud_calibrated_rate?: number | null
          created_at?: string
          id?: string
          mapbox_calibrated_multiplier?: number | null
          monthly_budget?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_custom_roles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_custom_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_fleet_column_preferences: {
        Row: {
          columns: Json
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          columns: Json
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          columns?: Json
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          expense_group_collapsed: boolean | null
          expense_group_columns: string[] | null
          id: string
          show_column_lines: boolean | null
          sound_settings: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expense_group_collapsed?: boolean | null
          expense_group_columns?: string[] | null
          id?: string
          show_column_lines?: boolean | null
          sound_settings?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expense_group_collapsed?: boolean | null
          expense_group_columns?: string[] | null
          id?: string
          show_column_lines?: boolean | null
          sound_settings?: Json | null
          updated_at?: string
          user_id?: string
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
      vehicle_location_history: {
        Row: {
          created_at: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          odometer: number | null
          recorded_at: string
          speed: number | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          odometer?: number | null
          recorded_at?: string
          speed?: number | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          odometer?: number | null
          recorded_at?: string
          speed?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_location_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          air_ride: boolean | null
          asset_ownership: string | null
          asset_subtype: string | null
          asset_type: string | null
          assigned_driver_id: string | null
          axles: number | null
          bid_as: string | null
          blankets: number | null
          camera_image_url: string | null
          cargo_coverage_exp_date: string | null
          cargo_coverage_status: string | null
          carrier: string | null
          carrier_id: string | null
          cents_per_mile: number | null
          clearance: number | null
          clearance_inches: number | null
          contractor_percentage: number | null
          created_at: string | null
          dash_cam_sn: string | null
          dimensions_height: number | null
          dimensions_length: number | null
          dimensions_width: number | null
          door_dims_height: number | null
          door_dims_width: number | null
          door_sensors: boolean | null
          door_type: string | null
          driver_1_id: string | null
          driver_2_id: string | null
          eld_device_sn: string | null
          fault_codes: Json | null
          formatted_address: string | null
          fuel_efficiency_mpg: number | null
          fuel_per_gallon: number | null
          fuel_tank_capacity: number | null
          fuel_type: string | null
          has_side_door: boolean | null
          horizontal_etracks: number | null
          id: string
          insurance_cost_per_month: number | null
          insurance_expiry: string | null
          last_location: string | null
          last_service_date: string | null
          last_updated: string | null
          liability_coverage_exp_date: string | null
          liability_coverage_status: string | null
          license_plate: string | null
          lift_gate: boolean | null
          lift_gate_capacity: number | null
          lift_gate_dims: string | null
          load_bars_etrack: number | null
          load_bars_non_etrack: number | null
          make: string | null
          mileage: number | null
          model: string | null
          monthly_payment: number | null
          next_service_date: string | null
          notes: string | null
          odometer: number | null
          oil_change_due: number | null
          oil_change_remaining: number | null
          pallet_jack: boolean | null
          pallet_jack_capacity: number | null
          panic_button: boolean | null
          payee: string | null
          payee_id: string | null
          payload: number | null
          physical_coverage_exp_date: string | null
          physical_coverage_status: string | null
          pickup_date: string | null
          pickup_odometer: number | null
          primary_dispatcher_id: string | null
          provider: string | null
          provider_id: string | null
          provider_status: string | null
          reg_plate: string | null
          reg_state: string | null
          registration_exp_date: string | null
          registration_expiry: string | null
          registration_status: string | null
          requires_load_approval: boolean | null
          return_date: string | null
          return_odometer: number | null
          speed: number | null
          status: string | null
          stopped_status: string | null
          straps_count: number | null
          suspension: string | null
          team: boolean | null
          temp_control: boolean | null
          toll_device_sn: string | null
          tracking_device_imei: string | null
          trailer_tracking: boolean | null
          truck_type: string | null
          updated_at: string | null
          vehicle_number: string | null
          vehicle_size: number | null
          vertical_etrack_rows: number | null
          vin: string | null
          weekly_payment: number | null
          year: number | null
        }
        Insert: {
          air_ride?: boolean | null
          asset_ownership?: string | null
          asset_subtype?: string | null
          asset_type?: string | null
          assigned_driver_id?: string | null
          axles?: number | null
          bid_as?: string | null
          blankets?: number | null
          camera_image_url?: string | null
          cargo_coverage_exp_date?: string | null
          cargo_coverage_status?: string | null
          carrier?: string | null
          carrier_id?: string | null
          cents_per_mile?: number | null
          clearance?: number | null
          clearance_inches?: number | null
          contractor_percentage?: number | null
          created_at?: string | null
          dash_cam_sn?: string | null
          dimensions_height?: number | null
          dimensions_length?: number | null
          dimensions_width?: number | null
          door_dims_height?: number | null
          door_dims_width?: number | null
          door_sensors?: boolean | null
          door_type?: string | null
          driver_1_id?: string | null
          driver_2_id?: string | null
          eld_device_sn?: string | null
          fault_codes?: Json | null
          formatted_address?: string | null
          fuel_efficiency_mpg?: number | null
          fuel_per_gallon?: number | null
          fuel_tank_capacity?: number | null
          fuel_type?: string | null
          has_side_door?: boolean | null
          horizontal_etracks?: number | null
          id?: string
          insurance_cost_per_month?: number | null
          insurance_expiry?: string | null
          last_location?: string | null
          last_service_date?: string | null
          last_updated?: string | null
          liability_coverage_exp_date?: string | null
          liability_coverage_status?: string | null
          license_plate?: string | null
          lift_gate?: boolean | null
          lift_gate_capacity?: number | null
          lift_gate_dims?: string | null
          load_bars_etrack?: number | null
          load_bars_non_etrack?: number | null
          make?: string | null
          mileage?: number | null
          model?: string | null
          monthly_payment?: number | null
          next_service_date?: string | null
          notes?: string | null
          odometer?: number | null
          oil_change_due?: number | null
          oil_change_remaining?: number | null
          pallet_jack?: boolean | null
          pallet_jack_capacity?: number | null
          panic_button?: boolean | null
          payee?: string | null
          payee_id?: string | null
          payload?: number | null
          physical_coverage_exp_date?: string | null
          physical_coverage_status?: string | null
          pickup_date?: string | null
          pickup_odometer?: number | null
          primary_dispatcher_id?: string | null
          provider?: string | null
          provider_id?: string | null
          provider_status?: string | null
          reg_plate?: string | null
          reg_state?: string | null
          registration_exp_date?: string | null
          registration_expiry?: string | null
          registration_status?: string | null
          requires_load_approval?: boolean | null
          return_date?: string | null
          return_odometer?: number | null
          speed?: number | null
          status?: string | null
          stopped_status?: string | null
          straps_count?: number | null
          suspension?: string | null
          team?: boolean | null
          temp_control?: boolean | null
          toll_device_sn?: string | null
          tracking_device_imei?: string | null
          trailer_tracking?: boolean | null
          truck_type?: string | null
          updated_at?: string | null
          vehicle_number?: string | null
          vehicle_size?: number | null
          vertical_etrack_rows?: number | null
          vin?: string | null
          weekly_payment?: number | null
          year?: number | null
        }
        Update: {
          air_ride?: boolean | null
          asset_ownership?: string | null
          asset_subtype?: string | null
          asset_type?: string | null
          assigned_driver_id?: string | null
          axles?: number | null
          bid_as?: string | null
          blankets?: number | null
          camera_image_url?: string | null
          cargo_coverage_exp_date?: string | null
          cargo_coverage_status?: string | null
          carrier?: string | null
          carrier_id?: string | null
          cents_per_mile?: number | null
          clearance?: number | null
          clearance_inches?: number | null
          contractor_percentage?: number | null
          created_at?: string | null
          dash_cam_sn?: string | null
          dimensions_height?: number | null
          dimensions_length?: number | null
          dimensions_width?: number | null
          door_dims_height?: number | null
          door_dims_width?: number | null
          door_sensors?: boolean | null
          door_type?: string | null
          driver_1_id?: string | null
          driver_2_id?: string | null
          eld_device_sn?: string | null
          fault_codes?: Json | null
          formatted_address?: string | null
          fuel_efficiency_mpg?: number | null
          fuel_per_gallon?: number | null
          fuel_tank_capacity?: number | null
          fuel_type?: string | null
          has_side_door?: boolean | null
          horizontal_etracks?: number | null
          id?: string
          insurance_cost_per_month?: number | null
          insurance_expiry?: string | null
          last_location?: string | null
          last_service_date?: string | null
          last_updated?: string | null
          liability_coverage_exp_date?: string | null
          liability_coverage_status?: string | null
          license_plate?: string | null
          lift_gate?: boolean | null
          lift_gate_capacity?: number | null
          lift_gate_dims?: string | null
          load_bars_etrack?: number | null
          load_bars_non_etrack?: number | null
          make?: string | null
          mileage?: number | null
          model?: string | null
          monthly_payment?: number | null
          next_service_date?: string | null
          notes?: string | null
          odometer?: number | null
          oil_change_due?: number | null
          oil_change_remaining?: number | null
          pallet_jack?: boolean | null
          pallet_jack_capacity?: number | null
          panic_button?: boolean | null
          payee?: string | null
          payee_id?: string | null
          payload?: number | null
          physical_coverage_exp_date?: string | null
          physical_coverage_status?: string | null
          pickup_date?: string | null
          pickup_odometer?: number | null
          primary_dispatcher_id?: string | null
          provider?: string | null
          provider_id?: string | null
          provider_status?: string | null
          reg_plate?: string | null
          reg_state?: string | null
          registration_exp_date?: string | null
          registration_expiry?: string | null
          registration_status?: string | null
          requires_load_approval?: boolean | null
          return_date?: string | null
          return_odometer?: number | null
          speed?: number | null
          status?: string | null
          stopped_status?: string | null
          straps_count?: number | null
          suspension?: string | null
          team?: boolean | null
          temp_control?: boolean | null
          toll_device_sn?: string | null
          tracking_device_imei?: string | null
          trailer_tracking?: boolean | null
          truck_type?: string | null
          updated_at?: string | null
          vehicle_number?: string | null
          vehicle_size?: number | null
          vertical_etrack_rows?: number | null
          vin?: string | null
          weekly_payment?: number | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "payees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      unreviewed_matches: {
        Row: {
          distance_miles: number | null
          email_id: string | null
          email_source: string | null
          email_status: string | null
          expires_at: string | null
          from_email: string | null
          from_name: string | null
          hunt_enabled: boolean | null
          hunt_plan_id: string | null
          hunt_zip: string | null
          is_active: boolean | null
          load_email_id: string | null
          load_id: string | null
          match_id: string | null
          match_status: string | null
          matched_at: string | null
          parsed_data: Json | null
          pickup_radius: string | null
          plan_name: string | null
          received_at: string | null
          subject: string | null
          vehicle_id: string | null
          vehicle_size: string | null
        }
        Relationships: [
          {
            foreignKeyName: "load_hunt_matches_hunt_plan_id_fkey"
            columns: ["hunt_plan_id"]
            isOneToOne: false
            referencedRelation: "hunt_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_hunt_matches_load_email_id_fkey"
            columns: ["load_email_id"]
            isOneToOne: false
            referencedRelation: "load_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_hunt_matches_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      archive_old_load_emails: { Args: never; Returns: number }
      archive_old_load_emails_batched: {
        Args: { batch_size?: number }
        Returns: number
      }
      can_manage_roles: { Args: { _user_id: string }; Returns: boolean }
      cleanup_email_queue: { Args: never; Returns: number }
      cleanup_pubsub_tracking: { Args: never; Returns: number }
      cleanup_vehicle_location_history: { Args: never; Returns: number }
      generate_load_id_for_date: {
        Args: { target_date: string }
        Returns: string
      }
      get_email_queue_pending_count: { Args: never; Returns: number }
      has_permission: {
        Args: { _permission_code: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_email_invited: { Args: { check_email: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "dispatcher" | "driver"
      email_source: "sylectus" | "fullcircle" | "123loadboard" | "truckstop"
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
      app_role: ["admin", "user", "dispatcher", "driver"],
      email_source: ["sylectus", "fullcircle", "123loadboard", "truckstop"],
    },
  },
} as const
