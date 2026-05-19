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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          applicant_id: string
          created_at: string
          evaluator_id: string | null
          evaluator_remarks: string | null
          finalized_at: string | null
          full_name: string
          id: string
          prior_program: string | null
          prior_school: string | null
          program_id: string
          status: Database["public"]["Enums"]["app_status"]
          years_experience: number | null
        }
        Insert: {
          applicant_id: string
          created_at?: string
          evaluator_id?: string | null
          evaluator_remarks?: string | null
          finalized_at?: string | null
          full_name: string
          id?: string
          prior_program?: string | null
          prior_school?: string | null
          program_id: string
          status?: Database["public"]["Enums"]["app_status"]
          years_experience?: number | null
        }
        Update: {
          applicant_id?: string
          created_at?: string
          evaluator_id?: string | null
          evaluator_remarks?: string | null
          finalized_at?: string | null
          full_name?: string
          id?: string
          prior_program?: string | null
          prior_school?: string | null
          program_id?: string
          status?: Database["public"]["Enums"]["app_status"]
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          session_key: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          session_key?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          session_key?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_subjects: {
        Row: {
          code: string
          description: string | null
          id: string
          prereqs: string[]
          program_id: string
          semester: number
          title: string
          units: number
          year_level: number
        }
        Insert: {
          code: string
          description?: string | null
          id?: string
          prereqs?: string[]
          program_id: string
          semester?: number
          title: string
          units?: number
          year_level?: number
        }
        Update: {
          code?: string
          description?: string | null
          id?: string
          prereqs?: string[]
          program_id?: string
          semester?: number
          title?: string
          units?: number
          year_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_subjects_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          application_id: string
          id: string
          plan: Json
          semesters_max: number
          semesters_min: number
          updated_at: string
        }
        Insert: {
          application_id: string
          id?: string
          plan: Json
          semesters_max: number
          semesters_min: number
          updated_at?: string
        }
        Update: {
          application_id?: string
          id?: string
          plan?: Json
          semesters_max?: number
          semesters_min?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      programs: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          total_units: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          total_units?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          total_units?: number
        }
        Relationships: []
      }
      reports: {
        Row: {
          application_id: string
          file_path: string | null
          generated_at: string
          id: string
          payload: Json
        }
        Insert: {
          application_id: string
          file_path?: string | null
          generated_at?: string
          id?: string
          payload: Json
        }
        Update: {
          application_id?: string
          file_path?: string | null
          generated_at?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "reports_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_matches: {
        Row: {
          applicant_flag_note: string | null
          application_id: string
          confidence: number
          created_at: string
          curriculum_subject_id: string | null
          evaluator_note: string | null
          flagged_by_applicant: boolean
          id: string
          reason: string | null
          status: Database["public"]["Enums"]["match_status"]
          tor_subject_id: string | null
        }
        Insert: {
          applicant_flag_note?: string | null
          application_id: string
          confidence?: number
          created_at?: string
          curriculum_subject_id?: string | null
          evaluator_note?: string | null
          flagged_by_applicant?: boolean
          id?: string
          reason?: string | null
          status: Database["public"]["Enums"]["match_status"]
          tor_subject_id?: string | null
        }
        Update: {
          applicant_flag_note?: string | null
          application_id?: string
          confidence?: number
          created_at?: string
          curriculum_subject_id?: string | null
          evaluator_note?: string | null
          flagged_by_applicant?: boolean
          id?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          tor_subject_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subject_matches_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_matches_curriculum_subject_id_fkey"
            columns: ["curriculum_subject_id"]
            isOneToOne: false
            referencedRelation: "curriculum_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_matches_tor_subject_id_fkey"
            columns: ["tor_subject_id"]
            isOneToOne: false
            referencedRelation: "tor_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      supporting_documents: {
        Row: {
          application_id: string
          created_at: string
          doc_type: Database["public"]["Enums"]["supporting_doc_type"]
          file_path: string
          id: string
          original_name: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          doc_type: Database["public"]["Enums"]["supporting_doc_type"]
          file_path: string
          id?: string
          original_name?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          doc_type?: Database["public"]["Enums"]["supporting_doc_type"]
          file_path?: string
          id?: string
          original_name?: string | null
        }
        Relationships: []
      }
      tor_documents: {
        Row: {
          application_id: string
          created_at: string
          file_path: string
          id: string
          ocr_raw: string | null
          ocr_status: string
        }
        Insert: {
          application_id: string
          created_at?: string
          file_path: string
          id?: string
          ocr_raw?: string | null
          ocr_status?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          file_path?: string
          id?: string
          ocr_raw?: string | null
          ocr_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tor_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      tor_subjects: {
        Row: {
          application_id: string
          code: string | null
          grade: string | null
          id: string
          raw_text: string | null
          title: string | null
          units: number | null
        }
        Insert: {
          application_id: string
          code?: string | null
          grade?: string | null
          id?: string
          raw_text?: string | null
          title?: string | null
          units?: number | null
        }
        Update: {
          application_id?: string
          code?: string | null
          grade?: string | null
          id?: string
          raw_text?: string | null
          title?: string | null
          units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tor_subjects_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_application: { Args: { _app_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "applicant" | "evaluator" | "admin"
      app_status:
        | "draft"
        | "submitted"
        | "ocr_processing"
        | "ocr_failed"
        | "matching"
        | "pending_review"
        | "auto_finalized"
        | "finalized"
      match_status:
        | "auto_credited"
        | "tentative"
        | "rejected"
        | "evaluator_approved"
        | "evaluator_overridden"
        | "evaluator_added"
      supporting_doc_type:
        | "job_description"
        | "certificate"
        | "other"
        | "transfer_credential"
        | "birth_certificate"
        | "employment_cert"
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
      app_role: ["applicant", "evaluator", "admin"],
      app_status: [
        "draft",
        "submitted",
        "ocr_processing",
        "ocr_failed",
        "matching",
        "pending_review",
        "auto_finalized",
        "finalized",
      ],
      match_status: [
        "auto_credited",
        "tentative",
        "rejected",
        "evaluator_approved",
        "evaluator_overridden",
        "evaluator_added",
      ],
      supporting_doc_type: [
        "job_description",
        "certificate",
        "other",
        "transfer_credential",
        "birth_certificate",
        "employment_cert",
      ],
    },
  },
} as const
