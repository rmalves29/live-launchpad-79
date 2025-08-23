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
          product_id: number | null
          qty: number
          unit_price: number
        }
        Insert: {
          cart_id?: number | null
          created_at?: string | null
          id?: number
          product_id?: number | null
          qty?: number
          unit_price: number
        }
        Update: {
          cart_id?: number | null
          created_at?: string | null
          id?: number
          product_id?: number | null
          qty?: number
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
        }
        Insert: {
          created_at?: string | null
          customer_instagram?: string | null
          customer_phone: string
          event_date: string
          event_type: string
          id?: number
          status?: string
        }
        Update: {
          created_at?: string | null
          customer_instagram?: string | null
          customer_phone?: string
          event_date?: string
          event_type?: string
          id?: number
          status?: string
        }
        Relationships: []
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
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
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
          remetente_endereco_comp: string | null
          remetente_endereco_numero: string | null
          remetente_endereco_rua: string | null
          remetente_nome: string | null
          remetente_uf: string | null
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
          remetente_endereco_comp?: string | null
          remetente_endereco_numero?: string | null
          remetente_endereco_rua?: string | null
          remetente_nome?: string | null
          remetente_uf?: string | null
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
          remetente_endereco_comp?: string | null
          remetente_endereco_numero?: string | null
          remetente_endereco_rua?: string | null
          remetente_nome?: string | null
          remetente_uf?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
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
          transportadora?: string | null
          valor_declarado?: number | null
          valor_frete?: number | null
        }
        Relationships: []
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
          tracking_code?: string | null
          updated_at?: string
        }
        Relationships: []
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
          observation: string | null
          payment_link: string | null
          printed: boolean | null
          total_amount: number
        }
        Insert: {
          cart_id?: number | null
          created_at?: string | null
          customer_phone: string
          event_date: string
          event_type: string
          id?: number
          is_paid?: boolean
          observation?: string | null
          payment_link?: string | null
          printed?: boolean | null
          total_amount: number
        }
        Update: {
          cart_id?: number | null
          created_at?: string | null
          customer_phone?: string
          event_date?: string
          event_type?: string
          id?: number
          is_paid?: boolean
          observation?: string | null
          payment_link?: string | null
          printed?: boolean | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
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
        }
        Insert: {
          code: string
          id?: number
          image_url?: string | null
          is_active?: boolean
          name: string
          price: number
          stock?: number
        }
        Update: {
          code?: string
          id?: number
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          stock?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: []
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
          type: string
          updated_at: string
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
          type: string
          updated_at?: string
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
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          content: string
          created_at: string
          id: number
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: number
          title?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: number
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
    }
    Enums: {
      user_role: "admin" | "customer"
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
      user_role: ["admin", "customer"],
    },
  },
} as const
