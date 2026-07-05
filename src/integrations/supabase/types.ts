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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      cashback_transactions: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          id: string
          reference_transaction_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description: string
          id?: string
          reference_transaction_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          id?: string
          reference_transaction_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      cashback_wallets: {
        Row: {
          balance: number
          created_at: string
          id: string
          total_earned: number
          total_withdrawn: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      data_bundles: {
        Row: {
          api_price: number
          app_price: number
          created_at: string | null
          data_type: string
          id: string
          is_active: boolean | null
          network_code: string
          plan_code: string
          plan_name: string
          provider: string | null
          updated_at: string | null
          validity: string | null
        }
        Insert: {
          api_price?: number
          app_price?: number
          created_at?: string | null
          data_type: string
          id?: string
          is_active?: boolean | null
          network_code: string
          plan_code: string
          plan_name: string
          provider?: string | null
          updated_at?: string | null
          validity?: string | null
        }
        Update: {
          api_price?: number
          app_price?: number
          created_at?: string | null
          data_type?: string
          id?: string
          is_active?: boolean | null
          network_code?: string
          plan_code?: string
          plan_name?: string
          provider?: string | null
          updated_at?: string | null
          validity?: string | null
        }
        Relationships: []
      }
      login_sessions: {
        Row: {
          device_info: Json | null
          id: string
          ip_address: string | null
          is_suspicious: boolean | null
          logged_in_at: string
          platform: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          is_suspicious?: boolean | null
          logged_in_at?: string
          platform: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          is_suspicious?: boolean | null
          logged_in_at?: string
          platform?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          body: string
          data: Json | null
          failure_count: number
          id: string
          sent_at: string
          sent_by: string | null
          sent_count: number
          success_count: number
          target_type: string
          title: string
        }
        Insert: {
          body: string
          data?: Json | null
          failure_count?: number
          id?: string
          sent_at?: string
          sent_by?: string | null
          sent_count?: number
          success_count?: number
          target_type?: string
          title: string
        }
        Update: {
          body?: string
          data?: Json | null
          failure_count?: number
          id?: string
          sent_at?: string
          sent_by?: string | null
          sent_count?: number
          success_count?: number
          target_type?: string
          title?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      pricing_config: {
        Row: {
          created_at: string | null
          discount_percentage: number | null
          id: string
          is_active: boolean | null
          markup_percentage: number | null
          network_code: string | null
          service_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          discount_percentage?: number | null
          id?: string
          is_active?: boolean | null
          markup_percentage?: number | null
          network_code?: string | null
          service_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          discount_percentage?: number | null
          id?: string
          is_active?: boolean | null
          markup_percentage?: number | null
          network_code?: string | null
          service_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_number: string
          avatar_url: string | null
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_blocked: boolean | null
          phone: string
          referral_code: string
          referred_by: string | null
          updated_at: string
          user_id: string
          virtual_account_bank: string | null
          virtual_account_name: string | null
        }
        Insert: {
          account_number: string
          avatar_url?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_blocked?: boolean | null
          phone: string
          referral_code: string
          referred_by?: string | null
          updated_at?: string
          user_id: string
          virtual_account_bank?: string | null
          virtual_account_name?: string | null
        }
        Update: {
          account_number?: string
          avatar_url?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_blocked?: boolean | null
          phone?: string
          referral_code?: string
          referred_by?: string | null
          updated_at?: string
          user_id?: string
          virtual_account_bank?: string | null
          virtual_account_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_banners: {
        Row: {
          clicks: number | null
          created_at: string
          display_order: number | null
          id: string
          image_url: string
          impressions: number | null
          is_active: boolean | null
          title: string
          updated_at: string
        }
        Insert: {
          clicks?: number | null
          created_at?: string
          display_order?: number | null
          id?: string
          image_url: string
          impressions?: number | null
          is_active?: boolean | null
          title: string
          updated_at?: string
        }
        Update: {
          clicks?: number | null
          created_at?: string
          display_order?: number | null
          id?: string
          image_url?: string
          impressions?: number | null
          is_active?: boolean | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_notifications: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          message: string
          scheduled_at: string | null
          sent_at: string | null
          status: string | null
          target_audience: string | null
          target_users: string[] | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          message: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          target_audience?: string | null
          target_users?: string[] | null
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          message?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          target_audience?: string | null
          target_users?: string[] | null
          title?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string
          device_info: Json | null
          endpoint: string
          id: string
          p256dh: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          auth?: string | null
          created_at?: string
          device_info?: Json | null
          endpoint: string
          id?: string
          p256dh?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          auth?: string | null
          created_at?: string
          device_info?: Json | null
          endpoint?: string
          id?: string
          p256dh?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      referrals: {
        Row: {
          bonus_paid_at: string | null
          created_at: string
          id: string
          referee_bonus: number | null
          referee_id: string
          referrer_bonus: number | null
          referrer_id: string
          status: Database["public"]["Enums"]["referral_status"]
        }
        Insert: {
          bonus_paid_at?: string | null
          created_at?: string
          id?: string
          referee_bonus?: number | null
          referee_id: string
          referrer_bonus?: number | null
          referrer_id: string
          status?: Database["public"]["Enums"]["referral_status"]
        }
        Update: {
          bonus_paid_at?: string | null
          created_at?: string
          id?: string
          referee_bonus?: number | null
          referee_id?: string
          referrer_bonus?: number | null
          referrer_id?: string
          status?: Database["public"]["Enums"]["referral_status"]
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referee_id_fkey"
            columns: ["referee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["transaction_category"]
          created_at: string
          description: string
          id: string
          metadata: Json | null
          reference: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Insert: {
          amount: number
          category: Database["public"]["Enums"]["transaction_category"]
          created_at?: string
          description: string
          id?: string
          metadata?: Json | null
          reference?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["transaction_category"]
          created_at?: string
          description?: string
          id?: string
          metadata?: Json | null
          reference?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          type?: Database["public"]["Enums"]["transaction_type"]
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
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      block_all_web_users: { Args: never; Returns: undefined }
      deduct_wallet_balance: {
        Args: { _amount: number; _user_id: string }
        Returns: boolean
      }
      generate_account_number: { Args: never; Returns: string }
      generate_referral_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_user_blocked: { Args: { _user_id: string }; Returns: boolean }
      process_aspfiy_deposit: {
        Args: {
          p_amount: number
          p_description: string
          p_metadata: Json
          p_reference: string
          p_user_id: string
        }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "user"
      referral_status: "pending" | "completed" | "bonus_paid"
      transaction_category:
        | "deposit"
        | "airtime"
        | "data"
        | "electricity"
        | "tv"
        | "transfer"
        | "referral_bonus"
      transaction_status: "pending" | "completed" | "failed"
      transaction_type: "credit" | "debit"
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
      referral_status: ["pending", "completed", "bonus_paid"],
      transaction_category: [
        "deposit",
        "airtime",
        "data",
        "electricity",
        "tv",
        "transfer",
        "referral_bonus",
      ],
      transaction_status: ["pending", "completed", "failed"],
      transaction_type: ["credit", "debit"],
    },
  },
} as const
