export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      movies: {
        Row: {
          tmdb_id: number;
          original_title: string | null;
          release_year: number | null;
          runtime: number | null;
          poster_path: string | null;
          overview: string | null;
          tagline: string | null;
          vote_average: number | null;
          popularity: number | null;
          original_language: string | null;
          director: string | null;
          genres: number[] | null;
          keywords: string[] | null;
          updated_at: string | null;
        };
        Insert: {
          tmdb_id: number;
          original_title?: string | null;
          release_year?: number | null;
          runtime?: number | null;
          poster_path?: string | null;
          overview?: string | null;
          tagline?: string | null;
          vote_average?: number | null;
          popularity?: number | null;
          original_language?: string | null;
          director?: string | null;
          genres?: number[] | null;
          keywords?: string[] | null;
          updated_at?: string | null;
        };
        Update: {
          tmdb_id?: number;
          original_title?: string | null;
          release_year?: number | null;
          runtime?: number | null;
          poster_path?: string | null;
          overview?: string | null;
          tagline?: string | null;
          vote_average?: number | null;
          popularity?: number | null;
          original_language?: string | null;
          director?: string | null;
          genres?: number[] | null;
          keywords?: string[] | null;
          updated_at?: string | null;
        };
      };
      movie_titles: {
        Row: {
          id: number;
          tmdb_id: number;
          title: string;
          language: string;
          country: string | null;
          is_original: boolean | null;
          is_primary: boolean | null;
          source: string | null;
          embedding_title: number[] | null;
        };
        Insert: {
          id?: number;
          tmdb_id: number;
          title: string;
          language: string;
          country?: string | null;
          is_original?: boolean | null;
          is_primary?: boolean | null;
          source?: string | null;
          embedding_title?: number[] | null;
        };
        Update: {
          id?: number;
          tmdb_id?: number;
          title?: string;
          language?: string;
          country?: string | null;
          is_original?: boolean | null;
          is_primary?: boolean | null;
          source?: string | null;
          embedding_title?: number[] | null;
        };
      };
      movie_profiles: {
        Row: {
          tmdb_id: number;
          profile_text: string | null;
          embedding: number[] | null;
          updated_at: string | null;
        };
        Insert: {
          tmdb_id: number;
          profile_text?: string | null;
          embedding?: number[] | null;
          updated_at?: string | null;
        };
        Update: {
          tmdb_id?: number;
          profile_text?: string | null;
          embedding?: number[] | null;
          updated_at?: string | null;
        };
      };
      movie_platforms: {
        Row: {
          tmdb_id: number;
          country: string;
          provider_name: string;
        };
        Insert: {
          tmdb_id: number;
          country: string;
          provider_name: string;
        };
        Update: {
          tmdb_id?: number;
          country?: string;
          provider_name?: string;
        };
      };
      user_preferences: {
        Row: {
          user_id: string;
          locale: string | null;
          preferred_platforms: string[] | null;
          facet_weights: Json | null;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          locale?: string | null;
          preferred_platforms?: string[] | null;
          facet_weights?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: string;
          locale?: string | null;
          preferred_platforms?: string[] | null;
          facet_weights?: Json | null;
          updated_at?: string | null;
        };
      };
      feedback_events: {
        Row: {
          id: number;
          user_id: string | null;
          tmdb_id: number | null;
          event_type: string | null;
          query_raw: string | null;
          facets: Json | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id?: string | null;
          tmdb_id?: number | null;
          event_type?: string | null;
          query_raw?: string | null;
          facets?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string | null;
          tmdb_id?: number | null;
          event_type?: string | null;
          query_raw?: string | null;
          facets?: Json | null;
          created_at?: string;
        };
      };
      search_quality: {
        Row: {
          id: number;
          user_id: string | null;
          query_raw: string | null;
          top1_score: number | null;
          top1_top2_gap: number | null;
          diversity_score: number | null;
          hidden_gems_ratio: number | null;
          passed: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id?: string | null;
          query_raw?: string | null;
          top1_score?: number | null;
          top1_top2_gap?: number | null;
          diversity_score?: number | null;
          hidden_gems_ratio?: number | null;
          passed?: boolean | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string | null;
          query_raw?: string | null;
          top1_score?: number | null;
          top1_top2_gap?: number | null;
          diversity_score?: number | null;
          hidden_gems_ratio?: number | null;
          passed?: boolean | null;
          created_at?: string;
        };
      };
    };
  };
}
