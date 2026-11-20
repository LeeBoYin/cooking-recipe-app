
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "kitchen_members": {
                  Row: {
                    "default_diners_all": boolean,"expiry_alerts": boolean,"id": string,"joined_at": string,"kitchen_id": string,"left_at": string | null,"role": string,"share_dietary_info": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "default_diners_all"?: boolean,"expiry_alerts"?: boolean,"id": string,"joined_at"?: string,"kitchen_id": string,"left_at"?: string | null,"role"?: string,"share_dietary_info"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "default_diners_all"?: boolean,"expiry_alerts"?: boolean,"id"?: string,"joined_at"?: string,"kitchen_id"?: string,"left_at"?: string | null,"role"?: string,"share_dietary_info"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "kitchen_members_kitchen_id_fkey"
      columns: ["kitchen_id"]
isOneToOne: false
      referencedRelation: "kitchens"
      referencedColumns: ["id"]
    }
                  ]
                },"kitchens": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"id": string,"name": string,"region": string,"timezone": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id": string,"name": string,"region": string,"timezone": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"name"?: string,"region"?: string,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"user_identities": {
                  Row: {
                    "created_at": string,"display_name": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_profiles": {
                  Row: {
                    "ai_paused": boolean,"created_at": string,"last_active_at": string | null,"role": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_paused"?: boolean,"created_at"?: string,"last_active_at"?: string | null,"role"?: string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "ai_paused"?: boolean,"created_at"?: string,"last_active_at"?: string | null,"role"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_settings": {
                  Row: {
                    "alert_time": string,"analytics_opt_out": boolean,"chef_persona": string,"created_at": string,"current_kitchen_id": string | null,"expiring_alert": boolean,"haptics": boolean,"household_size": number,"last_survey_shown_at": string | null,"locale": string,"measure_unit": string,"onboarding_completed_at": string | null,"onboarding_completed_steps": (string)[],"seen_hints": (string)[],"sound": boolean,"temperature_unit": string,"updated_at": string,"user_id": string,"weekend_inspiration": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "alert_time"?: string,"analytics_opt_out"?: boolean,"chef_persona"?: string,"created_at"?: string,"current_kitchen_id"?: string | null,"expiring_alert"?: boolean,"haptics"?: boolean,"household_size"?: number,"last_survey_shown_at"?: string | null,"locale"?: string,"measure_unit"?: string,"onboarding_completed_at"?: string | null,"onboarding_completed_steps"?: (string)[],"seen_hints"?: (string)[],"sound"?: boolean,"temperature_unit"?: string,"updated_at"?: string,"user_id": string,"weekend_inspiration"?: boolean
                  }
                  Update: {
                    "alert_time"?: string,"analytics_opt_out"?: boolean,"chef_persona"?: string,"created_at"?: string,"current_kitchen_id"?: string | null,"expiring_alert"?: boolean,"haptics"?: boolean,"household_size"?: number,"last_survey_shown_at"?: string | null,"locale"?: string,"measure_unit"?: string,"onboarding_completed_at"?: string | null,"onboarding_completed_steps"?: (string)[],"seen_hints"?: (string)[],"sound"?: boolean,"temperature_unit"?: string,"updated_at"?: string,"user_id"?: string,"weekend_inspiration"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_settings_current_kitchen_id_fkey"
      columns: ["current_kitchen_id"]
isOneToOne: false
      referencedRelation: "kitchens"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "set_current_kitchen":
{ Args: { "p_kitchen_id": string }; Returns: undefined
                           },
"setup_new_user":
{ Args: { "p_create_kitchen"?: boolean,"p_display_name"?: string,"p_kitchen_name"?: string,"p_region"?: string,"p_timezone"?: string,"p_user_id": string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
