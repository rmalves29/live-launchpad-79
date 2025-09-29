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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          created_at: string
          default_diameter_cm: number | null
          default_height_cm: number | null
          default_length_cm: number | null
          default_weight_kg: number | null
          default_width_cm: number | null
          handling_days: number | null
          id: number
          public_base_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_diameter_cm?: number | null
          default_height_cm?: number | null
          default_length_cm?: number | null
          default_weight_kg?: number | null
          default_width_cm?: number | null
          handling_days?: number | null
          id?: number
          public_base_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_diameter_cm?: number | null
          default_height_cm?: number | null
          default_length_cm?: number | null
          default_weight_kg?: number | null
          default_width_cm?: number | null
          handling_days?: number | null
          id?: number
          public_base_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string | null
          entity: string
          entity_id: string | null
          id: string
          meta: Json | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string | null
          entity: string
          entity_id?: string | null
          id?: string
          meta?: Json | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string | null
          entity?: string
          entity_id?: string | null
          id?: string
          meta?: Json | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          cart_id: number
          created_at: string | null
          id: number
          printed: boolean
          product_id: number
          qty: number
          tenant_id: string
          unit_price: number
        }
        Insert: {
          cart_id: number
          created_at?: string | null
          id?: number
          printed?: boolean
          product_id: number
          qty?: number
          tenant_id: string
          unit_price: number
        }
        Update: {
          cart_id?: number
          created_at?: string | null
          id?: number
          printed?: boolean
          product_id?: number
          qty?: number
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string | null
          customer_instagram: string | null
          customer_phone: string
          event_date: string
          event_type: string
          id: number
          status: Database["public"]["Enums"]["cart_status"]
          tenant_id: string
          whatsapp_group_name: string | null
        }
        Insert: {
          created_at?: string | null
          customer_instagram?: string | null
          customer_phone: string
          event_date: string
          event_type: string
          id?: number
          status?: Database["public"]["Enums"]["cart_status"]
          tenant_id: string
          whatsapp_group_name?: string | null
        }
        Update: {
          created_at?: string | null
          customer_instagram?: string | null
          customer_phone?: string
          event_date?: string
          event_type?: string
          id?: number
          status?: Database["public"]["Enums"]["cart_status"]
          tenant_id?: string
          whatsapp_group_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: number
          is_active: boolean
          updated_at: string
          usage_limit: number | null
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: number
          is_active?: boolean
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: number
          is_active?: boolean
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: []
      }
      customer_whatsapp_groups: {
        Row: {
          created_at: string | null
          customer_name: string | null
          customer_phone: string
          id: number
          tenant_id: string
          updated_at: string | null
          whatsapp_group_name: string
        }
        Insert: {
          created_at?: string | null
          customer_name?: string | null
          customer_phone: string
          id?: number
          tenant_id: string
          updated_at?: string | null
          whatsapp_group_name: string
        }
        Update: {
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string
          id?: number
          tenant_id?: string
          updated_at?: string | null
          whatsapp_group_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_whatsapp_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          cep: string | null
          city: string | null
          complement: string | null
          cpf: string | null
          created_at: string | null
          email: string | null
          id: number
          name: string
          number: string | null
          phone: string
          state: string | null
          street: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          cep?: string | null
          city?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          id?: number
          name: string
          number?: string | null
          phone: string
          state?: string | null
          street?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          cep?: string | null
          city?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          id?: number
          name?: string
          number?: string | null
          phone?: string
          state?: string | null
          street?: string | null
          tenant_id?: string
          updated_at?: string | null
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
      gifts: {
        Row: {
          created_at: string
          description: string | null
          id: number
          is_active: boolean
          minimum_purchase_amount: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          minimum_purchase_amount: number
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          minimum_purchase_amount?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_mp: {
        Row: {
          access_token: string | null
          client_id: string | null
          client_secret: string | null
          created_at: string
          environment: string
          id: string
          is_active: boolean
          public_key: string | null
          tenant_id: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          access_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          public_key?: string | null
          tenant_id: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          access_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          public_key?: string | null
          tenant_id?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_mp_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_whatsapp: {
        Row: {
          api_url: string | null
          created_at: string | null
          id: string
          instance_name: string
          is_active: boolean
          tenant_id: string | null
          updated_at: string | null
          webhook_secret: string
        }
        Insert: {
          api_url?: string | null
          created_at?: string | null
          id?: string
          instance_name: string
          is_active?: boolean
          tenant_id?: string | null
          updated_at?: string | null
          webhook_secret: string
        }
        Update: {
          api_url?: string | null
          created_at?: string | null
          id?: string
          instance_name?: string
          is_active?: boolean
          tenant_id?: string | null
          updated_at?: string | null
          webhook_secret?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          cart_id: number | null
          created_at: string | null
          customer_cep: string | null
          customer_city: string | null
          customer_complement: string | null
          customer_name: string | null
          customer_number: string | null
          customer_phone: string
          customer_state: string | null
          customer_street: string | null
          event_date: string
          event_type: string
          id: number
          is_paid: boolean
          item_added_message_sent: boolean | null
          observation: string | null
          payment_confirmation_sent: boolean | null
          payment_link: string | null
          printed: boolean | null
          tenant_id: string
          total_amount: number
          unique_order_id: string | null
          whatsapp_group_name: string | null
        }
        Insert: {
          cart_id?: number | null
          created_at?: string | null
          customer_cep?: string | null
          customer_city?: string | null
          customer_complement?: string | null
          customer_name?: string | null
          customer_number?: string | null
          customer_phone: string
          customer_state?: string | null
          customer_street?: string | null
          event_date: string
          event_type: string
          id?: number
          is_paid?: boolean
          item_added_message_sent?: boolean | null
          observation?: string | null
          payment_confirmation_sent?: boolean | null
          payment_link?: string | null
          printed?: boolean | null
          tenant_id: string
          total_amount: number
          unique_order_id?: string | null
          whatsapp_group_name?: string | null
        }
        Update: {
          cart_id?: number | null
          created_at?: string | null
          customer_cep?: string | null
          customer_city?: string | null
          customer_complement?: string | null
          customer_name?: string | null
          customer_number?: string | null
          customer_phone?: string
          customer_state?: string | null
          customer_street?: string | null
          event_date?: string
          event_type?: string
          id?: number
          is_paid?: boolean
          item_added_message_sent?: boolean | null
          observation?: string | null
          payment_confirmation_sent?: boolean | null
          payment_link?: string | null
          printed?: boolean | null
          tenant_id?: string
          total_amount?: number
          unique_order_id?: string | null
          whatsapp_group_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_integrations: {
        Row: {
          access_token: string
          client_id: string | null
          client_secret: string | null
          created_at: string | null
          id: string
          is_active: boolean
          provider: string
          public_key: string | null
          tenant_id: string | null
          updated_at: string | null
          webhook_secret: string | null
        }
        Insert: {
          access_token: string
          client_id?: string | null
          client_secret?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          provider?: string
          public_key?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Update: {
          access_token?: string
          client_id?: string | null
          client_secret?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          provider?: string
          public_key?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          code: string
          color: string | null
          created_at: string | null
          id: number
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          size: string | null
          stock: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string | null
          id?: number
          image_url?: string | null
          is_active?: boolean
          name: string
          price: number
          size?: string | null
          stock?: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string | null
          id?: number
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          size?: string | null
          stock?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_integrations: {
        Row: {
          access_token: string
          account_id: number | null
          client_id: string | null
          client_secret: string | null
          company_id: number | null
          created_at: string | null
          expires_at: string | null
          from_cep: string | null
          id: string
          is_active: boolean
          provider: string
          refresh_token: string | null
          sandbox: boolean
          scope: string | null
          tenant_id: string | null
          token_type: string | null
          updated_at: string | null
          webhook_id: number | null
          webhook_secret: string | null
        }
        Insert: {
          access_token: string
          account_id?: number | null
          client_id?: string | null
          client_secret?: string | null
          company_id?: number | null
          created_at?: string | null
          expires_at?: string | null
          from_cep?: string | null
          id?: string
          is_active?: boolean
          provider?: string
          refresh_token?: string | null
          sandbox?: boolean
          scope?: string | null
          tenant_id?: string | null
          token_type?: string | null
          updated_at?: string | null
          webhook_id?: number | null
          webhook_secret?: string | null
        }
        Update: {
          access_token?: string
          account_id?: number | null
          client_id?: string | null
          client_secret?: string | null
          company_id?: number | null
          created_at?: string | null
          expires_at?: string | null
          from_cep?: string | null
          id?: string
          is_active?: boolean
          provider?: string
          refresh_token?: string | null
          sandbox?: boolean
          scope?: string | null
          tenant_id?: string | null
          token_type?: string | null
          updated_at?: string | null
          webhook_id?: number | null
          webhook_secret?: string | null
        }
        Relationships: []
      }
      tenant_credentials: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          password_hash: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          password_hash: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          password_hash?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          admin_email: string | null
          admin_user_id: string | null
          company_address: string | null
          company_cep: string | null
          company_city: string | null
          company_complement: string | null
          company_district: string | null
          company_document: string | null
          company_email: string | null
          company_name: string | null
          company_number: string | null
          company_phone: string | null
          company_state: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          tenant_key: string | null
          updated_at: string
        }
        Insert: {
          admin_email?: string | null
          admin_user_id?: string | null
          company_address?: string | null
          company_cep?: string | null
          company_city?: string | null
          company_complement?: string | null
          company_district?: string | null
          company_document?: string | null
          company_email?: string | null
          company_name?: string | null
          company_number?: string | null
          company_phone?: string | null
          company_state?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          tenant_key?: string | null
          updated_at?: string
        }
        Update: {
          admin_email?: string | null
          admin_user_id?: string | null
          company_address?: string | null
          company_cep?: string | null
          company_city?: string | null
          company_complement?: string | null
          company_district?: string | null
          company_document?: string | null
          company_email?: string | null
          company_name?: string | null
          company_number?: string | null
          company_phone?: string | null
          company_state?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          tenant_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          payload: Json | null
          response: string | null
          status_code: number
          tenant_id: string | null
          webhook_type: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          response?: string | null
          status_code: number
          tenant_id?: string | null
          webhook_type: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          response?: string | null
          status_code?: number
          tenant_id?: string | null
          webhook_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          amount: number | null
          created_at: string | null
          id: number
          message: string
          order_id: number | null
          phone: string
          processed: boolean | null
          product_name: string | null
          received_at: string | null
          sent_at: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["whatsapp_message_type"]
          updated_at: string | null
          whatsapp_group_name: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          id?: number
          message: string
          order_id?: number | null
          phone: string
          processed?: boolean | null
          product_name?: string | null
          received_at?: string | null
          sent_at?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["whatsapp_message_type"]
          updated_at?: string | null
          whatsapp_group_name?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          id?: number
          message?: string
          order_id?: number | null
          phone?: string
          processed?: boolean | null
          product_name?: string | null
          received_at?: string | null
          sent_at?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["whatsapp_message_type"]
          updated_at?: string | null
          whatsapp_group_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          content: string
          created_at: string | null
          id: number
          tenant_id: string
          title: string | null
          type: Database["public"]["Enums"]["whatsapp_template_type"]
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: number
          tenant_id: string
          title?: string | null
          type: Database["public"]["Enums"]["whatsapp_template_type"]
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: number
          tenant_id?: string
          title?: string | null
          type?: Database["public"]["Enums"]["whatsapp_template_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bytea_to_text: {
        Args: { data: string }
        Returns: string
      }
      get_current_tenant_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_tenant_by_id: {
        Args: { tenant_id_param: string }
        Returns: {
          id: string
          is_active: boolean
          name: string
          slug: string
        }[]
      }
      get_tenant_by_slug: {
        Args: { slug_param: string }
        Returns: {
          id: string
          is_active: boolean
          name: string
          slug: string
        }[]
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_delete: {
        Args:
          | { content: string; content_type: string; uri: string }
          | { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_get: {
        Args: { data: Json; uri: string } | { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
      }
      http_list_curlopt: {
        Args: Record<PropertyKey, never>
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_post: {
        Args:
          | { content: string; content_type: string; uri: string }
          | { data: Json; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_reset_curlopt: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      is_super_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      list_active_tenants_basic: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          is_active: boolean
          name: string
          slug: string
        }[]
      }
      text_to_bytea: {
        Args: { data: string }
        Returns: string
      }
      urlencode: {
        Args: { data: Json } | { string: string } | { string: string }
        Returns: string
      }
    }
    Enums: {
      cart_status: "OPEN" | "CLOSED"
      user_role: "super_admin" | "tenant_admin" | "staff"
      whatsapp_message_type:
        | "incoming"
        | "outgoing"
        | "broadcast"
        | "system_log"
        | "bulk"
        | "mass"
      whatsapp_template_type:
        | "BROADCAST"
        | "ITEM_ADDED"
        | "PRODUCT_CANCELED"
        | "PAID_ORDER"
        | "FINALIZAR"
        | "sendflow"
        | "MSG_MASSA"
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown | null
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
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
      cart_status: ["OPEN", "CLOSED"],
      user_role: ["super_admin", "tenant_admin", "staff"],
      whatsapp_message_type: [
        "incoming",
        "outgoing",
        "broadcast",
        "system_log",
        "bulk",
        "mass",
      ],
      whatsapp_template_type: [
        "BROADCAST",
        "ITEM_ADDED",
        "PRODUCT_CANCELED",
        "PAID_ORDER",
        "FINALIZAR",
        "sendflow",
        "MSG_MASSA",
      ],
    },
  },
} as const
