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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_notifications: {
        Row: {
          body: string | null
          booking_id: string | null
          created_at: string
          id: string
          read: boolean
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          booking_id?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          booking_id?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      booking_holds: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          plan_id: string
          start_date: string
          start_hour: number
          user_id: string
          vehicle_id: string | null
          vehicle_plate: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          plan_id: string
          start_date: string
          start_hour: number
          user_id: string
          vehicle_id?: string | null
          vehicle_plate?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          plan_id?: string
          start_date?: string
          start_hour?: number
          user_id?: string
          vehicle_id?: string | null
          vehicle_plate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_holds_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          addons: Json
          addons_total_cents: number
          ai_end_fuel_percent: number | null
          ai_end_km: number | null
          ai_start_fuel_percent: number | null
          ai_start_km: number | null
          created_at: string
          deposit: number
          deposit_deducted_cents: number | null
          deposit_refund_id: string | null
          deposit_released_at: string | null
          deposit_released_by: string | null
          deposit_status: string
          end_km: number | null
          extra_charge_cents: number | null
          extra_charge_intent_id: string | null
          extra_charge_status: string | null
          extra_km: number | null
          extra_km_charge_cents: number | null
          free_km: number
          id: string
          km_price_cents: number
          pickup_code: string
          plan_id: string
          plan_label: string
          plan_price: number
          remarks: string | null
          reminder_24h_sent_at: string | null
          reminder_30min_sent_at: string | null
          return_code: string | null
          start_date: string
          start_hour: number
          start_km: number | null
          status: string
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_method_id: string | null
          tank_level_end: string | null
          tank_level_start: string | null
          updated_at: string
          user_id: string
          vehicle_name: string
          vehicle_plate: string
        }
        Insert: {
          addons?: Json
          addons_total_cents?: number
          ai_end_fuel_percent?: number | null
          ai_end_km?: number | null
          ai_start_fuel_percent?: number | null
          ai_start_km?: number | null
          created_at?: string
          deposit?: number
          deposit_deducted_cents?: number | null
          deposit_refund_id?: string | null
          deposit_released_at?: string | null
          deposit_released_by?: string | null
          deposit_status?: string
          end_km?: number | null
          extra_charge_cents?: number | null
          extra_charge_intent_id?: string | null
          extra_charge_status?: string | null
          extra_km?: number | null
          extra_km_charge_cents?: number | null
          free_km?: number
          id?: string
          km_price_cents?: number
          pickup_code: string
          plan_id: string
          plan_label: string
          plan_price?: number
          remarks?: string | null
          reminder_24h_sent_at?: string | null
          reminder_30min_sent_at?: string | null
          return_code?: string | null
          start_date: string
          start_hour: number
          start_km?: number | null
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          tank_level_end?: string | null
          tank_level_start?: string | null
          updated_at?: string
          user_id: string
          vehicle_name?: string
          vehicle_plate?: string
        }
        Update: {
          addons?: Json
          addons_total_cents?: number
          ai_end_fuel_percent?: number | null
          ai_end_km?: number | null
          ai_start_fuel_percent?: number | null
          ai_start_km?: number | null
          created_at?: string
          deposit?: number
          deposit_deducted_cents?: number | null
          deposit_refund_id?: string | null
          deposit_released_at?: string | null
          deposit_released_by?: string | null
          deposit_status?: string
          end_km?: number | null
          extra_charge_cents?: number | null
          extra_charge_intent_id?: string | null
          extra_charge_status?: string | null
          extra_km?: number | null
          extra_km_charge_cents?: number | null
          free_km?: number
          id?: string
          km_price_cents?: number
          pickup_code?: string
          plan_id?: string
          plan_label?: string
          plan_price?: number
          remarks?: string | null
          reminder_24h_sent_at?: string | null
          reminder_30min_sent_at?: string | null
          return_code?: string | null
          start_date?: string
          start_hour?: number
          start_km?: number | null
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          tank_level_end?: string | null
          tank_level_start?: string | null
          updated_at?: string
          user_id?: string
          vehicle_name?: string
          vehicle_plate?: string
        }
        Relationships: []
      }
      gps_tracks: {
        Row: {
          booking_id: string
          id: string
          latitude: number
          longitude: number
          recorded_at: string
        }
        Insert: {
          booking_id: string
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string
        }
        Update: {
          booking_id?: string
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_tracks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string
          company_name: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          vat_id: string | null
        }
        Insert: {
          account_type?: string
          company_name?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          vat_id?: string | null
        }
        Update: {
          account_type?: string
          company_name?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          vat_id?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trip_photos: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          photo_type: string
          photo_url: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          photo_type: string
          photo_url: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          photo_type?: string
          photo_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_photos_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_documents: {
        Row: {
          ai_document_class: string | null
          ai_extracted_name: string | null
          ai_reason: string | null
          ai_verified: boolean
          created_at: string
          deleted_by_user_at: string | null
          doc_type: string
          id: string
          photo_url: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          ai_document_class?: string | null
          ai_extracted_name?: string | null
          ai_reason?: string | null
          ai_verified?: boolean
          created_at?: string
          deleted_by_user_at?: string | null
          doc_type: string
          id?: string
          photo_url: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          ai_document_class?: string | null
          ai_extracted_name?: string | null
          ai_reason?: string | null
          ai_verified?: boolean
          created_at?: string
          deleted_by_user_at?: string | null
          doc_type?: string
          id?: string
          photo_url?: string
          user_id?: string
          verified_at?: string | null
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
      vehicle_blocks: {
        Row: {
          created_at: string
          end_at: string
          id: string
          reason: string | null
          start_at: string
          updated_at: string
          vehicle_id: string | null
          vehicle_plate: string
        }
        Insert: {
          created_at?: string
          end_at: string
          id?: string
          reason?: string | null
          start_at: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate: string
        }
        Update: {
          created_at?: string
          end_at?: string
          id?: string
          reason?: string | null
          start_at?: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_blocks_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          axles: number | null
          body_type: string | null
          brand: string | null
          color: string | null
          created_at: string
          displacement_ccm: number | null
          empty_weight_kg: number | null
          first_registration: string | null
          fuel_type: string | null
          hsn: string | null
          id: string
          is_active: boolean
          manufacturer: string | null
          max_weight_kg: number | null
          model: string | null
          name: string
          notes: string | null
          owner_name: string | null
          payload_kg: number | null
          photo_urls: string[]
          plate: string
          power_kw: number | null
          registration_doc_url: string | null
          seats: number | null
          tire_size: string | null
          trailer_load_braked_kg: number | null
          trailer_load_unbraked_kg: number | null
          tsn: string | null
          type_variant_version: string | null
          updated_at: string
          vehicle_class: string | null
          vin: string | null
        }
        Insert: {
          axles?: number | null
          body_type?: string | null
          brand?: string | null
          color?: string | null
          created_at?: string
          displacement_ccm?: number | null
          empty_weight_kg?: number | null
          first_registration?: string | null
          fuel_type?: string | null
          hsn?: string | null
          id?: string
          is_active?: boolean
          manufacturer?: string | null
          max_weight_kg?: number | null
          model?: string | null
          name?: string
          notes?: string | null
          owner_name?: string | null
          payload_kg?: number | null
          photo_urls?: string[]
          plate?: string
          power_kw?: number | null
          registration_doc_url?: string | null
          seats?: number | null
          tire_size?: string | null
          trailer_load_braked_kg?: number | null
          trailer_load_unbraked_kg?: number | null
          tsn?: string | null
          type_variant_version?: string | null
          updated_at?: string
          vehicle_class?: string | null
          vin?: string | null
        }
        Update: {
          axles?: number | null
          body_type?: string | null
          brand?: string | null
          color?: string | null
          created_at?: string
          displacement_ccm?: number | null
          empty_weight_kg?: number | null
          first_registration?: string | null
          fuel_type?: string | null
          hsn?: string | null
          id?: string
          is_active?: boolean
          manufacturer?: string | null
          max_weight_kg?: number | null
          model?: string | null
          name?: string
          notes?: string | null
          owner_name?: string | null
          payload_kg?: number | null
          photo_urls?: string[]
          plate?: string
          power_kw?: number | null
          registration_doc_url?: string | null
          seats?: number | null
          tire_size?: string | null
          trailer_load_braked_kg?: number | null
          trailer_load_unbraked_kg?: number | null
          tsn?: string | null
          type_variant_version?: string | null
          updated_at?: string
          vehicle_class?: string | null
          vin?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bookings_locked_fields_unchanged: {
        Args: {
          _addons: Json
          _addons_total_cents: number
          _deposit: number
          _deposit_deducted_cents: number
          _deposit_refund_id: string
          _deposit_released_at: string
          _deposit_released_by: string
          _deposit_status: string
          _extra_charge_cents: number
          _extra_charge_intent_id: string
          _extra_charge_status: string
          _free_km: number
          _id: string
          _km_price_cents: number
          _plan_price: number
          _stripe_customer_id: string
          _stripe_payment_intent_id: string
          _stripe_payment_method_id: string
          _user_id: string
        }
        Returns: boolean
      }
      delete_expired_booking_holds: { Args: never; Returns: undefined }
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
