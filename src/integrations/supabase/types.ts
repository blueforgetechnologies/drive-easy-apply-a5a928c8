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
      admin_impersonation_sessions: {
        Row: {
          admin_user_id: string
          created_at: string
          expires_at: string
          id: string
          reason: string
          revoked_at: string | null
          revoked_by: string | null
          tenant_id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          expires_at: string
          id?: string
          reason: string
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          reason?: string
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_impersonation_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
          current_step: number | null
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
          rejected_at: string | null
          rejected_by: string | null
          rejected_by_name: string | null
          rejection_reason: string | null
          restrictions: string | null
          routing_number: string | null
          safe_driving_policy: Json
          safety_bonus: number | null
          score_card: string | null
          sign_on_bonus: number | null
          status: string | null
          stop_pay: number | null
          submitted_at: string | null
          tenant_id: string
          termination_date: string | null
          updated_at: string | null
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
          current_step?: number | null
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
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_by_name?: string | null
          rejection_reason?: string | null
          restrictions?: string | null
          routing_number?: string | null
          safe_driving_policy: Json
          safety_bonus?: number | null
          score_card?: string | null
          sign_on_bonus?: number | null
          status?: string | null
          stop_pay?: number | null
          submitted_at?: string | null
          tenant_id: string
          termination_date?: string | null
          updated_at?: string | null
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
          current_step?: number | null
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
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_by_name?: string | null
          rejection_reason?: string | null
          restrictions?: string | null
          routing_number?: string | null
          safe_driving_policy?: Json
          safety_bonus?: number | null
          score_card?: string | null
          sign_on_bonus?: number | null
          status?: string | null
          stop_pay?: number | null
          submitted_at?: string | null
          tenant_id?: string
          termination_date?: string | null
          updated_at?: string | null
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
          {
            foreignKeyName: "applications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
          timestamp?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_customers: {
        Row: {
          created_at: string
          email: string | null
          stripe_customer_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          stripe_customer_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          stripe_customer_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string | null
          status: string
          stripe_subscription_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: string
          stripe_subscription_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: string
          stripe_subscription_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_credit_checks: {
        Row: {
          approval_status: string
          broker_key: string | null
          broker_name: string
          checked_at: string
          checked_by: string | null
          created_at: string
          credit_limit: number | null
          customer_id: string | null
          decision_window_start: string | null
          id: string
          load_email_id: string | null
          match_id: string | null
          mc_number: string | null
          raw_response: Json | null
          status: string
          tenant_id: string
        }
        Insert: {
          approval_status: string
          broker_key?: string | null
          broker_name: string
          checked_at?: string
          checked_by?: string | null
          created_at?: string
          credit_limit?: number | null
          customer_id?: string | null
          decision_window_start?: string | null
          id?: string
          load_email_id?: string | null
          match_id?: string | null
          mc_number?: string | null
          raw_response?: Json | null
          status?: string
          tenant_id: string
        }
        Update: {
          approval_status?: string
          broker_key?: string | null
          broker_name?: string
          checked_at?: string
          checked_by?: string | null
          created_at?: string
          credit_limit?: number | null
          customer_id?: string | null
          decision_window_start?: string | null
          id?: string
          load_email_id?: string | null
          match_id?: string | null
          mc_number?: string | null
          raw_response?: Json | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_credit_checks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_credit_checks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carrier_rate_history_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_rate_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "carriers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      circuit_breaker_events: {
        Row: {
          breaker_type: string
          created_at: string
          email_address: string
          history_id: string | null
          id: string
          reason: string
          tenant_id: string | null
        }
        Insert: {
          breaker_type: string
          created_at?: string
          email_address: string
          history_id?: string | null
          id?: string
          reason: string
          tenant_id?: string | null
        }
        Update: {
          breaker_type?: string
          created_at?: string
          email_address?: string
          history_id?: string | null
          id?: string
          reason?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "circuit_breaker_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          accounting_contact_name: string | null
          accounting_email: string | null
          accounting_phone: string | null
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
          tenant_id: string | null
          updated_at: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          accounting_contact_name?: string | null
          accounting_email?: string | null
          accounting_phone?: string | null
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
          tenant_id?: string | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          accounting_contact_name?: string | null
          accounting_email?: string | null
          accounting_phone?: string | null
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
          tenant_id?: string | null
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
          {
            foreignKeyName: "company_profile_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_system_role: boolean | null
          name: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_system_role?: boolean | null
          name: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_system_role?: boolean | null
          name?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          alias_names: string[] | null
          billing_email: string | null
          city: string | null
          contact_name: string | null
          created_at: string | null
          credit_limit: number | null
          customer_type: string | null
          dot_number: string | null
          email: string | null
          email_secondary: string | null
          factoring_approval: string | null
          factoring_flat_fee: number | null
          id: string
          mc_number: string | null
          name: string
          notes: string | null
          otr_approval_status: string | null
          otr_check_error: string | null
          otr_credit_limit: number | null
          otr_last_checked_at: string | null
          payment_terms: string | null
          phone: string | null
          phone_fax: string | null
          phone_mobile: string | null
          phone_secondary: string | null
          state: string | null
          status: string | null
          tenant_id: string
          updated_at: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          alias_names?: string[] | null
          billing_email?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string | null
          credit_limit?: number | null
          customer_type?: string | null
          dot_number?: string | null
          email?: string | null
          email_secondary?: string | null
          factoring_approval?: string | null
          factoring_flat_fee?: number | null
          id?: string
          mc_number?: string | null
          name: string
          notes?: string | null
          otr_approval_status?: string | null
          otr_check_error?: string | null
          otr_credit_limit?: number | null
          otr_last_checked_at?: string | null
          payment_terms?: string | null
          phone?: string | null
          phone_fax?: string | null
          phone_mobile?: string | null
          phone_secondary?: string | null
          state?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          alias_names?: string[] | null
          billing_email?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string | null
          credit_limit?: number | null
          customer_type?: string | null
          dot_number?: string | null
          email?: string | null
          email_secondary?: string | null
          factoring_approval?: string | null
          factoring_flat_fee?: number | null
          id?: string
          mc_number?: string | null
          name?: string
          notes?: string | null
          otr_approval_status?: string | null
          otr_check_error?: string | null
          otr_credit_limit?: number | null
          otr_last_checked_at?: string | null
          payment_terms?: string | null
          phone?: string | null
          phone_fax?: string | null
          phone_mobile?: string | null
          phone_secondary?: string | null
          state?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "dispatchers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_invites: {
        Row: {
          application_started_at: string | null
          carrier_id: string | null
          email: string
          id: string
          invited_at: string | null
          invited_by: string
          name: string | null
          opened_at: string | null
          public_token: string
          tenant_id: string
        }
        Insert: {
          application_started_at?: string | null
          carrier_id?: string | null
          email: string
          id?: string
          invited_at?: string | null
          invited_by: string
          name?: string | null
          opened_at?: string | null
          public_token?: string
          tenant_id: string
        }
        Update: {
          application_started_at?: string | null
          carrier_id?: string | null
          email?: string
          id?: string
          invited_at?: string | null
          invited_by?: string
          name?: string | null
          opened_at?: string | null
          public_token?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_invites_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_content: {
        Row: {
          content_hash: string
          first_seen_at: string
          id: string
          last_seen_at: string
          parsed_data: Json | null
          payload_url: string | null
          provider: string
          receipt_count: number
          size_bytes: number | null
        }
        Insert: {
          content_hash: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          parsed_data?: Json | null
          payload_url?: string | null
          provider: string
          receipt_count?: number
          size_bytes?: number | null
        }
        Update: {
          content_hash?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          parsed_data?: Json | null
          payload_url?: string | null
          provider?: string
          receipt_count?: number
          size_bytes?: number | null
        }
        Relationships: []
      }
      email_health_alerts: {
        Row: {
          alert_level: string
          alert_type: string
          created_at: string
          id: string
          is_business_hours: boolean
          last_email_at: string | null
          message: string
          resolved_at: string | null
          sent_at: string
          tenant_id: string | null
          threshold_minutes: number
        }
        Insert: {
          alert_level: string
          alert_type: string
          created_at?: string
          id?: string
          is_business_hours: boolean
          last_email_at?: string | null
          message: string
          resolved_at?: string | null
          sent_at?: string
          tenant_id?: string | null
          threshold_minutes: number
        }
        Update: {
          alert_level?: string
          alert_type?: string
          created_at?: string
          id?: string
          is_business_hours?: boolean
          last_email_at?: string | null
          message?: string
          resolved_at?: string | null
          sent_at?: string
          tenant_id?: string | null
          threshold_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_health_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          attempts: number
          body_html: string | null
          body_text: string | null
          content_id: string | null
          dedupe_key: string | null
          delivered_to_header: string | null
          extracted_alias: string | null
          from_email: string | null
          from_name: string | null
          gmail_history_id: string | null
          gmail_message_id: string
          id: string
          last_error: string | null
          parsed_at: string | null
          payload_url: string | null
          processed_at: string | null
          processing_started_at: string | null
          queued_at: string
          receipt_id: string | null
          routing_method: string | null
          status: string
          storage_bucket: string | null
          storage_path: string | null
          subject: string | null
          tenant_id: string | null
          to_email: string | null
        }
        Insert: {
          attempts?: number
          body_html?: string | null
          body_text?: string | null
          content_id?: string | null
          dedupe_key?: string | null
          delivered_to_header?: string | null
          extracted_alias?: string | null
          from_email?: string | null
          from_name?: string | null
          gmail_history_id?: string | null
          gmail_message_id: string
          id?: string
          last_error?: string | null
          parsed_at?: string | null
          payload_url?: string | null
          processed_at?: string | null
          processing_started_at?: string | null
          queued_at?: string
          receipt_id?: string | null
          routing_method?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          subject?: string | null
          tenant_id?: string | null
          to_email?: string | null
        }
        Update: {
          attempts?: number
          body_html?: string | null
          body_text?: string | null
          content_id?: string | null
          dedupe_key?: string | null
          delivered_to_header?: string | null
          extracted_alias?: string | null
          from_email?: string | null
          from_name?: string | null
          gmail_history_id?: string | null
          gmail_message_id?: string
          id?: string
          last_error?: string | null
          parsed_at?: string | null
          payload_url?: string | null
          processed_at?: string | null
          processing_started_at?: string | null
          queued_at?: string
          receipt_id?: string | null
          routing_method?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          subject?: string | null
          tenant_id?: string | null
          to_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "email_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "email_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_receipts: {
        Row: {
          content_id: string
          created_at: string
          delivered_to_header: string | null
          extracted_alias: string | null
          gmail_history_id: string | null
          gmail_message_id: string
          id: string
          load_email_id: string | null
          match_count: number | null
          processed_at: string | null
          provider: string
          received_at: string
          routing_method: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          content_id: string
          created_at?: string
          delivered_to_header?: string | null
          extracted_alias?: string | null
          gmail_history_id?: string | null
          gmail_message_id: string
          id?: string
          load_email_id?: string | null
          match_count?: number | null
          processed_at?: string | null
          provider: string
          received_at?: string
          routing_method?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          content_id?: string
          created_at?: string
          delivered_to_header?: string | null
          extracted_alias?: string | null
          gmail_history_id?: string | null
          gmail_message_id?: string
          id?: string
          load_email_id?: string | null
          match_count?: number | null
          processed_at?: string | null
          provider?: string
          received_at?: string
          routing_method?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_receipts_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "email_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flag_audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          feature_flag_id: string | null
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          feature_flag_id?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          feature_flag_id?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_audit_log_feature_flag_id_fkey"
            columns: ["feature_flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flag_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          default_enabled: boolean | null
          description: string | null
          id: string
          is_killswitch: boolean | null
          key: string
          name: string
          requires_role: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_enabled?: boolean | null
          description?: string | null
          id?: string
          is_killswitch?: boolean | null
          key: string
          name: string
          requires_role?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_enabled?: boolean | null
          description?: string | null
          id?: string
          is_killswitch?: boolean | null
          key?: string
          name?: string
          requires_role?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      feature_versions: {
        Row: {
          created_at: string
          created_by: string | null
          feature_flag_key: string
          feature_id: string
          id: string
          notes: string | null
          promoted_at: string | null
          scaffold_prompt: string | null
          status: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          feature_flag_key: string
          feature_id: string
          id?: string
          notes?: string | null
          promoted_at?: string | null
          scaffold_prompt?: string | null
          status?: string
          version_number?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          feature_flag_key?: string
          feature_id?: string
          id?: string
          notes?: string | null
          promoted_at?: string | null
          scaffold_prompt?: string | null
          status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "feature_versions_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "versionable_features"
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
      gmail_history_queue: {
        Row: {
          claimed_at: string | null
          created_at: string
          email_address: string
          error: string | null
          history_id: string
          id: string
          processed_at: string | null
          queued_at: string
          status: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          email_address: string
          error?: string | null
          history_id: string
          id?: string
          processed_at?: string | null
          queued_at?: string
          status?: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          email_address?: string
          error?: string | null
          history_id?: string
          id?: string
          processed_at?: string | null
          queued_at?: string
          status?: string
        }
        Relationships: []
      }
      gmail_inboxes: {
        Row: {
          created_at: string
          email_address: string
          id: string
          is_active: boolean
          tenant_id: string
        }
        Insert: {
          created_at?: string
          email_address: string
          id?: string
          is_active?: boolean
          tenant_id: string
        }
        Update: {
          created_at?: string
          email_address?: string
          id?: string
          is_active?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_inboxes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_stubs: {
        Row: {
          attempts: number
          claimed_at: string | null
          created_at: string
          email_address: string
          error: string | null
          history_id: string
          id: string
          processed_at: string | null
          queued_at: string
          source: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          email_address: string
          error?: string | null
          history_id: string
          id?: string
          processed_at?: string | null
          queued_at?: string
          source?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          email_address?: string
          error?: string | null
          history_id?: string
          id?: string
          processed_at?: string | null
          queued_at?: string
          source?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_stubs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          id: string
          needs_reauth: boolean | null
          reauth_reason: string | null
          refresh_token: string
          tenant_id: string | null
          token_expiry: string
          updated_at: string | null
          user_email: string
          watch_expiry: string | null
        }
        Insert: {
          access_token: string
          created_at?: string | null
          id?: string
          needs_reauth?: boolean | null
          reauth_reason?: string | null
          refresh_token: string
          tenant_id?: string | null
          token_expiry: string
          updated_at?: string | null
          user_email: string
          watch_expiry?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string | null
          id?: string
          needs_reauth?: boolean | null
          reauth_reason?: string | null
          refresh_token?: string
          tenant_id?: string | null
          token_expiry?: string
          updated_at?: string | null
          user_email?: string
          watch_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gmail_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hunt_fingerprint_actions: {
        Row: {
          action_count: number
          created_at: string | null
          hunt_plan_id: string
          id: string
          last_action_at: string
          last_load_email_id: string | null
          last_received_at: string | null
          load_content_fingerprint: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          action_count?: number
          created_at?: string | null
          hunt_plan_id: string
          id?: string
          last_action_at: string
          last_load_email_id?: string | null
          last_received_at?: string | null
          load_content_fingerprint: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          action_count?: number
          created_at?: string | null
          hunt_plan_id?: string
          id?: string
          last_action_at?: string
          last_load_email_id?: string | null
          last_received_at?: string | null
          load_content_fingerprint?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunt_fingerprint_actions_hunt_plan_id_fkey"
            columns: ["hunt_plan_id"]
            isOneToOne: false
            referencedRelation: "hunt_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_fingerprint_actions_last_load_email_id_fkey"
            columns: ["last_load_email_id"]
            isOneToOne: false
            referencedRelation: "load_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_fingerprint_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hunt_plans: {
        Row: {
          available_date: string | null
          available_feet: string | null
          available_time: string | null
          cooldown_seconds_min: number | null
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
          tenant_id: string
          updated_at: string | null
          vehicle_id: string
          vehicle_size: string | null
          zip_code: string | null
        }
        Insert: {
          available_date?: string | null
          available_feet?: string | null
          available_time?: string | null
          cooldown_seconds_min?: number | null
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
          tenant_id: string
          updated_at?: string | null
          vehicle_id: string
          vehicle_size?: string | null
          zip_code?: string | null
        }
        Update: {
          available_date?: string | null
          available_feet?: string | null
          available_time?: string | null
          cooldown_seconds_min?: number | null
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
          tenant_id?: string
          updated_at?: string | null
          vehicle_id?: string
          vehicle_size?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunt_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_usage_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          integration_key: string
          meta: Json | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          integration_key: string
          meta?: Json | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          integration_key?: string
          meta?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_usage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          email: string
          first_name: string | null
          id: string
          invited_at: string | null
          invited_by: string
          last_name: string | null
          phone: string | null
          tenant_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          email: string
          first_name?: string | null
          id?: string
          invited_at?: string | null
          invited_by: string
          last_name?: string | null
          phone?: string | null
          tenant_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string
          last_name?: string | null
          phone?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_batch_schedules: {
        Row: {
          batch_date: string
          created_at: string
          id: string
          schedule_name: string | null
          schedule_pdf_url: string | null
          tenant_id: string
          updated_at: string
          verification_results: Json | null
        }
        Insert: {
          batch_date: string
          created_at?: string
          id?: string
          schedule_name?: string | null
          schedule_pdf_url?: string | null
          tenant_id: string
          updated_at?: string
          verification_results?: Json | null
        }
        Update: {
          batch_date?: string
          created_at?: string
          id?: string
          schedule_name?: string | null
          schedule_pdf_url?: string | null
          tenant_id?: string
          updated_at?: string
          verification_results?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_batch_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_email_log: {
        Row: {
          attachments: Json | null
          cc: string | null
          created_at: string
          error: string | null
          id: string
          invoice_id: string
          resend_message_id: string | null
          status: string
          subject: string
          tenant_id: string
          to_email: string
          warnings: string[] | null
        }
        Insert: {
          attachments?: Json | null
          cc?: string | null
          created_at?: string
          error?: string | null
          id?: string
          invoice_id: string
          resend_message_id?: string | null
          status?: string
          subject: string
          tenant_id: string
          to_email: string
          warnings?: string[] | null
        }
        Update: {
          attachments?: Json | null
          cc?: string | null
          created_at?: string
          error?: string | null
          id?: string
          invoice_id?: string
          resend_message_id?: string | null
          status?: string
          subject?: string
          tenant_id?: string
          to_email?: string
          warnings?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_email_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_email_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_loads: {
        Row: {
          amount: number | null
          billing_reference_number: string | null
          description: string | null
          id: string
          invoice_id: string | null
          load_id: string | null
          tenant_id: string | null
        }
        Insert: {
          amount?: number | null
          billing_reference_number?: string | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          load_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          amount?: number | null
          billing_reference_number?: string | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          load_id?: string | null
          tenant_id?: string | null
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
          {
            foreignKeyName: "invoice_loads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          advance_issued: number | null
          amount_paid: number | null
          balance_due: number | null
          billing_method: string | null
          billing_party: string | null
          created_at: string | null
          customer_address: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          due_date: string | null
          expected_deposit: number | null
          id: string
          invoice_date: string | null
          invoice_number: string
          notes: string | null
          otr_error_message: string | null
          otr_failed_at: string | null
          otr_invoice_id: string | null
          otr_raw_response: Json | null
          otr_status: string | null
          otr_submitted_at: string | null
          paid_at: string | null
          paid_by_name: string | null
          payment_date: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string | null
          payment_terms: string | null
          sent_at: string | null
          status: string | null
          subtotal: number | null
          tax: number | null
          tenant_id: string
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          advance_issued?: number | null
          amount_paid?: number | null
          balance_due?: number | null
          billing_method?: string | null
          billing_party?: string | null
          created_at?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          due_date?: string | null
          expected_deposit?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number: string
          notes?: string | null
          otr_error_message?: string | null
          otr_failed_at?: string | null
          otr_invoice_id?: string | null
          otr_raw_response?: Json | null
          otr_status?: string | null
          otr_submitted_at?: string | null
          paid_at?: string | null
          paid_by_name?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          payment_terms?: string | null
          sent_at?: string | null
          status?: string | null
          subtotal?: number | null
          tax?: number | null
          tenant_id: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          advance_issued?: number | null
          amount_paid?: number | null
          balance_due?: number | null
          billing_method?: string | null
          billing_party?: string | null
          created_at?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          due_date?: string | null
          expected_deposit?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string
          notes?: string | null
          otr_error_message?: string | null
          otr_failed_at?: string | null
          otr_invoice_id?: string | null
          otr_raw_response?: Json | null
          otr_status?: string | null
          otr_submitted_at?: string | null
          paid_at?: string | null
          paid_by_name?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          payment_terms?: string | null
          sent_at?: string | null
          status?: string | null
          subtotal?: number | null
          tax?: number | null
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_bids_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
      load_content: {
        Row: {
          canonical_payload: Json
          fingerprint: string
          fingerprint_version: number
          first_seen_at: string
          last_seen_at: string
          provider: string | null
          receipt_count: number
          size_bytes: number | null
        }
        Insert: {
          canonical_payload: Json
          fingerprint: string
          fingerprint_version: number
          first_seen_at?: string
          last_seen_at?: string
          provider?: string | null
          receipt_count?: number
          size_bytes?: number | null
        }
        Update: {
          canonical_payload?: Json
          fingerprint?: string
          fingerprint_version?: number
          first_seen_at?: string
          last_seen_at?: string
          provider?: string | null
          receipt_count?: number
          size_bytes?: number | null
        }
        Relationships: []
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
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
          {
            foreignKeyName: "load_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      load_emails: {
        Row: {
          assigned_load_id: string | null
          body_html: string | null
          body_text: string | null
          content_hash: string | null
          created_at: string
          dedup_canonical_payload: Json | null
          dedup_eligible: boolean | null
          dedup_eligible_reason: string | null
          dropoff_coordinates: Json | null
          duplicate_of_id: string | null
          email_id: string
          email_source: string
          expires_at: string | null
          fingerprint_missing_reason: string | null
          fingerprint_version: number | null
          from_email: string
          from_name: string | null
          geocoding_error_code: string | null
          geocoding_status: string | null
          has_issues: boolean | null
          id: string
          ingestion_source: string | null
          is_duplicate: boolean | null
          is_update: boolean | null
          issue_notes: string | null
          load_content_fingerprint: string | null
          load_id: string | null
          marked_missed_at: string | null
          parent_email_id: string | null
          parsed_data: Json | null
          parsed_load_fingerprint: string | null
          pickup_coordinates: Json | null
          posted_at: string | null
          raw_payload_url: string | null
          received_at: string
          status: string
          subject: string | null
          tenant_id: string
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_load_id?: string | null
          body_html?: string | null
          body_text?: string | null
          content_hash?: string | null
          created_at?: string
          dedup_canonical_payload?: Json | null
          dedup_eligible?: boolean | null
          dedup_eligible_reason?: string | null
          dropoff_coordinates?: Json | null
          duplicate_of_id?: string | null
          email_id: string
          email_source?: string
          expires_at?: string | null
          fingerprint_missing_reason?: string | null
          fingerprint_version?: number | null
          from_email: string
          from_name?: string | null
          geocoding_error_code?: string | null
          geocoding_status?: string | null
          has_issues?: boolean | null
          id?: string
          ingestion_source?: string | null
          is_duplicate?: boolean | null
          is_update?: boolean | null
          issue_notes?: string | null
          load_content_fingerprint?: string | null
          load_id?: string | null
          marked_missed_at?: string | null
          parent_email_id?: string | null
          parsed_data?: Json | null
          parsed_load_fingerprint?: string | null
          pickup_coordinates?: Json | null
          posted_at?: string | null
          raw_payload_url?: string | null
          received_at: string
          status?: string
          subject?: string | null
          tenant_id: string
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_load_id?: string | null
          body_html?: string | null
          body_text?: string | null
          content_hash?: string | null
          created_at?: string
          dedup_canonical_payload?: Json | null
          dedup_eligible?: boolean | null
          dedup_eligible_reason?: string | null
          dropoff_coordinates?: Json | null
          duplicate_of_id?: string | null
          email_id?: string
          email_source?: string
          expires_at?: string | null
          fingerprint_missing_reason?: string | null
          fingerprint_version?: number | null
          from_email?: string
          from_name?: string | null
          geocoding_error_code?: string | null
          geocoding_status?: string | null
          has_issues?: boolean | null
          id?: string
          ingestion_source?: string | null
          is_duplicate?: boolean | null
          is_update?: boolean | null
          issue_notes?: string | null
          load_content_fingerprint?: string | null
          load_id?: string | null
          marked_missed_at?: string | null
          parent_email_id?: string | null
          parsed_data?: Json | null
          parsed_load_fingerprint?: string | null
          pickup_coordinates?: Json | null
          posted_at?: string | null
          raw_payload_url?: string | null
          received_at?: string
          status?: string
          subject?: string | null
          tenant_id?: string
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
          {
            foreignKeyName: "fk_load_emails_load_content"
            columns: ["load_content_fingerprint"]
            isOneToOne: false
            referencedRelation: "load_content"
            referencedColumns: ["fingerprint"]
          },
          {
            foreignKeyName: "fk_load_emails_load_content"
            columns: ["load_content_fingerprint"]
            isOneToOne: false
            referencedRelation: "load_content_top10_7d"
            referencedColumns: ["fingerprint"]
          },
          {
            foreignKeyName: "load_emails_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "load_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_emails_parent_email_id_fkey"
            columns: ["parent_email_id"]
            isOneToOne: false
            referencedRelation: "load_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_emails_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          raw_payload_url: string | null
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
          raw_payload_url?: string | null
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
          raw_payload_url?: string | null
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "load_expenses_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
            foreignKeyName: "load_hunt_matches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
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
          {
            foreignKeyName: "load_stops_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loadboard_filters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
          type?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
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
          {
            foreignKeyName: "maintenance_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          component_name: string
          created_at?: string
          id?: string
          month_year?: string | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          component_name?: string
          created_at?: string
          id?: string
          month_year?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "map_load_tracking_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_action_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matching_heartbeats: {
        Row: {
          last_match_processed_at: string | null
          matches_processed_5m: number
          note: string | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          last_match_processed_at?: string | null
          matches_processed_5m?: number
          note?: string | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          last_match_processed_at?: string | null
          matches_processed_5m?: number
          note?: string | null
          updated_at?: string
          worker_id?: string
        }
        Relationships: []
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
      ops_alerts: {
        Row: {
          created_at: string | null
          heartbeat_age_seconds: number | null
          id: number
          lag_seconds: number | null
          note: string | null
          pending_30m: number | null
          status: string
          workers_seen_5m: number | null
        }
        Insert: {
          created_at?: string | null
          heartbeat_age_seconds?: number | null
          id?: number
          lag_seconds?: number | null
          note?: string | null
          pending_30m?: number | null
          status: string
          workers_seen_5m?: number | null
        }
        Update: {
          created_at?: string | null
          heartbeat_age_seconds?: number | null
          id?: number
          lag_seconds?: number | null
          note?: string | null
          pending_30m?: number | null
          status?: string
          workers_seen_5m?: number | null
        }
        Relationships: []
      }
      otr_invoice_submissions: {
        Row: {
          broker_mc: string
          broker_name: string | null
          created_at: string
          error_message: string | null
          id: string
          invoice_amount: number
          invoice_id: string | null
          invoice_number: string
          otr_invoice_id: string | null
          quick_pay: boolean | null
          raw_request: Json | null
          raw_response: Json | null
          status: string
          submitted_by: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          broker_mc: string
          broker_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_amount: number
          invoice_id?: string | null
          invoice_number: string
          otr_invoice_id?: string | null
          quick_pay?: boolean | null
          raw_request?: Json | null
          raw_response?: Json | null
          status?: string
          submitted_by?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          broker_mc?: string
          broker_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_amount?: number
          invoice_id?: string | null
          invoice_number?: string
          otr_invoice_id?: string | null
          quick_pay?: boolean | null
          raw_request?: Json | null
          raw_response?: Json | null
          status?: string
          submitted_by?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "otr_invoice_submissions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "otr_invoice_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pay_structures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_formulas: {
        Row: {
          add_columns: string[]
          created_at: string
          formula_name: string
          id: string
          subtract_columns: string[]
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          add_columns?: string[]
          created_at?: string
          formula_name: string
          id?: string
          subtract_columns?: string[]
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          add_columns?: string[]
          created_at?: string
          formula_name?: string
          id?: string
          subtract_columns?: string[]
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_formulas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permissions_parent_permission_id_fkey"
            columns: ["parent_permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          allowed: boolean
          created_at: string
          feature_key: string
          id: string
          limit_value: number | null
          plan_id: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          feature_key: string
          id?: string
          limit_value?: number | null
          plan_id: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          feature_key?: string
          id?: string
          limit_value?: number | null
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          stripe_price_id_base: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          stripe_price_id_base?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          stripe_price_id_base?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_email_config: {
        Row: {
          catch_all_forward_to: string | null
          created_at: string
          custom_domain: string | null
          custom_domain_status: string | null
          custom_domain_verified_at: string | null
          email_mode: string
          gmail_base_email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          catch_all_forward_to?: string | null
          created_at?: string
          custom_domain?: string | null
          custom_domain_status?: string | null
          custom_domain_verified_at?: string | null
          email_mode?: string
          gmail_base_email?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          catch_all_forward_to?: string | null
          created_at?: string
          custom_domain?: string | null
          custom_domain_status?: string | null
          custom_domain_verified_at?: string | null
          email_mode?: string
          gmail_base_email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_integrations: {
        Row: {
          config: Json | null
          config_hint: string | null
          created_at: string | null
          description: string | null
          id: string
          integration_key: string
          is_enabled: boolean | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          config?: Json | null
          config_hint?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          integration_key: string
          is_enabled?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          config?: Json | null
          config_hint?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          integration_key?: string
          is_enabled?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
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
          is_platform_admin: boolean
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
          is_platform_admin?: boolean
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
          is_platform_admin?: boolean
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
      pubsub_dedup: {
        Row: {
          created_at: string
          email_address: string
          history_id: string
          id: string
        }
        Insert: {
          created_at?: string
          email_address: string
          history_id: string
          id?: string
        }
        Update: {
          created_at?: string
          email_address?: string
          history_id?: string
          id?: string
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
      release_channel_feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          feature_flag_id: string
          id: string
          release_channel: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_flag_id: string
          id?: string
          release_channel: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_flag_id?: string
          id?: string
          release_channel?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_channel_feature_flags_feature_flag_id_fkey"
            columns: ["feature_flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
        ]
      }
      repairs_needed: {
        Row: {
          color: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          notes: string | null
          sort_order: number | null
          status: string
          tenant_id: string
          updated_at: string
          urgency: number
          vehicle_id: string
        }
        Insert: {
          color?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          notes?: string | null
          sort_order?: number | null
          status?: string
          tenant_id: string
          updated_at?: string
          urgency?: number
          vehicle_id: string
        }
        Update: {
          color?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          notes?: string | null
          sort_order?: number | null
          status?: string
          tenant_id?: string
          updated_at?: string
          urgency?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repairs_needed_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_needed_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string | null
          id: string
          permission_id: string
          role_id: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          permission_id: string
          role_id: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          permission_id?: string
          role_id?: string
          tenant_id?: string | null
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
          {
            foreignKeyName: "role_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      screen_share_sessions: {
        Row: {
          admin_ice_candidates: Json | null
          admin_offer: string | null
          admin_user_id: string | null
          client_answer: string | null
          client_ice_candidates: Json | null
          client_user_id: string | null
          connected_at: string | null
          created_at: string
          ended_at: string | null
          expires_at: string
          ice_candidates: Json | null
          id: string
          initiated_by: string
          last_heartbeat_at: string | null
          last_heartbeat_by: string | null
          session_code: string
          status: string
          tenant_id: string
        }
        Insert: {
          admin_ice_candidates?: Json | null
          admin_offer?: string | null
          admin_user_id?: string | null
          client_answer?: string | null
          client_ice_candidates?: Json | null
          client_user_id?: string | null
          connected_at?: string | null
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          ice_candidates?: Json | null
          id?: string
          initiated_by: string
          last_heartbeat_at?: string | null
          last_heartbeat_by?: string | null
          session_code: string
          status?: string
          tenant_id: string
        }
        Update: {
          admin_ice_candidates?: Json | null
          admin_offer?: string | null
          admin_user_id?: string | null
          client_answer?: string | null
          client_ice_candidates?: Json | null
          client_user_id?: string | null
          connected_at?: string | null
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          ice_candidates?: Json | null
          id?: string
          initiated_by?: string
          last_heartbeat_at?: string | null
          last_heartbeat_by?: string | null
          session_code?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "screen_share_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_loads: {
        Row: {
          driver_pay: number | null
          id: string
          load_id: string | null
          miles: number | null
          rate: number | null
          settlement_id: string | null
          tenant_id: string | null
        }
        Insert: {
          driver_pay?: number | null
          id?: string
          load_id?: string | null
          miles?: number | null
          rate?: number | null
          settlement_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          driver_pay?: number | null
          id?: string
          load_id?: string | null
          miles?: number | null
          rate?: number | null
          settlement_id?: string | null
          tenant_id?: string | null
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
          {
            foreignKeyName: "settlement_loads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
          total_deductions?: number | null
          total_loads?: number | null
          total_miles?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      spend_alerts: {
        Row: {
          alert_threshold: number
          created_at: string
          id: string
          is_active: boolean | null
          last_alerted_amount: number | null
          last_alerted_at: string | null
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          total_spent?: number | null
          updated_at?: string
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "spend_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      tenant_audit_log: {
        Row: {
          action: string
          changed_at: string | null
          changed_by: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          tenant_id: string
        }
        Insert: {
          action: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          tenant_id: string
        }
        Update: {
          action?: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          tenant_id?: string
        }
        Relationships: []
      }
      tenant_factoring_config: {
        Row: {
          created_at: string
          credentials_encrypted: string | null
          credentials_hint: string | null
          error_message: string | null
          id: string
          is_enabled: boolean
          last_checked_at: string | null
          last_submission_at: string | null
          provider: string
          settings: Json | null
          sync_status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credentials_encrypted?: string | null
          credentials_hint?: string | null
          error_message?: string | null
          id?: string
          is_enabled?: boolean
          last_checked_at?: string | null
          last_submission_at?: string | null
          provider?: string
          settings?: Json | null
          sync_status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credentials_encrypted?: string | null
          credentials_hint?: string | null
          error_message?: string | null
          id?: string
          is_enabled?: boolean
          last_checked_at?: string | null
          last_submission_at?: string | null
          provider?: string
          settings?: Json | null
          sync_status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_factoring_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_feature_access: {
        Row: {
          created_at: string
          created_by: string | null
          feature_key: string
          id: string
          is_enabled: boolean
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          feature_key: string
          id?: string
          is_enabled?: boolean
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          feature_key?: string
          id?: string
          is_enabled?: boolean
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_feature_access_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_feature_flags: {
        Row: {
          enabled: boolean
          enabled_at: string | null
          enabled_by: string | null
          enabled_for_roles: string[] | null
          feature_flag_id: string
          id: string
          notes: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          enabled: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          enabled_for_roles?: string[] | null
          feature_flag_id: string
          id?: string
          notes?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          enabled_for_roles?: string[] | null
          feature_flag_id?: string
          id?: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_feature_flags_feature_flag_id_fkey"
            columns: ["feature_flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_inbound_addresses: {
        Row: {
          created_at: string
          created_by: string | null
          email_address: string
          id: string
          is_active: boolean
          notes: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email_address: string
          id?: string
          is_active?: boolean
          notes?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email_address?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_inbound_addresses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_integrations: {
        Row: {
          created_at: string | null
          credentials_encrypted: string | null
          credentials_hint: string | null
          error_message: string | null
          id: string
          is_enabled: boolean | null
          last_checked_at: string | null
          last_sync_at: string | null
          override_config: string | null
          override_hint: string | null
          provider: string
          settings: Json | null
          sync_status: string | null
          tenant_id: string
          updated_at: string | null
          use_global: boolean | null
        }
        Insert: {
          created_at?: string | null
          credentials_encrypted?: string | null
          credentials_hint?: string | null
          error_message?: string | null
          id?: string
          is_enabled?: boolean | null
          last_checked_at?: string | null
          last_sync_at?: string | null
          override_config?: string | null
          override_hint?: string | null
          provider: string
          settings?: Json | null
          sync_status?: string | null
          tenant_id: string
          updated_at?: string | null
          use_global?: boolean | null
        }
        Update: {
          created_at?: string | null
          credentials_encrypted?: string | null
          credentials_hint?: string | null
          error_message?: string | null
          id?: string
          is_enabled?: boolean | null
          last_checked_at?: string | null
          last_sync_at?: string | null
          override_config?: string | null
          override_hint?: string | null
          provider?: string
          settings?: Json | null
          sync_status?: string | null
          tenant_id?: string
          updated_at?: string | null
          use_global?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invitations: {
        Row: {
          accepted_at: string | null
          email: string
          expires_at: string
          id: string
          invited_at: string
          invited_by: string
          role: string
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by: string
          role?: string
          tenant_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string
          role?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_preferences: {
        Row: {
          created_at: string | null
          currency: string | null
          date_format: string | null
          id: string
          notification_settings: Json | null
          tenant_id: string
          timezone: string | null
          ui_settings: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          date_format?: string | null
          id?: string
          notification_settings?: Json | null
          tenant_id: string
          timezone?: string | null
          ui_settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          date_format?: string | null
          id?: string
          notification_settings?: Json | null
          tenant_id?: string
          timezone?: string | null
          ui_settings?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_rate_limits: {
        Row: {
          created_at: string | null
          id: string
          request_count: number | null
          tenant_id: string | null
          window_start: string
          window_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          request_count?: number | null
          tenant_id?: string | null
          window_start: string
          window_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          request_count?: number | null
          tenant_id?: string | null
          window_start?: string
          window_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_rate_limits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          role: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          role?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          role?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          api_key: string | null
          api_key_hash: string | null
          carrier_address: string | null
          carrier_name: string | null
          cooldown_seconds_min: number | null
          created_at: string
          daily_usage_count: number | null
          daily_usage_reset_at: string | null
          gmail_alias: string | null
          id: string
          is_paused: boolean | null
          last_email_received_at: string | null
          logo_url: string | null
          match_notification_emails: string[] | null
          match_notification_from_email: string | null
          match_notifications_enabled: boolean | null
          max_hunt_plans: number | null
          max_users: number | null
          max_vehicles: number | null
          mc_number: string | null
          name: string
          plan_id: string | null
          primary_color: string | null
          rate_limit_per_day: number | null
          rate_limit_per_minute: number | null
          release_channel: Database["public"]["Enums"]["release_channel"]
          settings: Json | null
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          timezone: string | null
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          api_key?: string | null
          api_key_hash?: string | null
          carrier_address?: string | null
          carrier_name?: string | null
          cooldown_seconds_min?: number | null
          created_at?: string
          daily_usage_count?: number | null
          daily_usage_reset_at?: string | null
          gmail_alias?: string | null
          id?: string
          is_paused?: boolean | null
          last_email_received_at?: string | null
          logo_url?: string | null
          match_notification_emails?: string[] | null
          match_notification_from_email?: string | null
          match_notifications_enabled?: boolean | null
          max_hunt_plans?: number | null
          max_users?: number | null
          max_vehicles?: number | null
          mc_number?: string | null
          name: string
          plan_id?: string | null
          primary_color?: string | null
          rate_limit_per_day?: number | null
          rate_limit_per_minute?: number | null
          release_channel?: Database["public"]["Enums"]["release_channel"]
          settings?: Json | null
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          timezone?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          api_key?: string | null
          api_key_hash?: string | null
          carrier_address?: string | null
          carrier_name?: string | null
          cooldown_seconds_min?: number | null
          created_at?: string
          daily_usage_count?: number | null
          daily_usage_reset_at?: string | null
          gmail_alias?: string | null
          id?: string
          is_paused?: boolean | null
          last_email_received_at?: string | null
          logo_url?: string | null
          match_notification_emails?: string[] | null
          match_notification_from_email?: string | null
          match_notifications_enabled?: boolean | null
          max_hunt_plans?: number | null
          max_users?: number | null
          max_vehicles?: number | null
          mc_number?: string | null
          name?: string
          plan_id?: string | null
          primary_color?: string | null
          rate_limit_per_day?: number | null
          rate_limit_per_minute?: number | null
          release_channel?: Database["public"]["Enums"]["release_channel"]
          settings?: Json | null
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          timezone?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      ui_action_registry: {
        Row: {
          action_key: string
          action_type: string
          backend_target: string | null
          created_at: string
          description: string | null
          enabled: boolean
          feature_flag_key: string | null
          id: string
          last_verified_at: string | null
          tenant_scope: string
          ui_location: string
          updated_at: string
        }
        Insert: {
          action_key: string
          action_type: string
          backend_target?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          feature_flag_key?: string | null
          id?: string
          last_verified_at?: string | null
          tenant_scope?: string
          ui_location: string
          updated_at?: string
        }
        Update: {
          action_key?: string
          action_type?: string
          backend_target?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          feature_flag_key?: string | null
          id?: string
          last_verified_at?: string | null
          tenant_scope?: string
          ui_location?: string
          updated_at?: string
        }
        Relationships: []
      }
      unroutable_email_stats_daily: {
        Row: {
          count: number
          created_at: string
          day: string
          failure_reason: string
          id: string
          updated_at: string
        }
        Insert: {
          count?: number
          created_at?: string
          day: string
          failure_reason: string
          id?: string
          updated_at?: string
        }
        Update: {
          count?: number
          created_at?: string
          day?: string
          failure_reason?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      unroutable_emails: {
        Row: {
          cc_header: string | null
          delivered_to_header: string | null
          envelope_to_header: string | null
          extracted_alias: string | null
          extraction_source: string | null
          failure_reason: string
          from_header: string | null
          gmail_history_id: string | null
          gmail_message_id: string
          id: string
          payload_url: string | null
          raw_headers: Json | null
          received_at: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          subject: string | null
          to_header: string | null
          x_forwarded_to_header: string | null
          x_gm_original_to_header: string | null
          x_original_to_header: string | null
        }
        Insert: {
          cc_header?: string | null
          delivered_to_header?: string | null
          envelope_to_header?: string | null
          extracted_alias?: string | null
          extraction_source?: string | null
          failure_reason: string
          from_header?: string | null
          gmail_history_id?: string | null
          gmail_message_id: string
          id?: string
          payload_url?: string | null
          raw_headers?: Json | null
          received_at?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject?: string | null
          to_header?: string | null
          x_forwarded_to_header?: string | null
          x_gm_original_to_header?: string | null
          x_original_to_header?: string | null
        }
        Update: {
          cc_header?: string | null
          delivered_to_header?: string | null
          envelope_to_header?: string | null
          extracted_alias?: string | null
          extraction_source?: string | null
          failure_reason?: string
          from_header?: string | null
          gmail_history_id?: string | null
          gmail_message_id?: string
          id?: string
          payload_url?: string | null
          raw_headers?: Json | null
          received_at?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject?: string | null
          to_header?: string | null
          x_forwarded_to_header?: string | null
          x_gm_original_to_header?: string | null
          x_original_to_header?: string | null
        }
        Relationships: []
      }
      usage_meter_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          quantity: number
          source: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          quantity?: number
          source?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          quantity?: number
          source?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_meter_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          role_id: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          role_id?: string
          tenant_id?: string | null
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
          {
            foreignKeyName: "user_custom_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      vehicle_integrations: {
        Row: {
          created_at: string | null
          external_id: string
          external_name: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          metadata: Json | null
          provider: string
          tenant_id: string
          updated_at: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string | null
          external_id: string
          external_name?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          metadata?: Json | null
          provider: string
          tenant_id: string
          updated_at?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string | null
          external_id?: string
          external_name?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          metadata?: Json | null
          provider?: string
          tenant_id?: string
          updated_at?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_integrations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_location_history: {
        Row: {
          created_at: string
          formatted_location: string | null
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
          formatted_location?: string | null
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
          formatted_location?: string | null
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
          heading: number | null
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
          secondary_dispatcher_ids: string[] | null
          speed: number | null
          status: string | null
          stopped_status: string | null
          straps_count: number | null
          suspension: string | null
          team: boolean | null
          temp_control: boolean | null
          tenant_id: string
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
          heading?: number | null
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
          secondary_dispatcher_ids?: string[] | null
          speed?: number | null
          status?: string | null
          stopped_status?: string | null
          straps_count?: number | null
          suspension?: string | null
          team?: boolean | null
          temp_control?: boolean | null
          tenant_id: string
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
          heading?: number | null
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
          secondary_dispatcher_ids?: string[] | null
          speed?: number | null
          status?: string | null
          stopped_status?: string | null
          straps_count?: number | null
          suspension?: string | null
          team?: boolean | null
          temp_control?: boolean | null
          tenant_id?: string
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
          {
            foreignKeyName: "vehicles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      versionable_features: {
        Row: {
          created_at: string
          description: string | null
          feature_key: string
          feature_name: string
          id: string
          isolation_notes: string | null
          updated_at: string
          v1_files: Json
          v2_files_pattern: Json | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          feature_key: string
          feature_name: string
          id?: string
          isolation_notes?: string | null
          updated_at?: string
          v1_files?: Json
          v2_files_pattern?: Json | null
        }
        Update: {
          created_at?: string
          description?: string | null
          feature_key?: string
          feature_name?: string
          id?: string
          isolation_notes?: string | null
          updated_at?: string
          v1_files?: Json
          v2_files_pattern?: Json | null
        }
        Relationships: []
      }
      worker_config: {
        Row: {
          backoff_duration_ms: number
          backoff_on_429: boolean
          batch_size: number
          concurrent_limit: number
          enabled: boolean
          id: string
          loop_interval_ms: number
          matching_enabled: boolean
          max_retries: number
          notes: string | null
          paused: boolean
          per_request_delay_ms: number
          restart_requested_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          backoff_duration_ms?: number
          backoff_on_429?: boolean
          batch_size?: number
          concurrent_limit?: number
          enabled?: boolean
          id?: string
          loop_interval_ms?: number
          matching_enabled?: boolean
          max_retries?: number
          notes?: string | null
          paused?: boolean
          per_request_delay_ms?: number
          restart_requested_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          backoff_duration_ms?: number
          backoff_on_429?: boolean
          batch_size?: number
          concurrent_limit?: number
          enabled?: boolean
          id?: string
          loop_interval_ms?: number
          matching_enabled?: boolean
          max_retries?: number
          notes?: string | null
          paused?: boolean
          per_request_delay_ms?: number
          restart_requested_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      worker_heartbeats: {
        Row: {
          created_at: string
          current_batch_size: number | null
          emails_failed: number
          emails_sent: number
          error_message: string | null
          host_info: Json | null
          id: string
          last_heartbeat: string
          last_processed_at: string | null
          loops_completed: number
          rate_limit_until: string | null
          status: string
        }
        Insert: {
          created_at?: string
          current_batch_size?: number | null
          emails_failed?: number
          emails_sent?: number
          error_message?: string | null
          host_info?: Json | null
          id: string
          last_heartbeat?: string
          last_processed_at?: string | null
          loops_completed?: number
          rate_limit_until?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          current_batch_size?: number | null
          emails_failed?: number
          emails_sent?: number
          error_message?: string | null
          host_info?: Json | null
          id?: string
          last_heartbeat?: string
          last_processed_at?: string | null
          loops_completed?: number
          rate_limit_until?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      content_dedup_metrics: {
        Row: {
          dedup_savings_percent: number | null
          duplicate_receipts_saved: number | null
          reused_content: number | null
          total_content_rows: number | null
          total_receipts: number | null
        }
        Relationships: []
      }
      load_content_metrics_24h: {
        Row: {
          coverage_rate_24h: number | null
          eligible_1h: number | null
          eligible_receipts_24h: number | null
          eligible_with_fk_24h: number | null
          missing_fk_1h: number | null
          missing_fk_24h: number | null
          missing_parsed_fp_1h: number | null
          receipts_24h: number | null
          reuse_rate_24h: number | null
          unique_content_24h: number | null
        }
        Relationships: []
      }
      load_content_provider_breakdown_24h: {
        Row: {
          coverage_rate: number | null
          eligible: number | null
          eligible_with_fk: number | null
          provider: string | null
          receipts: number | null
          reuse_rate: number | null
          unique_content: number | null
        }
        Relationships: []
      }
      load_content_top10_7d: {
        Row: {
          fingerprint: string | null
          first_seen_at: string | null
          last_seen_at: string | null
          provider: string | null
          receipt_count: number | null
        }
        Relationships: []
      }
      load_dedup_metrics: {
        Row: {
          dedup_eligible_count: number | null
          duplicate_rate: number | null
          duplicates_detected: number | null
          fk_coverage_rate: number | null
          total_emails: number | null
          with_content_fk: number | null
        }
        Relationships: []
      }
      ops_gmail_stubs_health: {
        Row: {
          completed_30m: number | null
          dead_letter_30m: number | null
          newest_pending_created_at: string | null
          oldest_pending_created_at: string | null
          oldest_pending_lag_seconds: number | null
          pending_30m: number | null
          processing_30m: number | null
          skipped_30m: number | null
          ts: string | null
        }
        Relationships: []
      }
      ops_matching_health: {
        Row: {
          matches_processed_5m_total: number | null
          newest_match_age_seconds: number | null
          newest_update_age_seconds: number | null
          newest_worker_update_at: string | null
          oldest_worker_update_at: string | null
          ts: string | null
          workers_reporting_5m: number | null
        }
        Relationships: []
      }
      ops_pipeline_health: {
        Row: {
          completed_30m: number | null
          dead_letter_30m: number | null
          matches_processed_5m_total: number | null
          matching_newest_match_age_seconds: number | null
          matching_newest_update_age_seconds: number | null
          matching_workers_reporting_5m: number | null
          newest_heartbeat_age_seconds: number | null
          newest_heartbeat_at: string | null
          newest_pending_created_at: string | null
          oldest_heartbeat_age_seconds: number | null
          oldest_heartbeat_at: string | null
          oldest_pending_created_at: string | null
          oldest_pending_lag_seconds: number | null
          overall_status: string | null
          pending_30m: number | null
          processing_30m: number | null
          skipped_30m: number | null
          ts: string | null
          workers_seen_5m: number | null
        }
        Relationships: []
      }
      ops_workers_health: {
        Row: {
          newest_heartbeat_age_seconds: number | null
          newest_heartbeat_at: string | null
          oldest_heartbeat_age_seconds: number | null
          oldest_heartbeat_at: string | null
          ts: string | null
          workers_seen_5m: number | null
        }
        Relationships: []
      }
      unreviewed_matches: {
        Row: {
          bid_at: string | null
          bid_by: string | null
          bid_rate: number | null
          booked_load_id: string | null
          created_at: string | null
          distance_miles: number | null
          from_email: string | null
          hunt_plan_id: string | null
          hunt_vehicle_id: string | null
          id: string | null
          is_active: boolean | null
          load_email_id: string | null
          match_score: number | null
          match_status: string | null
          matched_at: string | null
          parsed_data: Json | null
          plan_name: string | null
          received_at: string | null
          subject: string | null
          tenant_id: string | null
          updated_at: string | null
          vehicle_id: string | null
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
            foreignKeyName: "load_hunt_matches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      worker_health_status: {
        Row: {
          connection_status: string | null
          current_batch_size: number | null
          emails_failed: number | null
          emails_sent: number | null
          error_message: string | null
          last_heartbeat: string | null
          loops_completed: number | null
          rate_limit_until: string | null
          seconds_since_heartbeat: number | null
          status: string | null
          worker_id: string | null
        }
        Insert: {
          connection_status?: never
          current_batch_size?: number | null
          emails_failed?: number | null
          emails_sent?: number | null
          error_message?: string | null
          last_heartbeat?: string | null
          loops_completed?: number | null
          rate_limit_until?: string | null
          seconds_since_heartbeat?: never
          status?: string | null
          worker_id?: string | null
        }
        Update: {
          connection_status?: never
          current_batch_size?: number | null
          emails_failed?: number | null
          emails_sent?: number | null
          error_message?: string | null
          last_heartbeat?: string | null
          loops_completed?: number | null
          rate_limit_until?: string | null
          seconds_since_heartbeat?: never
          status?: string | null
          worker_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_tenant_invitation: { Args: { p_token: string }; Returns: Json }
      archive_old_load_emails: { Args: never; Returns: number }
      archive_old_load_emails_batched: {
        Args: { batch_size?: number }
        Returns: number
      }
      auto_archive_rejected_applications: { Args: never; Returns: undefined }
      batch_update_tenant_last_email: { Args: never; Returns: number }
      can_access_feature: {
        Args: { p_feature_key: string; p_tenant_id: string; p_user_id: string }
        Returns: boolean
      }
      can_access_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_roles: { Args: { _user_id: string }; Returns: boolean }
      check_circuit_breaker: { Args: { p_queue_limit?: number }; Returns: Json }
      check_circuit_breaker_depth: { Args: { p_limit?: number }; Returns: Json }
      check_circuit_breaker_stall: { Args: never; Returns: Json }
      check_pipeline_alerts: { Args: never; Returns: undefined }
      check_plan_feature_access: {
        Args: { p_feature_key: string; p_tenant_id: string }
        Returns: Json
      }
      check_tenant_rate_limit:
        | {
            Args: {
              p_limit_per_day?: number
              p_limit_per_minute?: number
              p_tenant_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_dry_run?: boolean
              p_limit_per_day?: number
              p_limit_per_minute?: number
              p_tenant_id: string
            }
            Returns: Json
          }
      claim_email_queue_batch: {
        Args: { p_batch_size?: number }
        Returns: {
          attempts: number
          body_html: string
          body_text: string
          from_email: string
          from_name: string
          gmail_history_id: string
          gmail_message_id: string
          id: string
          payload_url: string
          queued_at: string
          subject: string
          tenant_id: string
          to_email: string
        }[]
      }
      claim_gmail_history_batch: {
        Args: { p_batch_size?: number }
        Returns: {
          email_address: string
          history_id: string
          id: string
          queued_at: string
        }[]
      }
      claim_gmail_stubs_batch: {
        Args: { p_batch_size?: number }
        Returns: {
          attempts: number
          claimed_at: string | null
          created_at: string
          email_address: string
          error: string | null
          history_id: string
          id: string
          processed_at: string | null
          queued_at: string
          source: string | null
          status: string
          tenant_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "gmail_stubs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_inbound_email_queue_batch: {
        Args: { p_batch_size?: number }
        Returns: {
          attempts: number
          body_html: string | null
          body_text: string | null
          content_id: string | null
          dedupe_key: string | null
          delivered_to_header: string | null
          extracted_alias: string | null
          from_email: string | null
          from_name: string | null
          gmail_history_id: string | null
          gmail_message_id: string
          id: string
          last_error: string | null
          parsed_at: string | null
          payload_url: string | null
          processed_at: string | null
          processing_started_at: string | null
          queued_at: string
          receipt_id: string | null
          routing_method: string | null
          status: string
          storage_bucket: string | null
          storage_path: string | null
          subject: string | null
          tenant_id: string | null
          to_email: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "email_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_email_queue: { Args: never; Returns: number }
      cleanup_gmail_stubs_old: { Args: never; Returns: number }
      cleanup_old_load_email_bodies: { Args: never; Returns: undefined }
      cleanup_old_matches: { Args: never; Returns: undefined }
      cleanup_pubsub_tracking: { Args: never; Returns: number }
      cleanup_tenant_rate_limits: { Args: never; Returns: number }
      cleanup_unroutable_emails: { Args: never; Returns: number }
      cleanup_vehicle_location_history: { Args: never; Returns: number }
      complete_email_queue_item: {
        Args: { p_id: string; p_status?: string }
        Returns: undefined
      }
      complete_gmail_history_item: {
        Args: { p_id: string }
        Returns: undefined
      }
      complete_gmail_stub: { Args: { p_id: string }; Returns: undefined }
      ensure_load_id: { Args: { p_email_id: string }; Returns: string }
      fail_email_queue_item: {
        Args: { p_attempts: number; p_error: string; p_id: string }
        Returns: undefined
      }
      fail_gmail_history_item: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      fail_gmail_stub: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      generate_load_id_for_date: {
        Args: { target_date: string }
        Returns: string
      }
      get_current_tenant_id: { Args: never; Returns: string }
      get_dedup_cost_metrics: {
        Args: { p_window_minutes: number }
        Returns: Json
      }
      get_default_tenant_id: { Args: never; Returns: string }
      get_email_queue_pending_count: { Args: never; Returns: number }
      get_gmail_stubs_health: { Args: never; Returns: Json }
      get_multi_match_fingerprints: {
        Args: never
        Returns: {
          first_received: string
          hunt_plan_id: string
          last_received: string
          load_content_fingerprint: string
          match_count: number
        }[]
      }
      get_storage_tenant_id: { Args: never; Returns: string }
      get_tenant_integrations_safe: {
        Args: { p_tenant_id: string }
        Returns: {
          credentials_hint: string
          error_message: string
          id: string
          is_configured: boolean
          is_enabled: boolean
          last_checked_at: string
          last_sync_at: string
          provider: string
          settings: Json
          sync_status: string
          tenant_id: string
        }[]
      }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      get_worker_config: {
        Args: never
        Returns: {
          backoff_duration_ms: number
          backoff_on_429: boolean
          batch_size: number
          concurrent_limit: number
          enabled: boolean
          loop_interval_ms: number
          max_retries: number
          paused: boolean
          per_request_delay_ms: number
          restart_requested_at: string
        }[]
      }
      handle_gmail_stub: {
        Args: {
          p_email_address: string
          p_history_id: string
          p_queue_limit?: number
        }
        Returns: Json
      }
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
      has_tenant_role: {
        Args: { _role: string; _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      increment_tenant_rate_count: {
        Args: { p_count?: number; p_tenant_id: string }
        Returns: Json
      }
      is_email_invited: { Args: { check_email: string }; Returns: boolean }
      is_feature_enabled: {
        Args: { _feature_key: string; _tenant_id: string; _user_role?: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_user_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      match_customer_by_broker_name: {
        Args: { p_broker_name: string; p_tenant_id: string }
        Returns: {
          alias_names: string[]
          id: string
          mc_number: string
          name: string
          otr_approval_status: string
        }[]
      }
      next_invoice_number: { Args: { p_tenant_id: string }; Returns: string }
      reset_stale_email_queue: { Args: never; Returns: number }
      resolve_integration_config: {
        Args: { p_integration_key: string; p_tenant_id: string }
        Returns: Json
      }
      screenshare_append_ice: {
        Args: { p_candidate: Json; p_role: string; p_session_id: string }
        Returns: Json
      }
      screenshare_claim_session: {
        Args: { p_session_code: string }
        Returns: Json
      }
      should_trigger_hunt_for_fingerprint: {
        Args: {
          p_cooldown_seconds?: number
          p_fingerprint: string
          p_hunt_plan_id: string
          p_last_load_email_id?: string
          p_received_at: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      upsert_load_content: {
        Args: {
          p_canonical_payload: Json
          p_fingerprint: string
          p_fingerprint_version?: number
          p_provider?: string
          p_size_bytes?: number
        }
        Returns: Json
      }
      validate_driver_invite_storage_path: {
        Args: { p_invite_id: string; p_tenant_id: string }
        Returns: boolean
      }
      worker_heartbeat: {
        Args: {
          p_current_batch_size?: number
          p_emails_failed?: number
          p_emails_sent?: number
          p_error_message?: string
          p_host_info?: Json
          p_last_processed_at?: string
          p_loops_completed?: number
          p_rate_limit_until?: string
          p_status?: string
          p_worker_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user" | "dispatcher" | "driver"
      email_source: "sylectus" | "fullcircle" | "123loadboard" | "truckstop"
      release_channel: "internal" | "pilot" | "general"
      tenant_status: "active" | "suspended" | "trial" | "churned"
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
      release_channel: ["internal", "pilot", "general"],
      tenant_status: ["active", "suspended", "trial", "churned"],
    },
  },
} as const
