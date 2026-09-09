export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      valuation_profiles: {
        Row: {
          created_at: string;
          current_eps_override: number | null;
          eps_basis: string;
          estimated_growth: number;
          exit_multiple: number | null;
          exit_multiple_source: string;
          growth_source: string;
          id: string;
          margin_of_safety_target: number;
          required_return: number;
          source: string;
          ticker: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          current_eps_override?: number | null;
          eps_basis?: string;
          estimated_growth: number;
          exit_multiple?: number | null;
          exit_multiple_source?: string;
          growth_source?: string;
          id?: string;
          margin_of_safety_target?: number;
          required_return?: number;
          source?: string;
          ticker: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          current_eps_override?: number | null;
          eps_basis?: string;
          estimated_growth?: number;
          exit_multiple?: number | null;
          exit_multiple_source?: string;
          growth_source?: string;
          id?: string;
          margin_of_safety_target?: number;
          required_return?: number;
          source?: string;
          ticker?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      portfolio_settings: {
        Row: {
          base_currency: string;
          created_at: string;
          critical_utilization: number;
          id: string;
          moderate_utilization: number;
          net_liquidation: number;
          net_liquidation_usd: number | null;
          source: string;
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          base_currency?: string;
          created_at?: string;
          critical_utilization?: number;
          id?: string;
          moderate_utilization?: number;
          net_liquidation: number;
          net_liquidation_usd?: number | null;
          source?: string;
          updated_at?: string;
          user_id?: string;
          workspace_id: string;
        };
        Update: {
          base_currency?: string;
          created_at?: string;
          critical_utilization?: number;
          id?: string;
          moderate_utilization?: number;
          net_liquidation?: number;
          net_liquidation_usd?: number | null;
          source?: string;
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portfolio_settings_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      portfolio_positions: {
        Row: {
          asset_class: string;
          buying_power_used: number | null;
          comment: string | null;
          created_at: string;
          data_quality: string;
          direction: string | null;
          expiry: string | null;
          id: string;
          long_strike: number | null;
          notional: number | null;
          quantity: number | null;
          short_strike: number | null;
          source: string;
          strategy: string | null;
          symbol: string;
          underlying_price: number | null;
          updated_at: string;
          user_id: string;
          weight: number | null;
          workspace_id: string;
        };
        Insert: {
          asset_class: string;
          buying_power_used?: number | null;
          comment?: string | null;
          created_at?: string;
          data_quality?: string;
          direction?: string | null;
          expiry?: string | null;
          id?: string;
          long_strike?: number | null;
          notional?: number | null;
          quantity?: number | null;
          short_strike?: number | null;
          source?: string;
          strategy?: string | null;
          symbol: string;
          underlying_price?: number | null;
          updated_at?: string;
          user_id?: string;
          weight?: number | null;
          workspace_id: string;
        };
        Update: {
          asset_class?: string;
          buying_power_used?: number | null;
          comment?: string | null;
          created_at?: string;
          data_quality?: string;
          direction?: string | null;
          expiry?: string | null;
          id?: string;
          long_strike?: number | null;
          notional?: number | null;
          quantity?: number | null;
          short_strike?: number | null;
          source?: string;
          strategy?: string | null;
          symbol?: string;
          underlying_price?: number | null;
          updated_at?: string;
          user_id?: string;
          weight?: number | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portfolio_positions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      option_strategy_templates: {
        Row: {
          created_at: string;
          default_buyback_target_pct: number;
          default_multiplier: number;
          id: string;
          kind: string;
          name: string;
          notes: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          default_buyback_target_pct?: number;
          default_multiplier?: number;
          id?: string;
          kind: string;
          name: string;
          notes?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          default_buyback_target_pct?: number;
          default_multiplier?: number;
          id?: string;
          kind?: string;
          name?: string;
          notes?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      option_trades: {
        Row: {
          actual_buyback_price: number | null;
          annualized_return: number | null;
          breakeven: number | null;
          buyback_target_pct: number;
          buyback_target_price: number | null;
          capital_at_risk: number | null;
          capital_at_risk_per_share: number | null;
          closed_at: string | null;
          contracts: number;
          created_at: string;
          data_quality: string;
          distance_to_price_pct: number | null;
          earnings_note: string | null;
          expiry: string;
          fees: number;
          id: string;
          long_strike: number | null;
          multiplier: number;
          net_premium: number | null;
          opened_at: string;
          premium: number;
          realized_annualized_return: number | null;
          return_on_risk: number | null;
          short_strike: number;
          source: string;
          spread_width: number | null;
          status: string;
          strategy_kind: string;
          total_premium: number | null;
          total_risk: number | null;
          underlying: string;
          underlying_price_open: number | null;
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          actual_buyback_price?: number | null;
          annualized_return?: number | null;
          breakeven?: number | null;
          buyback_target_pct?: number;
          buyback_target_price?: number | null;
          capital_at_risk?: number | null;
          capital_at_risk_per_share?: number | null;
          closed_at?: string | null;
          contracts?: number;
          created_at?: string;
          data_quality?: string;
          distance_to_price_pct?: number | null;
          earnings_note?: string | null;
          expiry: string;
          fees?: number;
          id?: string;
          long_strike?: number | null;
          multiplier?: number;
          net_premium?: number | null;
          opened_at: string;
          premium: number;
          realized_annualized_return?: number | null;
          return_on_risk?: number | null;
          short_strike: number;
          source?: string;
          spread_width?: number | null;
          status?: string;
          strategy_kind: string;
          total_premium?: number | null;
          total_risk?: number | null;
          underlying: string;
          underlying_price_open?: number | null;
          updated_at?: string;
          user_id?: string;
          workspace_id: string;
        };
        Update: {
          actual_buyback_price?: number | null;
          annualized_return?: number | null;
          breakeven?: number | null;
          buyback_target_pct?: number;
          buyback_target_price?: number | null;
          capital_at_risk?: number | null;
          capital_at_risk_per_share?: number | null;
          closed_at?: string | null;
          contracts?: number;
          created_at?: string;
          data_quality?: string;
          distance_to_price_pct?: number | null;
          earnings_note?: string | null;
          expiry?: string;
          fees?: number;
          id?: string;
          long_strike?: number | null;
          multiplier?: number;
          net_premium?: number | null;
          opened_at?: string;
          premium?: number;
          realized_annualized_return?: number | null;
          return_on_risk?: number | null;
          short_strike?: number;
          source?: string;
          spread_width?: number | null;
          status?: string;
          strategy_kind?: string;
          total_premium?: number | null;
          total_risk?: number | null;
          underlying?: string;
          underlying_price_open?: number | null;
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "option_trades_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      analysis_snapshots: {
        Row: {
          analysis: Json;
          company_name: string;
          created_at: string;
          currency: string;
          current_price: number | null;
          data_source: string | null;
          decision_rating: string | null;
          id: string;
          intrinsic_value: number | null;
          ticker: string;
          user_id: string;
        };
        Insert: {
          analysis: Json;
          company_name: string;
          created_at?: string;
          currency: string;
          current_price?: number | null;
          data_source?: string | null;
          decision_rating?: string | null;
          id?: string;
          intrinsic_value?: number | null;
          ticker: string;
          user_id?: string;
        };
        Update: {
          analysis?: Json;
          company_name?: string;
          created_at?: string;
          currency?: string;
          current_price?: number | null;
          data_source?: string | null;
          decision_rating?: string | null;
          id?: string;
          intrinsic_value?: number | null;
          ticker?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      assumptions: {
        Row: {
          created_at: string;
          estimated_growth: number;
          growth_source: string;
          id: string;
          required_return: number;
          ticker: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          estimated_growth: number;
          growth_source?: string;
          id?: string;
          required_return: number;
          ticker: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          estimated_growth?: number;
          growth_source?: string;
          id?: string;
          required_return?: number;
          ticker?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      notes: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          ticker: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body?: string;
          created_at?: string;
          id?: string;
          ticker: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          ticker?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      watchlist_items: {
        Row: {
          created_at: string;
          id: string;
          sort_order: number;
          ticker: string;
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          sort_order?: number;
          ticker: string;
          updated_at?: string;
          user_id?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          sort_order?: number;
          ticker?: string;
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "watchlist_items_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
