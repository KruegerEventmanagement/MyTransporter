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
      account_deletions: {
        Row: {
          account_created_at: string | null
          attempts: number
          booking_count: number | null
          completed_at: string | null
          created_at: string
          former_user_id: string
          id: string
          last_error: string | null
          locked_until: string | null
          request_reason: string | null
          requested_at: string
          status: string
          updated_at: string
        }
        Insert: {
          account_created_at?: string | null
          attempts?: number
          booking_count?: number | null
          completed_at?: string | null
          created_at?: string
          former_user_id: string
          id?: string
          last_error?: string | null
          locked_until?: string | null
          request_reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_created_at?: string | null
          attempts?: number
          booking_count?: number | null
          completed_at?: string | null
          created_at?: string
          former_user_id?: string
          id?: string
          last_error?: string | null
          locked_until?: string | null
          request_reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      birthday_campaigns: {
        Row: {
          birthday_on: string
          coupon_code: string
          created_at: string
          discount_cents: number | null
          discount_percent: number
          email_error: string | null
          email_status: string
          id: string
          redeemed_at: string | null
          redeemed_booking_id: string | null
          sent_at: string | null
          updated_at: string
          user_id: string
          valid_from: string
          valid_until: string
          year: number
        }
        Insert: {
          birthday_on: string
          coupon_code: string
          created_at?: string
          discount_cents?: number | null
          discount_percent?: number
          email_error?: string | null
          email_status?: string
          id?: string
          redeemed_at?: string | null
          redeemed_booking_id?: string | null
          sent_at?: string | null
          updated_at?: string
          user_id: string
          valid_from: string
          valid_until: string
          year: number
        }
        Update: {
          birthday_on?: string
          coupon_code?: string
          created_at?: string
          discount_cents?: number | null
          discount_percent?: number
          email_error?: string | null
          email_status?: string
          id?: string
          redeemed_at?: string | null
          redeemed_booking_id?: string | null
          sent_at?: string | null
          updated_at?: string
          user_id?: string
          valid_from?: string
          valid_until?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "birthday_campaigns_redeemed_booking_id_fkey"
            columns: ["redeemed_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_actions: {
        Row: {
          action_key: string
          attempts: number
          booking_id: string
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          next_retry_at: string | null
          status: string
          succeeded_at: string | null
          updated_at: string
        }
        Insert: {
          action_key: string
          attempts?: number
          booking_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_retry_at?: string | null
          status?: string
          succeeded_at?: string | null
          updated_at?: string
        }
        Update: {
          action_key?: string
          attempts?: number
          booking_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_retry_at?: string | null
          status?: string
          succeeded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_actions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
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
          coupon_code: string | null
          created_at: string
          deposit: number
          deposit_deducted_cents: number | null
          deposit_refund_id: string | null
          deposit_released_at: string | null
          deposit_released_by: string | null
          deposit_status: string
          discount_cents: number
          end_km: number | null
          end_km_manual: boolean | null
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
          return_exceptions: Json | null
          return_reminder_10min_for: string | null
          return_reported_at: string | null
          return_review_reason: string | null
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
          coupon_code?: string | null
          created_at?: string
          deposit?: number
          deposit_deducted_cents?: number | null
          deposit_refund_id?: string | null
          deposit_released_at?: string | null
          deposit_released_by?: string | null
          deposit_status?: string
          discount_cents?: number
          end_km?: number | null
          end_km_manual?: boolean | null
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
          return_exceptions?: Json | null
          return_reminder_10min_for?: string | null
          return_reported_at?: string | null
          return_review_reason?: string | null
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
          coupon_code?: string | null
          created_at?: string
          deposit?: number
          deposit_deducted_cents?: number | null
          deposit_refund_id?: string | null
          deposit_released_at?: string | null
          deposit_released_by?: string | null
          deposit_status?: string
          discount_cents?: number
          end_km?: number | null
          end_km_manual?: boolean | null
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
          return_exceptions?: Json | null
          return_reminder_10min_for?: string | null
          return_reported_at?: string | null
          return_review_reason?: string | null
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
      calendar_sync_jobs: {
        Row: {
          attempts: number
          content_hash: string
          created_at: string
          event_kind: string
          google_event_id: string | null
          id: string
          last_error: string | null
          lease_token: string | null
          lease_until: string | null
          next_retry_at: string | null
          payload: Json
          source_id: string
          source_type: string
          status: string
          succeeded_at: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          content_hash: string
          created_at?: string
          event_kind: string
          google_event_id?: string | null
          id?: string
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          next_retry_at?: string | null
          payload: Json
          source_id: string
          source_type: string
          status?: string
          succeeded_at?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          content_hash?: string
          created_at?: string
          event_kind?: string
          google_event_id?: string | null
          id?: string
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          next_retry_at?: string | null
          payload?: Json
          source_id?: string
          source_type?: string
          status?: string
          succeeded_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      calendar_sync_state: {
        Row: {
          adopted: boolean
          attempts: number
          created_at: string
          google_event_id: string | null
          last_action: string | null
          last_error: string | null
          lease_token: string | null
          lease_until: string | null
          lease_version: number | null
          next_retry_at: string | null
          source_id: string
          source_type: string
          status: string
          synced_at: string | null
          synced_version: number
          updated_at: string
          version: number
        }
        Insert: {
          adopted?: boolean
          attempts?: number
          created_at?: string
          google_event_id?: string | null
          last_action?: string | null
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          lease_version?: number | null
          next_retry_at?: string | null
          source_id: string
          source_type: string
          status?: string
          synced_at?: string | null
          synced_version?: number
          updated_at?: string
          version?: number
        }
        Update: {
          adopted?: boolean
          attempts?: number
          created_at?: string
          google_event_id?: string | null
          last_action?: string | null
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          lease_version?: number | null
          next_retry_at?: string | null
          source_id?: string
          source_type?: string
          status?: string
          synced_at?: string | null
          synced_version?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      document_archive: {
        Row: {
          archived_at: string
          created_at: string
          doc_type: string
          id: string
          legal_hold_reason: string | null
          legal_hold_until: string | null
          purged_at: string | null
          retention_reason: string
          retention_until: string
          source_document_id: string
          storage_path: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string
          created_at?: string
          doc_type: string
          id?: string
          legal_hold_reason?: string | null
          legal_hold_until?: string | null
          purged_at?: string | null
          retention_reason: string
          retention_until: string
          source_document_id: string
          storage_path?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string
          created_at?: string
          doc_type?: string
          id?: string
          legal_hold_reason?: string | null
          legal_hold_until?: string | null
          purged_at?: string | null
          retention_reason?: string
          retention_until?: string
          source_document_id?: string
          storage_path?: string | null
          user_id?: string
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
      issued_documents: {
        Row: {
          billing_address: Json | null
          booking_id: string | null
          content_hash: string
          created_at: string
          created_by: string | null
          customer_company: string | null
          customer_email: string | null
          customer_name: string | null
          document_date: string
          document_number: string
          gross_cents: number
          id: string
          items: Json
          kind: string
          net_cents: number
          non_taxable_cents: number
          payment_status: string | null
          pdf_filename: string
          pdf_path: string
          pdf_size_bytes: number | null
          revision: number
          snapshot: Json
          source: string
          total_cents: number
          user_id: string | null
          vat_cents: number
          vat_rate: number
        }
        Insert: {
          billing_address?: Json | null
          booking_id?: string | null
          content_hash: string
          created_at?: string
          created_by?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_name?: string | null
          document_date: string
          document_number: string
          gross_cents: number
          id?: string
          items?: Json
          kind: string
          net_cents: number
          non_taxable_cents?: number
          payment_status?: string | null
          pdf_filename: string
          pdf_path: string
          pdf_size_bytes?: number | null
          revision?: number
          snapshot: Json
          source: string
          total_cents: number
          user_id?: string | null
          vat_cents: number
          vat_rate?: number
        }
        Update: {
          billing_address?: Json | null
          booking_id?: string | null
          content_hash?: string
          created_at?: string
          created_by?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_name?: string | null
          document_date?: string
          document_number?: string
          gross_cents?: number
          id?: string
          items?: Json
          kind?: string
          net_cents?: number
          non_taxable_cents?: number
          payment_status?: string | null
          pdf_filename?: string
          pdf_path?: string
          pdf_size_bytes?: number | null
          revision?: number
          snapshot?: Json
          source?: string
          total_cents?: number
          user_id?: string | null
          vat_cents?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "issued_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_reservation_documents: {
        Row: {
          created_at: string
          created_by: string | null
          doc_type: string
          file_path: string
          id: string
          original_name: string | null
          reservation_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_type?: string
          file_path: string
          id?: string
          original_name?: string | null
          reservation_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_type?: string
          file_path?: string
          id?: string
          original_name?: string | null
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_reservation_documents_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "manual_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_reservation_notifications: {
        Row: {
          attempts: number
          created_at: string
          event_kind: string
          id: string
          last_error: string | null
          lease_token: string | null
          lease_until: string | null
          mail_sent_at: string | null
          next_retry_at: string | null
          payload: Json
          push_sent_at: string | null
          reservation_id: string
          revision: number
          status: string
          succeeded_at: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_kind: string
          id?: string
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          mail_sent_at?: string | null
          next_retry_at?: string | null
          payload: Json
          push_sent_at?: string | null
          reservation_id: string
          revision: number
          status?: string
          succeeded_at?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_kind?: string
          id?: string
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          mail_sent_at?: string | null
          next_retry_at?: string | null
          payload?: Json
          push_sent_at?: string | null
          reservation_id?: string
          revision?: number
          status?: string
          succeeded_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      manual_reservations: {
        Row: {
          created_at: string
          created_by: string | null
          customer_birth_date: string | null
          customer_city: string | null
          customer_email: string | null
          customer_id_number: string | null
          customer_license_number: string | null
          customer_name: string
          customer_phone: string | null
          customer_street: string | null
          end_at: string
          id: string
          note: string | null
          notify_customer: boolean
          reminder_24h_sent_at: string | null
          reminder_30min_sent_at: string | null
          reminder_enabled: boolean
          revision: number
          start_at: string
          updated_at: string
          vehicle_id: string | null
          vehicle_name: string | null
          vehicle_plate: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_birth_date?: string | null
          customer_city?: string | null
          customer_email?: string | null
          customer_id_number?: string | null
          customer_license_number?: string | null
          customer_name: string
          customer_phone?: string | null
          customer_street?: string | null
          end_at: string
          id?: string
          note?: string | null
          notify_customer?: boolean
          reminder_24h_sent_at?: string | null
          reminder_30min_sent_at?: string | null
          reminder_enabled?: boolean
          revision?: number
          start_at: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_name?: string | null
          vehicle_plate: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_birth_date?: string | null
          customer_city?: string | null
          customer_email?: string | null
          customer_id_number?: string | null
          customer_license_number?: string | null
          customer_name?: string
          customer_phone?: string | null
          customer_street?: string | null
          end_at?: string
          id?: string
          note?: string | null
          notify_customer?: boolean
          reminder_24h_sent_at?: string | null
          reminder_30min_sent_at?: string | null
          reminder_enabled?: boolean
          revision?: number
          start_at?: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_name?: string | null
          vehicle_plate?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_reservations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      native_push_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          provider: string
          token: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: string
          provider: string
          token: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          provider?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: string
          address_city: string | null
          address_country: string | null
          address_postal_code: string | null
          address_street: string | null
          birth_date: string | null
          birthday_consent_at: string | null
          birthday_marketing_consent: boolean
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
          address_city?: string | null
          address_country?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          birth_date?: string | null
          birthday_consent_at?: string | null
          birthday_marketing_consent?: boolean
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
          address_city?: string | null
          address_country?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          birth_date?: string | null
          birthday_consent_at?: string | null
          birthday_marketing_consent?: boolean
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
          removed_from_account_at: string | null
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
          removed_from_account_at?: string | null
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
          removed_from_account_at?: string | null
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
          cargo_height_cm: number | null
          cargo_length_cm: number | null
          cargo_volume_m3: number | null
          cargo_width_between_arches_cm: number | null
          cargo_width_cm: number | null
          color: string | null
          created_at: string
          displacement_ccm: number | null
          empty_weight_kg: number | null
          first_registration: string | null
          fuel_type: string | null
          height_cm: number | null
          hsn: string | null
          id: string
          is_active: boolean
          length_cm: number | null
          manufacturer: string | null
          max_weight_kg: number | null
          model: string | null
          name: string
          notes: string | null
          owner_name: string | null
          payload_kg: number | null
          photo_urls: string[]
          pickup_address: string | null
          pickup_location: string | null
          plate: string
          power_kw: number | null
          range_km: number | null
          rear_door_height_cm: number | null
          rear_door_width_cm: number | null
          registration_doc_url: string | null
          seats: number | null
          side_door_height_cm: number | null
          side_door_width_cm: number | null
          specs_source: string | null
          specs_status: string | null
          tank_liters: number | null
          tire_size: string | null
          trailer_load_braked_kg: number | null
          trailer_load_unbraked_kg: number | null
          tsn: string | null
          type_variant_version: string | null
          updated_at: string
          vehicle_class: string | null
          vin: string | null
          width_cm: number | null
        }
        Insert: {
          axles?: number | null
          body_type?: string | null
          brand?: string | null
          cargo_height_cm?: number | null
          cargo_length_cm?: number | null
          cargo_volume_m3?: number | null
          cargo_width_between_arches_cm?: number | null
          cargo_width_cm?: number | null
          color?: string | null
          created_at?: string
          displacement_ccm?: number | null
          empty_weight_kg?: number | null
          first_registration?: string | null
          fuel_type?: string | null
          height_cm?: number | null
          hsn?: string | null
          id?: string
          is_active?: boolean
          length_cm?: number | null
          manufacturer?: string | null
          max_weight_kg?: number | null
          model?: string | null
          name?: string
          notes?: string | null
          owner_name?: string | null
          payload_kg?: number | null
          photo_urls?: string[]
          pickup_address?: string | null
          pickup_location?: string | null
          plate?: string
          power_kw?: number | null
          range_km?: number | null
          rear_door_height_cm?: number | null
          rear_door_width_cm?: number | null
          registration_doc_url?: string | null
          seats?: number | null
          side_door_height_cm?: number | null
          side_door_width_cm?: number | null
          specs_source?: string | null
          specs_status?: string | null
          tank_liters?: number | null
          tire_size?: string | null
          trailer_load_braked_kg?: number | null
          trailer_load_unbraked_kg?: number | null
          tsn?: string | null
          type_variant_version?: string | null
          updated_at?: string
          vehicle_class?: string | null
          vin?: string | null
          width_cm?: number | null
        }
        Update: {
          axles?: number | null
          body_type?: string | null
          brand?: string | null
          cargo_height_cm?: number | null
          cargo_length_cm?: number | null
          cargo_volume_m3?: number | null
          cargo_width_between_arches_cm?: number | null
          cargo_width_cm?: number | null
          color?: string | null
          created_at?: string
          displacement_ccm?: number | null
          empty_weight_kg?: number | null
          first_registration?: string | null
          fuel_type?: string | null
          height_cm?: number | null
          hsn?: string | null
          id?: string
          is_active?: boolean
          length_cm?: number | null
          manufacturer?: string | null
          max_weight_kg?: number | null
          model?: string | null
          name?: string
          notes?: string | null
          owner_name?: string | null
          payload_kg?: number | null
          photo_urls?: string[]
          pickup_address?: string | null
          pickup_location?: string | null
          plate?: string
          power_kw?: number | null
          range_km?: number | null
          rear_door_height_cm?: number | null
          rear_door_width_cm?: number | null
          registration_doc_url?: string | null
          seats?: number | null
          side_door_height_cm?: number | null
          side_door_width_cm?: number | null
          specs_source?: string | null
          specs_status?: string | null
          tank_liters?: number | null
          tire_size?: string | null
          trailer_load_braked_kg?: number | null
          trailer_load_unbraked_kg?: number | null
          tsn?: string | null
          type_variant_version?: string | null
          updated_at?: string
          vehicle_class?: string | null
          vin?: string | null
          width_cm?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      blocking_booking_statuses: { Args: never; Returns: string[] }
      booking_calendar_payload: {
        Args: { _row: Database["public"]["Tables"]["bookings"]["Row"] }
        Returns: Json
      }
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
      calendar_source_snapshot: {
        Args: { _source_id: string; _source_type: string }
        Returns: Json
      }
      claim_account_deletion: {
        Args: {
          _account_created_at: string
          _lease_seconds?: number
          _uid: string
        }
        Returns: string
      }
      claim_booking_action: {
        Args: {
          _action_key: string
          _booking_id: string
          _lock_timeout_seconds?: number
        }
        Returns: boolean
      }
      claim_calendar_sources: {
        Args: {
          _lease_seconds?: number
          _limit?: number
          _source_id?: string
          _source_type?: string
        }
        Returns: {
          adopted: boolean
          attempts: number
          created_at: string
          google_event_id: string | null
          last_action: string | null
          last_error: string | null
          lease_token: string | null
          lease_until: string | null
          lease_version: number | null
          next_retry_at: string | null
          source_id: string
          source_type: string
          status: string
          synced_at: string | null
          synced_version: number
          updated_at: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "calendar_sync_state"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_calendar_sync_jobs: {
        Args: { _lease_seconds?: number; _limit?: number }
        Returns: {
          attempts: number
          content_hash: string
          created_at: string
          event_kind: string
          google_event_id: string | null
          id: string
          last_error: string | null
          lease_token: string | null
          lease_until: string | null
          next_retry_at: string | null
          payload: Json
          source_id: string
          source_type: string
          status: string
          succeeded_at: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "calendar_sync_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_manual_notifications: {
        Args: { _lease_seconds?: number; _limit?: number }
        Returns: {
          attempts: number
          created_at: string
          event_kind: string
          id: string
          last_error: string | null
          lease_token: string | null
          lease_until: string | null
          mail_sent_at: string | null
          next_retry_at: string | null
          payload: Json
          push_sent_at: string | null
          reservation_id: string
          revision: number
          status: string
          succeeded_at: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "manual_reservation_notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_account_deletion: {
        Args: { _booking_count: number; _uid: string }
        Returns: string
      }
      complete_booking_action: {
        Args: { _action_key: string; _booking_id: string }
        Returns: undefined
      }
      complete_calendar_source: {
        Args: {
          _action?: string
          _adopted?: boolean
          _clear_event?: boolean
          _google_event_id: string
          _lease_token: string
          _source_id: string
          _source_type: string
        }
        Returns: boolean
      }
      complete_calendar_sync_job: {
        Args: { _google_event_id?: string; _id: string; _lease_token?: string }
        Returns: boolean
      }
      complete_manual_notification:
        | { Args: { _id: string; _push_sent?: boolean }; Returns: undefined }
        | {
            Args: { _id: string; _lease_token?: string; _push_sent?: boolean }
            Returns: boolean
          }
      create_booking_hold_atomic: {
        Args: {
          _minutes?: number
          _plan_id: string
          _start_date: string
          _start_hour: number
          _user_id: string
          _vehicle_id: string
          _vehicle_plate: string
        }
        Returns: {
          expires_at: string
          hold_id: string
        }[]
      }
      delete_expired_booking_holds: { Args: never; Returns: undefined }
      enqueue_calendar_sync: {
        Args: {
          _event_kind: string
          _payload: Json
          _source_id: string
          _source_type: string
        }
        Returns: undefined
      }
      fail_account_deletion: {
        Args: { _error: string; _uid: string }
        Returns: undefined
      }
      fail_booking_action: {
        Args: {
          _action_key: string
          _booking_id: string
          _error: string
          _retry_in_seconds?: number
        }
        Returns: undefined
      }
      fail_calendar_source: {
        Args: {
          _error: string
          _lease_token: string
          _retry_in_seconds?: number
          _source_id: string
          _source_type: string
        }
        Returns: boolean
      }
      fail_calendar_sync_job: {
        Args: {
          _error: string
          _id: string
          _lease_token?: string
          _retry_in_seconds?: number
        }
        Returns: boolean
      }
      fail_manual_notification:
        | {
            Args: { _error: string; _id: string; _retry_in_seconds?: number }
            Returns: undefined
          }
        | {
            Args: {
              _error: string
              _id: string
              _lease_token?: string
              _retry_in_seconds?: number
            }
            Returns: boolean
          }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_account_active: { Args: { _uid: string }; Returns: boolean }
      is_vehicle_available: {
        Args: {
          _end: string
          _ignore_booking_id?: string
          _ignore_hold_user?: string
          _plate: string
          _start: string
        }
        Returns: boolean
      }
      local_start_at: {
        Args: { _start_date: string; _start_hour: number }
        Returns: string
      }
      manual_reservation_calendar_payload: {
        Args: {
          _row: Database["public"]["Tables"]["manual_reservations"]["Row"]
        }
        Returns: Json
      }
      manual_reservation_notification_payload: {
        Args: {
          _row: Database["public"]["Tables"]["manual_reservations"]["Row"]
        }
        Returns: Json
      }
      mark_calendar_source_dirty: {
        Args: { _source_id: string; _source_type: string }
        Returns: undefined
      }
      mark_manual_notification_mailed: {
        Args: { _id: string; _lease_token?: string }
        Returns: boolean
      }
      mark_manual_notification_pushed:
        | { Args: { _id: string }; Returns: undefined }
        | { Args: { _id: string; _lease_token?: string }; Returns: boolean }
      normalize_plate: { Args: { _plate: string }; Returns: string }
      plan_end_at: {
        Args: { _plan_id: string; _start: string }
        Returns: string
      }
      report_trip_return: {
        Args: {
          _booking_id: string
          _end_fuel_percent?: number
          _end_km: number
          _end_km_manual?: boolean
          _exceptions?: Json
        }
        Returns: Json
      }
      request_account_deletion: {
        Args: { _account_created_at: string; _reason: string; _uid: string }
        Returns: string
      }
      set_calendar_source_event: {
        Args: {
          _adopted: boolean
          _google_event_id: string
          _lease_token: string
          _source_id: string
          _source_type: string
        }
        Returns: boolean
      }
      trip_active_statuses: { Args: never; Returns: string[] }
      trip_confirmed_photo_types: {
        Args: { _booking_id: string }
        Returns: string[]
      }
      trip_returning_statuses: { Args: never; Returns: string[] }
      vehicle_conflicts: {
        Args: {
          _end: string
          _ignore_booking_id?: string
          _ignore_hold_user?: string
          _plate: string
          _start: string
        }
        Returns: {
          end_at: string
          ref_id: string
          source: string
          start_at: string
        }[]
      }
      vehicle_conflicts_for_plan: {
        Args: {
          _ignore_booking_id?: string
          _ignore_hold_user?: string
          _plan_id: string
          _plate: string
          _start_date: string
          _start_hour: number
        }
        Returns: {
          end_at: string
          ref_id: string
          source: string
          start_at: string
        }[]
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
