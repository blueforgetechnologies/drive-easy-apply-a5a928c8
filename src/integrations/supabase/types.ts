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
      carriers: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string | null
          dot_number: string | null
          email: string | null
          id: string
          mc_number: string | null
          name: string
          phone: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string | null
          dot_number?: string | null
          email?: string | null
          id?: string
          mc_number?: string | null
          name: string
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string | null
          dot_number?: string | null
          email?: string | null
          id?: string
          mc_number?: string | null
          name?: string
          phone?: string | null
          status?: string | null
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
          email: string | null
          id: string
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
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
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
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
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      dispatchers: {
        Row: {
          created_at: string | null
          email: string
          first_name: string
          hire_date: string | null
          id: string
          last_name: string
          notes: string | null
          phone: string | null
          status: string | null
          termination_date: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          first_name: string
          hire_date?: string | null
          id?: string
          last_name: string
          notes?: string | null
          phone?: string | null
          status?: string | null
          termination_date?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          first_name?: string
          hire_date?: string | null
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          status?: string | null
          termination_date?: string | null
          updated_at?: string | null
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
          amount_paid: number | null
          balance_due: number | null
          created_at: string | null
          customer_address: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          due_date: string | null
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
          amount_paid?: number | null
          balance_due?: number | null
          created_at?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          due_date?: string | null
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
          amount_paid?: number | null
          balance_due?: number | null
          created_at?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          due_date?: string | null
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
      loads: {
        Row: {
          accessorial_charges: number | null
          actual_delivery_date: string | null
          actual_miles: number | null
          actual_pickup_date: string | null
          assigned_dispatcher_id: string | null
          assigned_driver_id: string | null
          assigned_vehicle_id: string | null
          bol_number: string | null
          broker_contact: string | null
          broker_email: string | null
          broker_fee: number | null
          broker_name: string | null
          broker_phone: string | null
          cancelled_at: string | null
          cargo_description: string | null
          cargo_pieces: number | null
          cargo_weight: number | null
          carrier_id: string | null
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
          estimated_miles: number | null
          eta: string | null
          fuel_surcharge: number | null
          id: string
          last_updated_location: string | null
          load_number: string
          load_type: string | null
          notes: string | null
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
          reference_number: string | null
          route_notes: string | null
          special_instructions: string | null
          status: string | null
          total_cost: number | null
          total_revenue: number | null
          updated_at: string | null
        }
        Insert: {
          accessorial_charges?: number | null
          actual_delivery_date?: string | null
          actual_miles?: number | null
          actual_pickup_date?: string | null
          assigned_dispatcher_id?: string | null
          assigned_driver_id?: string | null
          assigned_vehicle_id?: string | null
          bol_number?: string | null
          broker_contact?: string | null
          broker_email?: string | null
          broker_fee?: number | null
          broker_name?: string | null
          broker_phone?: string | null
          cancelled_at?: string | null
          cargo_description?: string | null
          cargo_pieces?: number | null
          cargo_weight?: number | null
          carrier_id?: string | null
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
          estimated_miles?: number | null
          eta?: string | null
          fuel_surcharge?: number | null
          id?: string
          last_updated_location?: string | null
          load_number: string
          load_type?: string | null
          notes?: string | null
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
          reference_number?: string | null
          route_notes?: string | null
          special_instructions?: string | null
          status?: string | null
          total_cost?: number | null
          total_revenue?: number | null
          updated_at?: string | null
        }
        Update: {
          accessorial_charges?: number | null
          actual_delivery_date?: string | null
          actual_miles?: number | null
          actual_pickup_date?: string | null
          assigned_dispatcher_id?: string | null
          assigned_driver_id?: string | null
          assigned_vehicle_id?: string | null
          bol_number?: string | null
          broker_contact?: string | null
          broker_email?: string | null
          broker_fee?: number | null
          broker_name?: string | null
          broker_phone?: string | null
          cancelled_at?: string | null
          cargo_description?: string | null
          cargo_pieces?: number | null
          cargo_weight?: number | null
          carrier_id?: string | null
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
          estimated_miles?: number | null
          eta?: string | null
          fuel_surcharge?: number | null
          id?: string
          last_updated_location?: string | null
          load_number?: string
          load_type?: string | null
          notes?: string | null
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
          reference_number?: string | null
          route_notes?: string | null
          special_instructions?: string | null
          status?: string | null
          total_cost?: number | null
          total_revenue?: number | null
          updated_at?: string | null
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
          approved_at: string | null
          approved_by: string | null
          base_rate: number | null
          created_at: string | null
          driver_id: string | null
          equipment_lease: number | null
          fuel_advance: number | null
          gross_pay: number | null
          id: string
          insurance_deduction: number | null
          maintenance_deduction: number | null
          net_pay: number | null
          notes: string | null
          other_deductions: number | null
          payee_id: string | null
          payment_date: string | null
          payment_method: string | null
          payment_reference: string | null
          period_end: string | null
          period_start: string | null
          settlement_number: string
          status: string | null
          total_deductions: number | null
          total_loads: number | null
          total_miles: number | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          base_rate?: number | null
          created_at?: string | null
          driver_id?: string | null
          equipment_lease?: number | null
          fuel_advance?: number | null
          gross_pay?: number | null
          id?: string
          insurance_deduction?: number | null
          maintenance_deduction?: number | null
          net_pay?: number | null
          notes?: string | null
          other_deductions?: number | null
          payee_id?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          period_end?: string | null
          period_start?: string | null
          settlement_number: string
          status?: string | null
          total_deductions?: number | null
          total_loads?: number | null
          total_miles?: number | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          base_rate?: number | null
          created_at?: string | null
          driver_id?: string | null
          equipment_lease?: number | null
          fuel_advance?: number | null
          gross_pay?: number | null
          id?: string
          insurance_deduction?: number | null
          maintenance_deduction?: number | null
          net_pay?: number | null
          notes?: string | null
          other_deductions?: number | null
          payee_id?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          period_end?: string | null
          period_start?: string | null
          settlement_number?: string
          status?: string | null
          total_deductions?: number | null
          total_loads?: number | null
          total_miles?: number | null
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
          cargo_coverage_exp_date: string | null
          cargo_coverage_status: string | null
          carrier: string | null
          clearance: number | null
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
          fuel_per_gallon: number | null
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
          next_service_date: string | null
          notes: string | null
          odometer: number | null
          oil_change_due: number | null
          oil_change_remaining: number | null
          pallet_jack: boolean | null
          pallet_jack_capacity: number | null
          panic_button: boolean | null
          payee: string | null
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
          updated_at: string | null
          vehicle_number: string | null
          vertical_etrack_rows: number | null
          vin: string | null
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
          cargo_coverage_exp_date?: string | null
          cargo_coverage_status?: string | null
          carrier?: string | null
          clearance?: number | null
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
          fuel_per_gallon?: number | null
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
          next_service_date?: string | null
          notes?: string | null
          odometer?: number | null
          oil_change_due?: number | null
          oil_change_remaining?: number | null
          pallet_jack?: boolean | null
          pallet_jack_capacity?: number | null
          panic_button?: boolean | null
          payee?: string | null
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
          updated_at?: string | null
          vehicle_number?: string | null
          vertical_etrack_rows?: number | null
          vin?: string | null
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
          cargo_coverage_exp_date?: string | null
          cargo_coverage_status?: string | null
          carrier?: string | null
          clearance?: number | null
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
          fuel_per_gallon?: number | null
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
          next_service_date?: string | null
          notes?: string | null
          odometer?: number | null
          oil_change_due?: number | null
          oil_change_remaining?: number | null
          pallet_jack?: boolean | null
          pallet_jack_capacity?: number | null
          panic_button?: boolean | null
          payee?: string | null
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
          updated_at?: string | null
          vehicle_number?: string | null
          vertical_etrack_rows?: number | null
          vin?: string | null
          year?: number | null
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
