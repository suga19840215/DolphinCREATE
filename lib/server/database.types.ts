export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  app: {
    Tables: {
      session_activity: {
        Row: {
          last_seen_at: string;
          session_id: string;
          started_at: string;
          user_id: string;
        };
        Insert: {
          last_seen_at: string;
          session_id: string;
          started_at: string;
          user_id: string;
        };
        Update: {
          last_seen_at?: string;
          session_id?: string;
          started_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: { fid: string; roles?: Database["app"]["Enums"]["role"][] };
        Returns: boolean;
      };
      purge_old_auth_audit: { Args: Record<PropertyKey, never>; Returns: number };
      role_requires_mfa: { Args: { r: Database["app"]["Enums"]["role"] }; Returns: boolean };
      session_ok: { Args: Record<PropertyKey, never>; Returns: boolean };
      touch_session: { Args: Record<PropertyKey, never>; Returns: boolean };
      try_uuid: { Args: { t: string }; Returns: string };
    };
    Enums: {
      facility_kind: "hq" | "venue";
      role: "hq_admin" | "marketing" | "creative" | "facility_admin" | "venue_staff" | "viewer";
      user_status: "invited" | "active" | "suspended";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      app_user: {
        Row: {
          created_at: string;
          created_by: string | null;
          display_name: string;
          email: string;
          facility_id: string;
          failed_login_count: number;
          id: string;
          last_login_at: string | null;
          lock_count: number;
          locked_until: string | null;
          status: Database["app"]["Enums"]["user_status"];
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          display_name: string;
          email: string;
          facility_id: string;
          failed_login_count?: number;
          id: string;
          last_login_at?: string | null;
          lock_count?: number;
          locked_until?: string | null;
          status?: Database["app"]["Enums"]["user_status"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          display_name?: string;
          email?: string;
          facility_id?: string;
          failed_login_count?: number;
          id?: string;
          last_login_at?: string | null;
          lock_count?: number;
          locked_until?: string | null;
          status?: Database["app"]["Enums"]["user_status"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "app_user_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
            referencedColumns: ["id"];
          },
        ];
      };
      auth_audit: {
        Row: {
          actor_id: string | null;
          at: string;
          detail: NonNullable<Json>;
          email_entered: string | null;
          event: string;
          facility_id: string;
          id: number;
          ip: string | null;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          actor_id?: string | null;
          at?: string;
          detail?: NonNullable<Json>;
          email_entered?: string | null;
          event: string;
          facility_id: string;
          id?: never;
          ip?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          actor_id?: string | null;
          at?: string;
          detail?: NonNullable<Json>;
          email_entered?: string | null;
          event?: string;
          facility_id?: string;
          id?: never;
          ip?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "auth_audit_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "app_user";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "auth_audit_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "auth_audit_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "app_user";
            referencedColumns: ["id"];
          },
        ];
      };
      facility: {
        Row: {
          code: string;
          created_at: string;
          facility_id: string;
          fee_rate_bp: number;
          id: string;
          is_demo: boolean;
          kind: Database["app"]["Enums"]["facility_kind"];
          lp_domain: string | null;
          min_n: number;
          monthly_budget_cap_yen: number | null;
          name: string;
          region: string | null;
          sub: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          facility_id?: never;
          fee_rate_bp?: number;
          id?: string;
          is_demo?: boolean;
          kind?: Database["app"]["Enums"]["facility_kind"];
          lp_domain?: string | null;
          min_n?: number;
          monthly_budget_cap_yen?: number | null;
          name: string;
          region?: string | null;
          sub?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          facility_id?: never;
          fee_rate_bp?: number;
          id?: string;
          is_demo?: boolean;
          kind?: Database["app"]["Enums"]["facility_kind"];
          lp_domain?: string | null;
          min_n?: number;
          monthly_budget_cap_yen?: number | null;
          name?: string;
          region?: string | null;
          sub?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      operation_log: {
        Row: {
          action: string;
          actor_id: string | null;
          at: string;
          detail: NonNullable<Json>;
          facility_id: string;
          id: number;
          target_id: string | null;
          target_type: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          at?: string;
          detail?: NonNullable<Json>;
          facility_id: string;
          id?: never;
          target_id?: string | null;
          target_type?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          at?: string;
          detail?: NonNullable<Json>;
          facility_id?: string;
          id?: never;
          target_id?: string | null;
          target_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "operation_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "app_user";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "operation_log_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
            referencedColumns: ["id"];
          },
        ];
      };
      user_facility_role: {
        Row: {
          created_at: string;
          created_by: string | null;
          facility_id: string;
          id: string;
          role: Database["app"]["Enums"]["role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          facility_id: string;
          id?: string;
          role: Database["app"]["Enums"]["role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          facility_id?: string;
          id?: string;
          role?: Database["app"]["Enums"]["role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_facility_role_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_facility_role_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "app_user";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      touch_session: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  app: {
    Enums: {
      facility_kind: ["hq", "venue"],
      role: ["hq_admin", "marketing", "creative", "facility_admin", "venue_staff", "viewer"],
      user_status: ["invited", "active", "suspended"],
    },
  },
  public: {
    Enums: {},
  },
} as const;
