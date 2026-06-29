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
