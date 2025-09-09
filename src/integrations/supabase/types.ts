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
          id: number
          melhor_envio_env: string | null
          melhor_envio_from_cep: string | null
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
          id?: number
          melhor_envio_env?: string | null
          melhor_envio_from_cep?: string | null
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
          id?: number
          melhor_envio_env?: string | null
          melhor_envio_from_cep?: string | null
          public_base_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          cart_id: number | null
          created_at: string | null
          id: number
          printed: boolean
          product_id: number | null
          qty: number
          tenant_id: string | null
          unit_price: number
        }
        Insert: {
          cart_id?: number | null
          created_at?: string | null
          id?: number
          printed?: boolean
          product_id?: number | null
          qty?: number
          tenant_id?: string | null
          unit_price: number
        }
        Update: {
          cart_id?: number | null
          created_at?: string | null
          id?: number
          printed?: boolean
          product_id?: number | null
          qty?: number
          tenant_id?: string | null
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
          status: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          customer_instagram?: string | null
          customer_phone: string
          event_date: string
          event_type: string
          id?: number
          status?: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          customer_instagram?: string | null
          customer_phone?: string
          event_date?: string
          event_type?: string
          id?: number
          status?: string
          tenant_id?: string | null
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
      customer_tag_assignments: {
        Row: {
          assigned_at: string | null
          customer_id: number
          id: number
          tag_id: number
          tenant_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          customer_id: number
          id?: number
          tag_id: number
          tenant_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          customer_id?: number
          id?: number
          tag_id?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_tag_assignments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "customer_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tag_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tags: {
        Row: {
          color: string | null
          created_at: string | null
          id: number
          name: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: number
          name: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: number
          name?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_tags_tenant_id_fkey"
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
          id: number
          tenant_id: string | null
          updated_at: string | null
          whatsapp_group_name: string
        }
        Insert: {
          created_at?: string | null
          customer_name?: string | null
          customer_phone: string
          id?: number
          tenant_id?: string | null
          updated_at?: string | null
          whatsapp_group_name: string
        }
        Update: {
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string
          id?: number
          tenant_id?: string | null
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
          id: number
          name: string
          number: string | null
          phone: string
          state: string | null
          street: string | null
          tenant_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          cep?: string | null
          city?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string | null
          id?: number
          name: string
          number?: string | null
          phone: string
          state?: string | null
          street?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          cep?: string | null
          city?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string | null
          id?: number
          name?: string
          number?: string | null
          phone?: string
          state?: string | null
          street?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string | null
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
      frete_config: {
        Row: {
          access_token: string | null
          api_base_url: string
          cep_origem: string | null
          client_id: string | null
          client_secret: string | null
          created_at: string
          id: number
          localidade_retirada_url: string | null
          redirect_uri: string | null
          refresh_token: string | null
          remetente_bairro: string | null
          remetente_cidade: string | null
          remetente_documento: string | null
          remetente_email: string | null
          remetente_endereco_comp: string | null
          remetente_endereco_numero: string | null
          remetente_endereco_rua: string | null
          remetente_nome: string | null
          remetente_telefone: string | null
          remetente_uf: string | null
          tenant_id: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          api_base_url?: string
          cep_origem?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          id?: number
          localidade_retirada_url?: string | null
          redirect_uri?: string | null
          refresh_token?: string | null
          remetente_bairro?: string | null
          remetente_cidade?: string | null
          remetente_documento?: string | null
          remetente_email?: string | null
          remetente_endereco_comp?: string | null
          remetente_endereco_numero?: string | null
          remetente_endereco_rua?: string | null
          remetente_nome?: string | null
          remetente_telefone?: string | null
          remetente_uf?: string | null
          tenant_id?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          api_base_url?: string
          cep_origem?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          id?: number
          localidade_retirada_url?: string | null
          redirect_uri?: string | null
          refresh_token?: string | null
          remetente_bairro?: string | null
          remetente_cidade?: string | null
          remetente_documento?: string | null
          remetente_email?: string | null
          remetente_endereco_comp?: string | null
          remetente_endereco_numero?: string | null
          remetente_endereco_rua?: string | null
          remetente_nome?: string | null
          remetente_telefone?: string | null
          remetente_uf?: string | null
          tenant_id?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "frete_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      frete_cotacoes: {
        Row: {
          altura: number
          cep_destino: string
          comprimento: number
          created_at: string
          id: number
          largura: number
          pedido_id: number | null
          peso: number
          prazo: number | null
          raw_response: Json | null
          servico_escolhido: string | null
          tenant_id: string | null
          transportadora: string | null
          valor_declarado: number | null
          valor_frete: number | null
        }
        Insert: {
          altura: number
          cep_destino: string
          comprimento: number
          created_at?: string
          id?: number
          largura: number
          pedido_id?: number | null
          peso: number
          prazo?: number | null
          raw_response?: Json | null
          servico_escolhido?: string | null
          tenant_id?: string | null
          transportadora?: string | null
          valor_declarado?: number | null
          valor_frete?: number | null
        }
        Update: {
          altura?: number
          cep_destino?: string
          comprimento?: number
          created_at?: string
          id?: number
          largura?: number
          pedido_id?: number | null
          peso?: number
          prazo?: number | null
          raw_response?: Json | null
          servico_escolhido?: string | null
          tenant_id?: string | null
          transportadora?: string | null
          valor_declarado?: number | null
          valor_frete?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "frete_cotacoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      frete_envios: {
        Row: {
          created_at: string
          id: number
          label_url: string | null
          pedido_id: number | null
          raw_response: Json | null
          shipment_id: string | null
          status: string | null
          tenant_id: string | null
          tracking_code: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          label_url?: string | null
          pedido_id?: number | null
          raw_response?: Json | null
          shipment_id?: string | null
          status?: string | null
          tenant_id?: string | null
          tracking_code?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          label_url?: string | null
          pedido_id?: number | null
          raw_response?: Json | null
          shipment_id?: string | null
          status?: string | null
          tenant_id?: string | null
          tracking_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "frete_envios_tenant_id_fkey"
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
      integration_me: {
        Row: {
          access_token: string | null
          account_id: string | null
          client_id: string | null
          client_secret: string | null
          created_at: string | null
          id: string
          redirect_uri: string | null
          refresh_token: string | null
          tenant_id: string
          updated_at: string | null
          webhook_secret: string
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string | null
          id?: string
          redirect_uri?: string | null
          refresh_token?: string | null
          tenant_id: string
          updated_at?: string | null
          webhook_secret?: string
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string | null
          id?: string
          redirect_uri?: string | null
          refresh_token?: string | null
          tenant_id?: string
          updated_at?: string | null
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_me_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
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
          created_at: string | null
          id: string
          public_base_url: string | null
          public_key: string | null
          redirect_uri: string | null
          tenant_id: string
          updated_at: string | null
          webhook_secret: string
        }
        Insert: {
          access_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string | null
          id?: string
          public_base_url?: string | null
          public_key?: string | null
          redirect_uri?: string | null
          tenant_id: string
          updated_at?: string | null
          webhook_secret?: string
        }
        Update: {
          access_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string | null
          id?: string
          public_base_url?: string | null
          public_key?: string | null
          redirect_uri?: string | null
          tenant_id?: string
          updated_at?: string | null
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_mp_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_wpp: {
        Row: {
          business_phone: string
          created_at: string | null
          id: string
          instance_name: string
          session_status: string | null
          tenant_id: string
          updated_at: string | null
          webhook_secret: string
        }
        Insert: {
          business_phone: string
          created_at?: string | null
          id?: string
          instance_name: string
          session_status?: string | null
          tenant_id: string
          updated_at?: string | null
          webhook_secret?: string
        }
        Update: {
          business_phone?: string
          created_at?: string | null
          id?: string
          instance_name?: string
          session_status?: string | null
          tenant_id?: string
          updated_at?: string | null
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_wpp_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cart_id: number | null
          created_at: string | null
          customer_phone: string
          event_date: string
          event_type: string
          id: number
          is_paid: boolean
          item_added_message_sent: boolean | null
          observation: string | null
          payment_confirmation_sent: boolean | null
          payment_link: string | null
          printed: boolean | null
          tenant_id: string | null
          total_amount: number
          whatsapp_group_name: string | null
        }
        Insert: {
          cart_id?: number | null
          created_at?: string | null
          customer_phone: string
          event_date: string
          event_type: string
          id?: number
          is_paid?: boolean
          item_added_message_sent?: boolean | null
          observation?: string | null
          payment_confirmation_sent?: boolean | null
          payment_link?: string | null
          printed?: boolean | null
          tenant_id?: string | null
          total_amount: number
          whatsapp_group_name?: string | null
        }
        Update: {
          cart_id?: number | null
          created_at?: string | null
          customer_phone?: string
          event_date?: string
          event_type?: string
          id?: number
          is_paid?: boolean
          item_added_message_sent?: boolean | null
          observation?: string | null
          payment_confirmation_sent?: boolean | null
          payment_link?: string | null
          printed?: boolean | null
          tenant_id?: string | null
          total_amount?: number
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
      products: {
        Row: {
          code: string
          id: number
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          stock: number
          tenant_id: string | null
        }
        Insert: {
          code: string
          id?: number
          image_url?: string | null
          is_active?: boolean
          name: string
          price: number
          stock?: number
          tenant_id?: string | null
        }
        Update: {
          code?: string
          id?: number
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          stock?: number
          tenant_id?: string | null
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
          tenant_role: Database["public"]["Enums"]["user_tenant_role"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id?: string | null
          tenant_role?: Database["public"]["Enums"]["user_tenant_role"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id?: string | null
          tenant_role?: Database["public"]["Enums"]["user_tenant_role"] | null
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
      tenants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          melhor_envio_env: string | null
          melhor_envio_from_cep: string | null
          name: string
          slug: string
          tenant_key: string
          updated_at: string
          whatsapp_api_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          melhor_envio_env?: string | null
          melhor_envio_from_cep?: string | null
          name: string
          slug: string
          tenant_key: string
          updated_at?: string
          whatsapp_api_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          melhor_envio_env?: string | null
          melhor_envio_from_cep?: string | null
          name?: string
          slug?: string
          tenant_key?: string
          updated_at?: string
          whatsapp_api_url?: string | null
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
          tenant_id: string
          webhook_type: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          response?: string | null
          status_code: number
          tenant_id: string
          webhook_type: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          response?: string | null
          status_code?: number
          tenant_id?: string
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
          created_at: string
          id: number
          message: string
          order_id: number | null
          phone: string
          processed: boolean | null
          product_name: string | null
          received_at: string | null
          sent_at: string | null
          tenant_id: string | null
          type: string
          updated_at: string
          whatsapp_group_name: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: number
          message: string
          order_id?: number | null
          phone: string
          processed?: boolean | null
          product_name?: string | null
          received_at?: string | null
          sent_at?: string | null
          tenant_id?: string | null
          type: string
          updated_at?: string
          whatsapp_group_name?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: number
          message?: string
          order_id?: number | null
          phone?: string
          processed?: boolean | null
          product_name?: string | null
          received_at?: string | null
          sent_at?: string | null
          tenant_id?: string | null
          type?: string
          updated_at?: string
          whatsapp_group_name?: string | null
        }
        Relationships: [
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
          created_at: string
          id: number
          tenant_id: string | null
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: number
          tenant_id?: string | null
          title?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: number
          tenant_id?: string | null
          title?: string | null
          type?: string
          updated_at?: string
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
      get_current_user_tenant_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_user_role: {
        Args: { user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
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
      is_admin_or_master: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_master_user: {
        Args: Record<PropertyKey, never>
        Returns: boolean
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
      user_role: "admin" | "customer"
      user_tenant_role: "master" | "admin" | "user"
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
      user_role: ["admin", "customer"],
      user_tenant_role: ["master", "admin", "user"],
    },
  },
} as const
