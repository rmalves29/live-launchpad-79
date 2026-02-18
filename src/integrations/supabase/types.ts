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
          product_code: string | null
          product_id: number | null
          product_image_url: string | null
          product_name: string | null
          qty: number
          tenant_id: string
          unit_price: number
        }
        Insert: {
          cart_id: number
          created_at?: string | null
          id?: number
          printed?: boolean
          product_code?: string | null
          product_id?: number | null
          product_image_url?: string | null
          product_name?: string | null
          qty?: number
          tenant_id: string
          unit_price: number
        }
        Update: {
          cart_id?: number
          created_at?: string | null
          id?: number
          printed?: boolean
          product_code?: string | null
          product_id?: number | null
          product_image_url?: string | null
          product_name?: string | null
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
          progressive_tiers: Json | null
          tenant_id: string | null
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
          progressive_tiers?: Json | null
          tenant_id?: string | null
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
          progressive_tiers?: Json | null
          tenant_id?: string | null
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_shipping_options: {
        Row: {
          carrier_service_id: number | null
          carrier_service_name: string | null
          coverage_city: string | null
          coverage_state: string | null
          coverage_states: string[] | null
          coverage_type: string | null
          created_at: string
          delivery_days: number
          id: string
          is_active: boolean
          name: string
          price: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          carrier_service_id?: number | null
          carrier_service_name?: string | null
          coverage_city?: string | null
          coverage_state?: string | null
          coverage_states?: string[] | null
          coverage_type?: string | null
          created_at?: string
          delivery_days?: number
          id?: string
          is_active?: boolean
          name: string
          price?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          carrier_service_id?: number | null
          carrier_service_name?: string | null
          coverage_city?: string | null
          coverage_state?: string | null
          coverage_states?: string[] | null
          coverage_type?: string | null
          created_at?: string
          delivery_days?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_shipping_options_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_whatsapp_groups: {
        Row: {
          created_at: string | null
          customer_name: string | null
          customer_phone: string
          group_display_name: string | null
          id: number
          tenant_id: string
          updated_at: string | null
          whatsapp_group_name: string
        }
        Insert: {
          created_at?: string | null
          customer_name?: string | null
          customer_phone: string
          group_display_name?: string | null
          id?: number
          tenant_id: string
          updated_at?: string | null
          whatsapp_group_name: string
        }
        Update: {
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string
          group_display_name?: string | null
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
          bling_contact_id: number | null
          cep: string | null
          city: string | null
          complement: string | null
          consentimento_ativo: boolean | null
          cpf: string | null
          created_at: string | null
          data_permissao: string | null
          email: string | null
          id: number
          instagram: string | null
          is_blocked: boolean | null
          name: string
          neighborhood: string | null
          number: string | null
          phone: string
          state: string | null
          street: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          bling_contact_id?: number | null
          cep?: string | null
          city?: string | null
          complement?: string | null
          consentimento_ativo?: boolean | null
          cpf?: string | null
          created_at?: string | null
          data_permissao?: string | null
          email?: string | null
          id?: number
          instagram?: string | null
          is_blocked?: boolean | null
          name: string
          neighborhood?: string | null
          number?: string | null
          phone: string
          state?: string | null
          street?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          bling_contact_id?: number | null
          cep?: string | null
          city?: string | null
          complement?: string | null
          consentimento_ativo?: boolean | null
          cpf?: string | null
          created_at?: string | null
          data_permissao?: string | null
          email?: string | null
          id?: number
          instagram?: string | null
          is_blocked?: boolean | null
          name?: string
          neighborhood?: string | null
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
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          minimum_purchase_amount: number
          name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          minimum_purchase_amount?: number
          name?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_appmax: {
        Row: {
          access_token: string | null
          appmax_customer_id: number | null
          created_at: string | null
          environment: string | null
          id: string
          is_active: boolean | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          appmax_customer_id?: number | null
          created_at?: string | null
          environment?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          appmax_customer_id?: number | null
          created_at?: string | null
          environment?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_appmax_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_bling: {
        Row: {
          access_token: string | null
          bling_store_id: number | null
          bling_store_name: string | null
          client_id: string | null
          client_secret: string | null
          created_at: string
          default_cfop_other_state: string | null
          default_cfop_same_state: string | null
          default_icms_origem: string | null
          default_icms_situacao: string | null
          default_ipi: number | null
          default_ncm: string | null
          default_pis_cofins: string | null
          environment: string
          id: string
          is_active: boolean
          last_sync_at: string | null
          refresh_token: string | null
          store_state: string | null
          sync_ecommerce: boolean
          sync_invoices: boolean
          sync_logistics: boolean
          sync_marketplaces: boolean
          sync_orders: boolean
          sync_products: boolean
          sync_stock: boolean
          tenant_id: string
          token_expires_at: string | null
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          access_token?: string | null
          bling_store_id?: number | null
          bling_store_name?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          default_cfop_other_state?: string | null
          default_cfop_same_state?: string | null
          default_icms_origem?: string | null
          default_icms_situacao?: string | null
          default_ipi?: number | null
          default_ncm?: string | null
          default_pis_cofins?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          refresh_token?: string | null
          store_state?: string | null
          sync_ecommerce?: boolean
          sync_invoices?: boolean
          sync_logistics?: boolean
          sync_marketplaces?: boolean
          sync_orders?: boolean
          sync_products?: boolean
          sync_stock?: boolean
          tenant_id: string
          token_expires_at?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          access_token?: string | null
          bling_store_id?: number | null
          bling_store_name?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          default_cfop_other_state?: string | null
          default_cfop_same_state?: string | null
          default_icms_origem?: string | null
          default_icms_situacao?: string | null
          default_ipi?: number | null
          default_ncm?: string | null
          default_pis_cofins?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          refresh_token?: string | null
          store_state?: string | null
          sync_ecommerce?: boolean
          sync_invoices?: boolean
          sync_logistics?: boolean
          sync_marketplaces?: boolean
          sync_orders?: boolean
          sync_products?: boolean
          sync_stock?: boolean
          tenant_id?: string
          token_expires_at?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_bling_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_instagram: {
        Row: {
          access_token: string | null
          created_at: string
          environment: string
          id: string
          instagram_account_id: string | null
          is_active: boolean
          page_access_token: string | null
          page_id: string | null
          tenant_id: string
          updated_at: string
          webhook_verify_token: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          environment?: string
          id?: string
          instagram_account_id?: string | null
          is_active?: boolean
          page_access_token?: string | null
          page_id?: string | null
          tenant_id: string
          updated_at?: string
          webhook_verify_token?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string
          environment?: string
          id?: string
          instagram_account_id?: string | null
          is_active?: boolean
          page_access_token?: string | null
          page_id?: string | null
          tenant_id?: string
          updated_at?: string
          webhook_verify_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_instagram_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_manychat: {
        Row: {
          api_key: string | null
          bot_id: string | null
          created_at: string
          environment: string
          id: string
          is_active: boolean
          tenant_id: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          api_key?: string | null
          bot_id?: string | null
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          tenant_id: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          api_key?: string | null
          bot_id?: string | null
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          tenant_id?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_manychat_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      integration_pagarme: {
        Row: {
          api_key: string | null
          created_at: string
          encryption_key: string | null
          environment: string
          id: string
          is_active: boolean
          max_installments_without_interest: number | null
          min_installment_value: number | null
          public_key: string | null
          tenant_id: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          encryption_key?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          max_installments_without_interest?: number | null
          min_installment_value?: number | null
          public_key?: string | null
          tenant_id: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          api_key?: string | null
          created_at?: string
          encryption_key?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          max_installments_without_interest?: number | null
          min_installment_value?: number | null
          public_key?: string | null
          tenant_id?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_pagarme_tenant_id_fkey"
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
          blocked_customer_template: string | null
          confirmation_timeout_minutes: number | null
          connected_phone: string | null
          consent_protection_enabled: boolean | null
          created_at: string | null
          id: string
          instance_name: string
          is_active: boolean
          item_added_confirmation_template: string | null
          last_status_check: string | null
          provider: string | null
          send_item_added_msg: boolean
          send_out_of_stock_msg: boolean
          send_paid_order_msg: boolean
          send_product_canceled_msg: boolean
          template_com_link: string | null
          template_item_added: string | null
          template_solicitacao: string | null
          tenant_id: string
          updated_at: string | null
          webhook_secret: string
          zapi_client_token: string | null
          zapi_instance_id: string | null
          zapi_token: string | null
        }
        Insert: {
          api_url?: string | null
          blocked_customer_template?: string | null
          confirmation_timeout_minutes?: number | null
          connected_phone?: string | null
          consent_protection_enabled?: boolean | null
          created_at?: string | null
          id?: string
          instance_name: string
          is_active?: boolean
          item_added_confirmation_template?: string | null
          last_status_check?: string | null
          provider?: string | null
          send_item_added_msg?: boolean
          send_out_of_stock_msg?: boolean
          send_paid_order_msg?: boolean
          send_product_canceled_msg?: boolean
          template_com_link?: string | null
          template_item_added?: string | null
          template_solicitacao?: string | null
          tenant_id: string
          updated_at?: string | null
          webhook_secret: string
          zapi_client_token?: string | null
          zapi_instance_id?: string | null
          zapi_token?: string | null
        }
        Update: {
          api_url?: string | null
          blocked_customer_template?: string | null
          confirmation_timeout_minutes?: number | null
          connected_phone?: string | null
          consent_protection_enabled?: boolean | null
          created_at?: string | null
          id?: string
          instance_name?: string
          is_active?: boolean
          item_added_confirmation_template?: string | null
          last_status_check?: string | null
          provider?: string | null
          send_item_added_msg?: boolean
          send_out_of_stock_msg?: boolean
          send_paid_order_msg?: boolean
          send_product_canceled_msg?: boolean
          template_com_link?: string | null
          template_item_added?: string | null
          template_solicitacao?: string | null
          tenant_id?: string
          updated_at?: string | null
          webhook_secret?: string
          zapi_client_token?: string | null
          zapi_instance_id?: string | null
          zapi_token?: string | null
        }
        Relationships: []
      }
      knowledge_base: {
        Row: {
          category: string | null
          content: string | null
          created_at: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          is_active: boolean | null
          tags: string[] | null
          tenant_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          tags?: string[] | null
          tenant_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          tags?: string[] | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_mm: {
        Row: {
          created_at: string | null
          field1: string | null
          field2: string | null
          field3: string | null
          id: number
          is_cancelled: boolean | null
          last_message_status: string | null
          last_response_at: string | null
          last_sent_at: string | null
          name: string | null
          phone: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          field1?: string | null
          field2?: string | null
          field3?: string | null
          id?: number
          is_cancelled?: boolean | null
          last_message_status?: string | null
          last_response_at?: string | null
          last_sent_at?: string | null
          name?: string | null
          phone: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          field1?: string | null
          field2?: string | null
          field3?: string | null
          id?: number
          is_cancelled?: boolean | null
          last_message_status?: string | null
          last_response_at?: string | null
          last_sent_at?: string | null
          name?: string | null
          phone?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          bling_order_id: number | null
          bling_sync_status: string | null
          cart_id: number | null
          created_at: string | null
          customer_cep: string | null
          customer_city: string | null
          customer_complement: string | null
          customer_name: string | null
          customer_neighborhood: string | null
          customer_number: string | null
          customer_phone: string
          customer_state: string | null
          customer_street: string | null
          event_date: string
          event_type: string
          group_name: string | null
          id: number
          is_cancelled: boolean | null
          is_paid: boolean
          item_added_delivered: boolean | null
          item_added_message_sent: boolean | null
          melhor_envio_shipment_id: string | null
          melhor_envio_tracking_code: string | null
          observation: string | null
          payment_confirmation_delivered: boolean | null
          payment_confirmation_sent: boolean | null
          payment_link: string | null
          printed: boolean | null
          shipping_service_id: number | null
          skip_paid_message: boolean | null
          tenant_id: string
          total_amount: number
          tracking_updated_at: string | null
          unique_order_id: string | null
          whatsapp_group_name: string | null
        }
        Insert: {
          bling_order_id?: number | null
          bling_sync_status?: string | null
          cart_id?: number | null
          created_at?: string | null
          customer_cep?: string | null
          customer_city?: string | null
          customer_complement?: string | null
          customer_name?: string | null
          customer_neighborhood?: string | null
          customer_number?: string | null
          customer_phone: string
          customer_state?: string | null
          customer_street?: string | null
          event_date: string
          event_type: string
          group_name?: string | null
          id?: number
          is_cancelled?: boolean | null
          is_paid?: boolean
          item_added_delivered?: boolean | null
          item_added_message_sent?: boolean | null
          melhor_envio_shipment_id?: string | null
          melhor_envio_tracking_code?: string | null
          observation?: string | null
          payment_confirmation_delivered?: boolean | null
          payment_confirmation_sent?: boolean | null
          payment_link?: string | null
          printed?: boolean | null
          shipping_service_id?: number | null
          skip_paid_message?: boolean | null
          tenant_id: string
          total_amount: number
          tracking_updated_at?: string | null
          unique_order_id?: string | null
          whatsapp_group_name?: string | null
        }
        Update: {
          bling_order_id?: number | null
          bling_sync_status?: string | null
          cart_id?: number | null
          created_at?: string | null
          customer_cep?: string | null
          customer_city?: string | null
          customer_complement?: string | null
          customer_name?: string | null
          customer_neighborhood?: string | null
          customer_number?: string | null
          customer_phone?: string
          customer_state?: string | null
          customer_street?: string | null
          event_date?: string
          event_type?: string
          group_name?: string | null
          id?: number
          is_cancelled?: boolean | null
          is_paid?: boolean
          item_added_delivered?: boolean | null
          item_added_message_sent?: boolean | null
          melhor_envio_shipment_id?: string | null
          melhor_envio_tracking_code?: string | null
          observation?: string | null
          payment_confirmation_delivered?: boolean | null
          payment_confirmation_sent?: boolean | null
          payment_link?: string | null
          printed?: boolean | null
          shipping_service_id?: number | null
          skip_paid_message?: boolean | null
          tenant_id?: string
          total_amount?: number
          tracking_updated_at?: string | null
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
      pending_message_confirmations: {
        Row: {
          checkout_url: string | null
          confirmation_type: string
          confirmed_at: string | null
          created_at: string | null
          customer_phone: string
          expires_at: string
          id: string
          metadata: Json | null
          order_id: number | null
          status: string
          tenant_id: string
        }
        Insert: {
          checkout_url?: string | null
          confirmation_type?: string
          confirmed_at?: string | null
          created_at?: string | null
          customer_phone: string
          expires_at: string
          id?: string
          metadata?: Json | null
          order_id?: number | null
          status?: string
          tenant_id: string
        }
        Update: {
          checkout_url?: string | null
          confirmation_type?: string
          confirmed_at?: string | null
          created_at?: string | null
          customer_phone?: string
          expires_at?: string
          id?: string
          metadata?: Json | null
          order_id?: number | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_message_confirmations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_message_confirmations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_fix_changes: {
        Row: {
          changed_at: string
          column_name: string
          id: string
          job_id: string | null
          new_value: string | null
          old_value: string | null
          row_pk: Json
          table_name: string
        }
        Insert: {
          changed_at?: string
          column_name: string
          id?: string
          job_id?: string | null
          new_value?: string | null
          old_value?: string | null
          row_pk: Json
          table_name: string
        }
        Update: {
          changed_at?: string
          column_name?: string
          id?: string
          job_id?: string | null
          new_value?: string | null
          old_value?: string | null
          row_pk?: Json
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_fix_changes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "phone_fix_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_fix_jobs: {
        Row: {
          batch_size: number
          created_at: string
          created_by: string | null
          dry_run: boolean
          finished_at: string | null
          id: string
          last_error: string | null
          last_processed_id: string | null
          started_at: string | null
          status: string
          tenant_id: string | null
          total_changed: number
          total_scanned: number
        }
        Insert: {
          batch_size?: number
          created_at?: string
          created_by?: string | null
          dry_run?: boolean
          finished_at?: string | null
          id?: string
          last_error?: string | null
          last_processed_id?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string | null
          total_changed?: number
          total_scanned?: number
        }
        Update: {
          batch_size?: number
          created_at?: string
          created_by?: string | null
          dry_run?: boolean
          finished_at?: string | null
          id?: string
          last_error?: string | null
          last_processed_id?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string | null
          total_changed?: number
          total_scanned?: number
        }
        Relationships: []
      }
      products: {
        Row: {
          bling_product_id: number | null
          code: string
          color: string | null
          created_at: string | null
          id: number
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          sale_type: string
          size: string | null
          stock: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          bling_product_id?: number | null
          code: string
          color?: string | null
          created_at?: string | null
          id?: number
          image_url?: string | null
          is_active?: boolean
          name: string
          price: number
          sale_type?: string
          size?: string | null
          stock?: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          bling_product_id?: number | null
          code?: string
          color?: string | null
          created_at?: string | null
          id?: number
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          sale_type?: string
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
      scheduled_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          finished_at: string | null
          id: string
          last_error: string | null
          name: string | null
          options: Json | null
          processed_messages: number
          started_at: string | null
          status: string
          tenant_id: string | null
          total_messages: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          name?: string | null
          options?: Json | null
          processed_messages?: number
          started_at?: string | null
          status?: string
          tenant_id?: string | null
          total_messages?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          name?: string | null
          options?: Json | null
          processed_messages?: number
          started_at?: string | null
          status?: string
          tenant_id?: string | null
          total_messages?: number
        }
        Relationships: []
      }
      scheduled_messages: {
        Row: {
          attempts: number
          created_at: string
          group_id: string | null
          id: string
          job_id: string | null
          last_error: string | null
          next_attempt_at: string | null
          payload: Json | null
          product_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          template_name: string | null
          tenant_id: string | null
          to_phone: string | null
          whatsapp_jid: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          group_id?: string | null
          id?: string
          job_id?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          payload?: Json | null
          product_id?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: string
          template_name?: string | null
          tenant_id?: string | null
          to_phone?: string | null
          whatsapp_jid?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          group_id?: string | null
          id?: string
          job_id?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          payload?: Json | null
          product_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_name?: string | null
          tenant_id?: string | null
          to_phone?: string | null
          whatsapp_jid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "scheduled_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sendflow_history: {
        Row: {
          group_id: string
          id: string
          job_id: string | null
          product_id: number
          sent_at: string
          tenant_id: string
        }
        Insert: {
          group_id: string
          id?: string
          job_id?: string | null
          product_id: number
          sent_at?: string
          tenant_id: string
        }
        Update: {
          group_id?: string
          id?: string
          job_id?: string | null
          product_id?: number
          sent_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sendflow_history_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "sending_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sendflow_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sendflow_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sendflow_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          group_id: string
          group_name: string
          id: string
          job_id: string
          product_code: string
          product_id: number
          sequence: number
          started_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          group_id: string
          group_name?: string
          id?: string
          job_id: string
          product_code: string
          product_id: number
          sequence?: number
          started_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          group_id?: string
          group_name?: string
          id?: string
          job_id?: string
          product_code?: string
          product_id?: number
          sequence?: number
          started_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sendflow_tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "sending_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sendflow_tasks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sendflow_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sending_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          current_index: number
          error_message: string | null
          id: string
          job_data: Json
          job_type: string
          paused_at: string | null
          processed_items: number
          started_at: string
          status: string
          tenant_id: string
          total_items: number
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_index?: number
          error_message?: string | null
          id?: string
          job_data?: Json
          job_type: string
          paused_at?: string | null
          processed_items?: number
          started_at?: string
          status?: string
          tenant_id: string
          total_items?: number
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_index?: number
          error_message?: string | null
          id?: string
          job_data?: Json
          job_type?: string
          paused_at?: string | null
          processed_items?: number
          started_at?: string
          status?: string
          tenant_id?: string
          total_items?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sending_jobs_tenant_id_fkey"
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
      support_conversations: {
        Row: {
          created_at: string | null
          customer_name: string | null
          customer_phone: string
          escalated_at: string | null
          escalated_to_phone: string | null
          escalation_summary: string | null
          failed_attempts: number | null
          id: string
          status: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_name?: string | null
          customer_phone: string
          escalated_at?: string | null
          escalated_to_phone?: string | null
          escalation_summary?: string | null
          failed_attempts?: number | null
          id?: string
          status?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string
          escalated_at?: string | null
          escalated_to_phone?: string | null
          escalation_summary?: string | null
          failed_attempts?: number | null
          id?: string
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_settings: {
        Row: {
          created_at: string | null
          escalation_message: string | null
          human_support_phone: string
          id: string
          is_active: boolean | null
          max_attempts_before_escalation: number | null
          tenant_id: string
          updated_at: string | null
          welcome_message: string | null
        }
        Insert: {
          created_at?: string | null
          escalation_message?: string | null
          human_support_phone: string
          id?: string
          is_active?: boolean | null
          max_attempts_before_escalation?: number | null
          tenant_id: string
          updated_at?: string | null
          welcome_message?: string | null
        }
        Update: {
          created_at?: string | null
          escalation_message?: string | null
          human_support_phone?: string
          id?: string
          is_active?: boolean | null
          max_attempts_before_escalation?: number | null
          tenant_id?: string
          updated_at?: string | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      tenant_users: {
        Row: {
          created_at: string | null
          id: string
          role: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string | null
          tenant_id?: string | null
          user_id?: string | null
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
          address: string | null
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
          email: string | null
          enable_live: boolean
          enable_sendflow: boolean
          id: string
          is_active: boolean
          is_blocked: boolean | null
          logo_url: string | null
          max_orders: number | null
          max_products: number | null
          max_whatsapp_groups: number | null
          name: string
          order_merge_days: number | null
          phone: string | null
          plan_type: string | null
          primary_color: string | null
          secondary_color: string | null
          slug: string
          subdomain: string | null
          subscription_ends_at: string | null
          tenant_key: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
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
          email?: string | null
          enable_live?: boolean
          enable_sendflow?: boolean
          id?: string
          is_active?: boolean
          is_blocked?: boolean | null
          logo_url?: string | null
          max_orders?: number | null
          max_products?: number | null
          max_whatsapp_groups?: number | null
          name: string
          order_merge_days?: number | null
          phone?: string | null
          plan_type?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          subdomain?: string | null
          subscription_ends_at?: string | null
          tenant_key?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
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
          email?: string | null
          enable_live?: boolean
          enable_sendflow?: boolean
          id?: string
          is_active?: boolean
          is_blocked?: boolean | null
          logo_url?: string | null
          max_orders?: number | null
          max_products?: number | null
          max_whatsapp_groups?: number | null
          name?: string
          order_merge_days?: number | null
          phone?: string | null
          plan_type?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          subdomain?: string | null
          subscription_ends_at?: string | null
          tenant_key?: string | null
          trial_ends_at?: string | null
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
      whatsapp_active_sessions: {
        Row: {
          connected_at: string
          created_at: string | null
          id: string
          instance_name: string
          last_heartbeat: string
          metadata: Json | null
          phone_number: string
          server_id: string
          status: string
        }
        Insert: {
          connected_at?: string
          created_at?: string | null
          id?: string
          instance_name: string
          last_heartbeat?: string
          metadata?: Json | null
          phone_number: string
          server_id: string
          status?: string
        }
        Update: {
          connected_at?: string
          created_at?: string | null
          id?: string
          instance_name?: string
          last_heartbeat?: string
          metadata?: Json | null
          phone_number?: string
          server_id?: string
          status?: string
        }
        Relationships: []
      }
      whatsapp_allowed_groups: {
        Row: {
          created_at: string
          group_name: string
          id: string
          is_active: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_name: string
          id?: string
          is_active?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_name?: string
          id?: string
          is_active?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_allowed_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_connection_logs: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          message: string | null
          metadata: Json | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connection_logs_tenant_id_fkey"
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
          delivery_status: string | null
          group_name: string | null
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
          zapi_message_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          delivery_status?: string | null
          group_name?: string | null
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
          zapi_message_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          delivery_status?: string | null
          group_name?: string | null
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
          zapi_message_id?: string | null
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
      whatsapp_session_conflicts: {
        Row: {
          conflict_type: string
          details: Json | null
          detected_at: string | null
          existing_session_id: string | null
          id: string
          instance_name: string
          new_session_server_id: string | null
          phone_number: string
        }
        Insert: {
          conflict_type: string
          details?: Json | null
          detected_at?: string | null
          existing_session_id?: string | null
          id?: string
          instance_name: string
          new_session_server_id?: string | null
          phone_number: string
        }
        Update: {
          conflict_type?: string
          details?: Json | null
          detected_at?: string | null
          existing_session_id?: string | null
          id?: string
          instance_name?: string
          new_session_server_id?: string | null
          phone_number?: string
        }
        Relationships: []
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
      acquire_message_advisory_lock: {
        Args: { p_message_id: string }
        Returns: boolean
      }
      bytea_to_text: { Args: { data: string }; Returns: string }
      cleanup_stale_sessions: { Args: never; Returns: undefined }
      get_current_tenant_id: { Args: never; Returns: string }
      get_tenant_by_id: {
        Args: { tenant_id_param: string }
        Returns: {
          enable_live: boolean
          enable_sendflow: boolean
          id: string
          is_active: boolean
          max_whatsapp_groups: number
          name: string
          slug: string
        }[]
      }
      get_tenant_by_slug: {
        Args: { slug_param: string }
        Returns: {
          enable_live: boolean
          enable_sendflow: boolean
          id: string
          is_active: boolean
          max_whatsapp_groups: number
          name: string
          slug: string
        }[]
      }
      get_user_tenant_id: { Args: never; Returns: string }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      is_product_recently_sent: {
        Args: {
          p_group_id: string
          p_hours?: number
          p_product_id: number
          p_tenant_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: never; Returns: boolean }
      list_active_tenants_basic: {
        Args: never
        Returns: {
          enable_live: boolean
          enable_sendflow: boolean
          id: string
          is_active: boolean
          max_whatsapp_groups: number
          name: string
          slug: string
        }[]
      }
      normalize_bazar_phone: { Args: { phone: string }; Returns: string }
      normalize_phone_regional: { Args: { phone: string }; Returns: string }
      tenant_has_access: { Args: { tenant_uuid: string }; Returns: boolean }
      text_to_bytea: { Args: { data: string }; Returns: string }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
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
        | "item_added"
        | "individual"
      whatsapp_template_type:
        | "BROADCAST"
        | "ITEM_ADDED"
        | "PRODUCT_CANCELED"
        | "PAID_ORDER"
        | "FINALIZAR"
        | "sendflow"
        | "MSG_MASSA"
        | "SENDFLOW"
        | "TRACKING"
        | "BLOCKED_CUSTOMER"
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
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
        "item_added",
        "individual",
      ],
      whatsapp_template_type: [
        "BROADCAST",
        "ITEM_ADDED",
        "PRODUCT_CANCELED",
        "PAID_ORDER",
        "FINALIZAR",
        "sendflow",
        "MSG_MASSA",
        "SENDFLOW",
        "TRACKING",
        "BLOCKED_CUSTOMER",
      ],
    },
  },
} as const
