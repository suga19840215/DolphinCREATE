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
      can_import: {
        Args: { fid: string; kind: Database["app"]["Enums"]["import_kind"] };
        Returns: boolean;
      };
      can_write_import_rows: {
        Args: { fid: string; job: string; kind: Database["app"]["Enums"]["import_kind"] };
        Returns: boolean;
      };
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
      import_kind: "consultation" | "crm" | "ads" | "ga4" | "images" | "market_report";
      media: "google_search" | "demand_gen" | "meta";
      outcome: "contracted" | "not_contracted" | "pending";
      provider: "ga4" | "meta" | "google_ads" | "dolphin";
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
      asset: {
        Row: {
          approval_status: string;
          code: string;
          created_at: string;
          expires_on: string | null;
          facility_id: string;
          gen_prompt: string | null;
          gen_target: string | null;
          id: string;
          import_job_id: string | null;
          kind: string;
          rights_status: string;
          source: string | null;
          storage_path: string | null;
          title: string | null;
        };
        Insert: {
          approval_status?: string;
          code: string;
          created_at?: string;
          expires_on?: string | null;
          facility_id: string;
          gen_prompt?: string | null;
          gen_target?: string | null;
          id?: string;
          import_job_id?: string | null;
          kind: string;
          rights_status?: string;
          source?: string | null;
          storage_path?: string | null;
          title?: string | null;
        };
        Update: {
          approval_status?: string;
          code?: string;
          created_at?: string;
          expires_on?: string | null;
          facility_id?: string;
          gen_prompt?: string | null;
          gen_target?: string | null;
          id?: string;
          import_job_id?: string | null;
          kind?: string;
          rights_status?: string;
          source?: string | null;
          storage_path?: string | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "asset_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_job";
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
      consent_record: {
        Row: {
          ad_improvement: boolean;
          analysis: boolean | null;
          consultation_id: string;
          facility_id: string;
          given_at: string | null;
          id: string;
          import_job_id: string;
          recording: boolean | null;
          text_version: string | null;
          transcription: boolean | null;
          withdrawn_at: string | null;
        };
        Insert: {
          ad_improvement: boolean;
          analysis?: boolean | null;
          consultation_id: string;
          facility_id: string;
          given_at?: string | null;
          id?: string;
          import_job_id: string;
          recording?: boolean | null;
          text_version?: string | null;
          transcription?: boolean | null;
          withdrawn_at?: string | null;
        };
        Update: {
          ad_improvement?: boolean;
          analysis?: boolean | null;
          consultation_id?: string;
          facility_id?: string;
          given_at?: string | null;
          id?: string;
          import_job_id?: string;
          recording?: boolean | null;
          text_version?: string | null;
          transcription?: boolean | null;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "consent_record_consultation_id_fkey";
            columns: ["consultation_id"];
            isOneToOne: false;
            referencedRelation: "consultation_session";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consent_record_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consent_record_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_job";
            referencedColumns: ["id"];
          },
        ];
      };
      consultation_session: {
        Row: {
          ad_id: string | null;
          age_band: string | null;
          area_band: string | null;
          cluster_code: string | null;
          competitor_name: string | null;
          consulted_at: string | null;
          created_at: string;
          decision_factor: string | null;
          external_id: string;
          facility_id: string;
          id: string;
          import_job_id: string;
          lead_id: string;
          noncontract_reason: string | null;
          outcome: Database["app"]["Enums"]["outcome"] | null;
          source: string | null;
          staff_code: string | null;
          visit_motive: string | null;
        };
        Insert: {
          ad_id?: string | null;
          age_band?: string | null;
          area_band?: string | null;
          cluster_code?: string | null;
          competitor_name?: string | null;
          consulted_at?: string | null;
          created_at?: string;
          decision_factor?: string | null;
          external_id: string;
          facility_id: string;
          id?: string;
          import_job_id: string;
          lead_id: string;
          noncontract_reason?: string | null;
          outcome?: Database["app"]["Enums"]["outcome"] | null;
          source?: string | null;
          staff_code?: string | null;
          visit_motive?: string | null;
        };
        Update: {
          ad_id?: string | null;
          age_band?: string | null;
          area_band?: string | null;
          cluster_code?: string | null;
          competitor_name?: string | null;
          consulted_at?: string | null;
          created_at?: string;
          decision_factor?: string | null;
          external_id?: string;
          facility_id?: string;
          id?: string;
          import_job_id?: string;
          lead_id?: string;
          noncontract_reason?: string | null;
          outcome?: Database["app"]["Enums"]["outcome"] | null;
          source?: string | null;
          staff_code?: string | null;
          visit_motive?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "consultation_session_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consultation_session_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_job";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_lead: {
        Row: {
          ad_id: string | null;
          cancelled_at: string | null;
          channel: string | null;
          click_id: string | null;
          contracted_at: string | null;
          facility_id: string;
          ga4_client_id: string | null;
          gross_profit_yen: number | null;
          id: string;
          import_job_id: string;
          is_valid: boolean | null;
          lead_id: string;
          lost_reason: string | null;
          outcome: Database["app"]["Enums"]["outcome"] | null;
          reserved_at: string | null;
          revenue_yen: number | null;
          updated_at: string;
          utm_campaign: string | null;
          utm_content: string | null;
          utm_medium: string | null;
          utm_source: string | null;
          utm_term: string | null;
          visited_at: string | null;
        };
        Insert: {
          ad_id?: string | null;
          cancelled_at?: string | null;
          channel?: string | null;
          click_id?: string | null;
          contracted_at?: string | null;
          facility_id: string;
          ga4_client_id?: string | null;
          gross_profit_yen?: number | null;
          id?: string;
          import_job_id: string;
          is_valid?: boolean | null;
          lead_id: string;
          lost_reason?: string | null;
          outcome?: Database["app"]["Enums"]["outcome"] | null;
          reserved_at?: string | null;
          revenue_yen?: number | null;
          updated_at?: string;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          utm_term?: string | null;
          visited_at?: string | null;
        };
        Update: {
          ad_id?: string | null;
          cancelled_at?: string | null;
          channel?: string | null;
          click_id?: string | null;
          contracted_at?: string | null;
          facility_id?: string;
          ga4_client_id?: string | null;
          gross_profit_yen?: number | null;
          id?: string;
          import_job_id?: string;
          is_valid?: boolean | null;
          lead_id?: string;
          lost_reason?: string | null;
          outcome?: Database["app"]["Enums"]["outcome"] | null;
          reserved_at?: string | null;
          revenue_yen?: number | null;
          updated_at?: string;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          utm_term?: string | null;
          visited_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "crm_lead_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_lead_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_job";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_insight: {
        Row: {
          confidence: number | null;
          consultation_id: string;
          explicit_or_inferred: string | null;
          facility_id: string;
          id: string;
          kind: string;
          label: string;
          rank: number | null;
        };
        Insert: {
          confidence?: number | null;
          consultation_id: string;
          explicit_or_inferred?: string | null;
          facility_id: string;
          id?: string;
          kind: string;
          label: string;
          rank?: number | null;
        };
        Update: {
          confidence?: number | null;
          consultation_id?: string;
          explicit_or_inferred?: string | null;
          facility_id?: string;
          id?: string;
          kind?: string;
          label?: string;
          rank?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "customer_insight_consultation_id_fkey";
            columns: ["consultation_id"];
            isOneToOne: false;
            referencedRelation: "consultation_session";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_insight_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
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
      facility_connection: {
        Row: {
          account_ref: string;
          created_at: string;
          created_by: string | null;
          enabled: boolean;
          external_facility_id: string | null;
          facility_id: string;
          id: string;
          last_error: string | null;
          last_status: string | null;
          last_synced_at: string | null;
          provider: Database["app"]["Enums"]["provider"];
          secret_encrypted: string | null;
          secret_expires_at: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          account_ref: string;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          external_facility_id?: string | null;
          facility_id: string;
          id?: string;
          last_error?: string | null;
          last_status?: string | null;
          last_synced_at?: string | null;
          provider: Database["app"]["Enums"]["provider"];
          secret_encrypted?: string | null;
          secret_expires_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          account_ref?: string;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          external_facility_id?: string | null;
          facility_id?: string;
          id?: string;
          last_error?: string | null;
          last_status?: string | null;
          last_synced_at?: string | null;
          provider?: Database["app"]["Enums"]["provider"];
          secret_encrypted?: string | null;
          secret_expires_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "facility_connection_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "app_user";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "facility_connection_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "facility_connection_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "app_user";
            referencedColumns: ["id"];
          },
        ];
      };
      funnel_event: {
        Row: {
          ad_id: string;
          date: string;
          facility_id: string;
          form_error: number;
          form_start: number;
          generate_lead: number;
          id: string;
          import_job_id: string;
          landing_page: string;
          lp_sessions: number;
          select_fair: number;
          updated_at: string;
          view_fair: number;
        };
        Insert: {
          ad_id: string;
          date: string;
          facility_id: string;
          form_error?: number;
          form_start?: number;
          generate_lead?: number;
          id?: string;
          import_job_id: string;
          landing_page?: string;
          lp_sessions?: number;
          select_fair?: number;
          updated_at?: string;
          view_fair?: number;
        };
        Update: {
          ad_id?: string;
          date?: string;
          facility_id?: string;
          form_error?: number;
          form_start?: number;
          generate_lead?: number;
          id?: string;
          import_job_id?: string;
          landing_page?: string;
          lp_sessions?: number;
          select_fair?: number;
          updated_at?: string;
          view_fair?: number;
        };
        Relationships: [
          {
            foreignKeyName: "funnel_event_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "funnel_event_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_job";
            referencedColumns: ["id"];
          },
        ];
      };
      import_job: {
        Row: {
          at: string;
          encoding: string | null;
          facility_id: string;
          file_name: string;
          file_sha256: string;
          id: string;
          kind: Database["app"]["Enums"]["import_kind"];
          mapping: NonNullable<Json>;
          masked_count: number;
          media: Database["app"]["Enums"]["media"] | null;
          pii_columns_dropped: string[];
          rows_duplicate: number;
          rows_invalid: number;
          rows_missing: number;
          rows_no_consent: number;
          rows_ok: number;
          rows_total: number;
          rows_updated: number;
          rows_wrong_facility: number;
          run_by: string | null;
          run_label: string | null;
        };
        Insert: {
          at?: string;
          encoding?: string | null;
          facility_id: string;
          file_name: string;
          file_sha256: string;
          id?: string;
          kind: Database["app"]["Enums"]["import_kind"];
          mapping?: NonNullable<Json>;
          masked_count?: number;
          media?: Database["app"]["Enums"]["media"] | null;
          pii_columns_dropped?: string[];
          rows_duplicate?: number;
          rows_invalid?: number;
          rows_missing?: number;
          rows_no_consent?: number;
          rows_ok?: number;
          rows_total?: number;
          rows_updated?: number;
          rows_wrong_facility?: number;
          run_by?: string | null;
          run_label?: string | null;
        };
        Update: {
          at?: string;
          encoding?: string | null;
          facility_id?: string;
          file_name?: string;
          file_sha256?: string;
          id?: string;
          kind?: Database["app"]["Enums"]["import_kind"];
          mapping?: NonNullable<Json>;
          masked_count?: number;
          media?: Database["app"]["Enums"]["media"] | null;
          pii_columns_dropped?: string[];
          rows_duplicate?: number;
          rows_invalid?: number;
          rows_missing?: number;
          rows_no_consent?: number;
          rows_ok?: number;
          rows_total?: number;
          rows_updated?: number;
          rows_wrong_facility?: number;
          run_by?: string | null;
          run_label?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "import_job_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "import_job_run_by_fkey";
            columns: ["run_by"];
            isOneToOne: false;
            referencedRelation: "app_user";
            referencedColumns: ["id"];
          },
        ];
      };
      market_report: {
        Row: {
          area: string;
          avg_guests: number | null;
          avg_spend_yen: number | null;
          data_source: string;
          facility_id: string;
          id: string;
          import_job_id: string;
          market_weddings: number | null;
          notes: string | null;
          origin: string;
          payload: NonNullable<Json>;
          period_end: string;
          period_start: string;
          report_created_at: string;
          report_id: string;
          sample_size: number;
          version: number;
        };
        Insert: {
          area: string;
          avg_guests?: number | null;
          avg_spend_yen?: number | null;
          data_source: string;
          facility_id: string;
          id?: string;
          import_job_id: string;
          market_weddings?: number | null;
          notes?: string | null;
          origin?: string;
          payload?: NonNullable<Json>;
          period_end: string;
          period_start: string;
          report_created_at: string;
          report_id: string;
          sample_size: number;
          version: number;
        };
        Update: {
          area?: string;
          avg_guests?: number | null;
          avg_spend_yen?: number | null;
          data_source?: string;
          facility_id?: string;
          id?: string;
          import_job_id?: string;
          market_weddings?: number | null;
          notes?: string | null;
          origin?: string;
          payload?: NonNullable<Json>;
          period_end?: string;
          period_start?: string;
          report_created_at?: string;
          report_id?: string;
          sample_size?: number;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "market_report_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_report_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_job";
            referencedColumns: ["id"];
          },
        ];
      };
      media_daily_metric: {
        Row: {
          ad_group: string | null;
          ad_id: string;
          ad_name: string | null;
          asset_code: string | null;
          campaign: string | null;
          clicks: number;
          cost_yen: number;
          date: string;
          facility_id: string;
          id: string;
          import_job_id: string;
          impressions: number;
          media: Database["app"]["Enums"]["media"];
          media_reported_cv: number;
          source: string;
          updated_at: string;
        };
        Insert: {
          ad_group?: string | null;
          ad_id: string;
          ad_name?: string | null;
          asset_code?: string | null;
          campaign?: string | null;
          clicks?: number;
          cost_yen?: number;
          date: string;
          facility_id: string;
          id?: string;
          import_job_id: string;
          impressions?: number;
          media: Database["app"]["Enums"]["media"];
          media_reported_cv?: number;
          source?: string;
          updated_at?: string;
        };
        Update: {
          ad_group?: string | null;
          ad_id?: string;
          ad_name?: string | null;
          asset_code?: string | null;
          campaign?: string | null;
          clicks?: number;
          cost_yen?: number;
          date?: string;
          facility_id?: string;
          id?: string;
          import_job_id?: string;
          impressions?: number;
          media?: Database["app"]["Enums"]["media"];
          media_reported_cv?: number;
          source?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_daily_metric_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_daily_metric_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_job";
            referencedColumns: ["id"];
          },
        ];
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
      page_category: {
        Row: {
          created_at: string;
          created_by: string | null;
          facility_id: string;
          id: string;
          kind: string;
          label: string;
          prefix: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          facility_id: string;
          id?: string;
          kind: string;
          label: string;
          prefix: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          facility_id?: string;
          id?: string;
          kind?: string;
          label?: string;
          prefix?: string;
        };
        Relationships: [
          {
            foreignKeyName: "page_category_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "app_user";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "page_category_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
            referencedColumns: ["id"];
          },
        ];
      };
      site_metric: {
        Row: {
          date: string;
          dimension: string;
          engagement_sec: number;
          events: NonNullable<Json>;
          facility_id: string;
          id: string;
          import_job_id: string | null;
          key: string;
          new_users: number;
          page_views: number;
          sessions: number;
          sub_key: string;
          updated_at: string;
          users: number;
        };
        Insert: {
          date: string;
          dimension: string;
          engagement_sec?: number;
          events?: NonNullable<Json>;
          facility_id: string;
          id?: string;
          import_job_id?: string | null;
          key: string;
          new_users?: number;
          page_views?: number;
          sessions?: number;
          sub_key?: string;
          updated_at?: string;
          users?: number;
        };
        Update: {
          date?: string;
          dimension?: string;
          engagement_sec?: number;
          events?: NonNullable<Json>;
          facility_id?: string;
          id?: string;
          import_job_id?: string | null;
          key?: string;
          new_users?: number;
          page_views?: number;
          sessions?: number;
          sub_key?: string;
          updated_at?: string;
          users?: number;
        };
        Relationships: [
          {
            foreignKeyName: "site_metric_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facility";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_metric_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_job";
            referencedColumns: ["id"];
          },
        ];
      };
      transcript_segment: {
        Row: {
          confidence: number | null;
          consultation_id: string;
          end_sec: number | null;
          facility_id: string;
          id: string;
          speaker: string | null;
          start_sec: number | null;
          text_masked: string;
        };
        Insert: {
          confidence?: number | null;
          consultation_id: string;
          end_sec?: number | null;
          facility_id: string;
          id?: string;
          speaker?: string | null;
          start_sec?: number | null;
          text_masked: string;
        };
        Update: {
          confidence?: number | null;
          consultation_id?: string;
          end_sec?: number | null;
          facility_id?: string;
          id?: string;
          speaker?: string | null;
          start_sec?: number | null;
          text_masked?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transcript_segment_consultation_id_fkey";
            columns: ["consultation_id"];
            isOneToOne: false;
            referencedRelation: "consultation_session";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transcript_segment_facility_id_fkey";
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
      commit_ga4: { Args: { funnel: Json; job: Json; site: Json }; Returns: string };
      commit_import: { Args: { job: Json; rows: Json }; Returns: string };
      touch_session: { Args: Record<PropertyKey, never>; Returns: boolean };
      upsert_site_metrics: { Args: { fid: string; job: string; rows: Json }; Returns: number };
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
      import_kind: ["consultation", "crm", "ads", "ga4", "images", "market_report"],
      media: ["google_search", "demand_gen", "meta"],
      outcome: ["contracted", "not_contracted", "pending"],
      provider: ["ga4", "meta", "google_ads", "dolphin"],
      role: ["hq_admin", "marketing", "creative", "facility_admin", "venue_staff", "viewer"],
      user_status: ["invited", "active", "suspended"],
    },
  },
  public: {
    Enums: {},
  },
} as const;
