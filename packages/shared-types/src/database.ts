
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
            "admin_audit_logs": {
                  Row: {
                    "action": string,"admin_user_id": string,"created_at": string,"detail": NonNullable<Json>,"id": string,"target_id": string | null,"target_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"admin_user_id": string,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Update: {
                    "action"?: string,"admin_user_id"?: string,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"ai_rate_counters": {
                  Row: {
                    "blocked": number,"bucket": string,"count": number,"user_id": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked"?: number,"bucket": string,"count"?: number,"user_id": string,"window_start": string
                  }
                  Update: {
                    "blocked"?: number,"bucket"?: string,"count"?: number,"user_id"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ai_spend_monthly": {
                  Row: {
                    "call_count": number,"id": string,"month": string,"scope": string,"total_usd": number,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "call_count"?: number,"id"?: string,"month": string,"scope": string,"total_usd"?: number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "call_count"?: number,"id"?: string,"month"?: string,"scope"?: string,"total_usd"?: number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"ai_suggestion_cache": {
                  Row: {
                    "created_at": string,"drafts": NonNullable<Json>,"expires_at": string,"feedback": NonNullable<Json>,"id": string,"input_hash": string,"kind": string,"kitchen_id": string | null,"payload": NonNullable<Json>,"round": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"drafts"?: NonNullable<Json>,"expires_at": string,"feedback"?: NonNullable<Json>,"id": string,"input_hash": string,"kind": string,"kitchen_id"?: string | null,"payload": NonNullable<Json>,"round"?: number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"drafts"?: NonNullable<Json>,"expires_at"?: string,"feedback"?: NonNullable<Json>,"id"?: string,"input_hash"?: string,"kind"?: string,"kitchen_id"?: string | null,"payload"?: NonNullable<Json>,"round"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_suggestion_cache_kitchen_id_fkey"
      columns: ["kitchen_id"]
isOneToOne: false
      referencedRelation: "kitchens"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_usage_alerts": {
                  Row: {
                    "created_at": string,"dedupe_key": string,"detail": NonNullable<Json>,"id": string,"kind": string,"resolution": string | null,"resolved_at": string | null,"resolved_by": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"dedupe_key": string,"detail"?: NonNullable<Json>,"id"?: string,"kind": string,"resolution"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"dedupe_key"?: string,"detail"?: NonNullable<Json>,"id"?: string,"kind"?: string,"resolution"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"ai_usage_records": {
                  Row: {
                    "cache_read_tokens": number,"cache_write_tokens": number,"cost_usd": number,"created_at": string,"id": string,"input_hash": string | null,"input_ratio": number | null,"input_tokens": number,"latency_ms": number | null,"model": string,"ok": boolean,"output_tokens": number,"session_id": string | null,"task": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cache_read_tokens"?: number,"cache_write_tokens"?: number,"cost_usd": number,"created_at"?: string,"id"?: string,"input_hash"?: string | null,"input_ratio"?: number | null,"input_tokens"?: number,"latency_ms"?: number | null,"model": string,"ok": boolean,"output_tokens"?: number,"session_id"?: string | null,"task": string,"user_id": string
                  }
                  Update: {
                    "cache_read_tokens"?: number,"cache_write_tokens"?: number,"cost_usd"?: number,"created_at"?: string,"id"?: string,"input_hash"?: string | null,"input_ratio"?: number | null,"input_tokens"?: number,"latency_ms"?: number | null,"model"?: string,"ok"?: boolean,"output_tokens"?: number,"session_id"?: string | null,"task"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"app_config": {
                  Row: {
                    "ai_budget_alert_ratio": number,"ai_enabled": boolean,"ai_monthly_budget_usd": number,"ai_protection": NonNullable<Json>,"id": boolean,"max_steps": number,"max_users": number,"photo_limits": NonNullable<Json>,"registration_mode": string,"soft_delete_retention_days": number,"text_limits": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_budget_alert_ratio"?: number,"ai_enabled"?: boolean,"ai_monthly_budget_usd"?: number,"ai_protection"?: NonNullable<Json>,"id"?: boolean,"max_steps"?: number,"max_users"?: number,"photo_limits"?: NonNullable<Json>,"registration_mode"?: string,"soft_delete_retention_days"?: number,"text_limits"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "ai_budget_alert_ratio"?: number,"ai_enabled"?: boolean,"ai_monthly_budget_usd"?: number,"ai_protection"?: NonNullable<Json>,"id"?: boolean,"max_steps"?: number,"max_users"?: number,"photo_limits"?: NonNullable<Json>,"registration_mode"?: string,"soft_delete_retention_days"?: number,"text_limits"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"background_jobs": {
                  Row: {
                    "attempts": number,"created_at": string,"dedupe_key": string,"id": string,"kind": string,"last_error": string | null,"locked_at": string | null,"max_attempts": number,"payload": NonNullable<Json>,"requested_by": string | null,"run_after": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"dedupe_key": string,"id"?: string,"kind": string,"last_error"?: string | null,"locked_at"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"requested_by"?: string | null,"run_after"?: string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"dedupe_key"?: string,"id"?: string,"kind"?: string,"last_error"?: string | null,"locked_at"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"requested_by"?: string | null,"run_after"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"bookmarks": {
                  Row: {
                    "cooked_recipe_id": string | null,"created_at": string,"deleted_at": string | null,"id": string,"idea": NonNullable<Json>,"idea_ingredient_ids": (string)[],"kind": string,"note": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cooked_recipe_id"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id": string,"idea": NonNullable<Json>,"idea_ingredient_ids"?: (string)[],"kind": string,"note"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "cooked_recipe_id"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"idea"?: NonNullable<Json>,"idea_ingredient_ids"?: (string)[],"kind"?: string,"note"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookmarks_cooked_recipe_id_fkey"
      columns: ["cooked_recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"dict_allergens": {
                  Row: {
                    "aliases": NonNullable<Json>,"deprecated": boolean,"display_level_by_region": NonNullable<Json>,"id": string,"name": NonNullable<Json>,"parent_id": string | null,"regions": (string)[],"replaced_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aliases"?: NonNullable<Json>,"deprecated"?: boolean,"display_level_by_region"?: NonNullable<Json>,"id": string,"name": NonNullable<Json>,"parent_id"?: string | null,"regions"?: (string)[],"replaced_by"?: string | null
                  }
                  Update: {
                    "aliases"?: NonNullable<Json>,"deprecated"?: boolean,"display_level_by_region"?: NonNullable<Json>,"id"?: string,"name"?: NonNullable<Json>,"parent_id"?: string | null,"regions"?: (string)[],"replaced_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "dict_allergens_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "dict_allergens"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dict_allergens_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "dict_allergens"
      referencedColumns: ["id"]
    }
                  ]
                },"dict_base_dishes": {
                  Row: {
                    "cuisine_keys": (string)[],"deprecated": boolean,"difficulty": NonNullable<Json>,"equipment_type_ids": (string)[],"id": string,"ingredient_ids": (string)[],"name": NonNullable<Json>,"regions": (string)[],"replaced_by": string | null,"techniques": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "cuisine_keys"?: (string)[],"deprecated"?: boolean,"difficulty": NonNullable<Json>,"equipment_type_ids"?: (string)[],"id": string,"ingredient_ids"?: (string)[],"name": NonNullable<Json>,"regions"?: (string)[],"replaced_by"?: string | null,"techniques"?: (string)[]
                  }
                  Update: {
                    "cuisine_keys"?: (string)[],"deprecated"?: boolean,"difficulty"?: NonNullable<Json>,"equipment_type_ids"?: (string)[],"id"?: string,"ingredient_ids"?: (string)[],"name"?: NonNullable<Json>,"regions"?: (string)[],"replaced_by"?: string | null,"techniques"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "dict_base_dishes_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "dict_base_dishes"
      referencedColumns: ["id"]
    }
                  ]
                },"dict_dietary_restrictions": {
                  Row: {
                    "deprecated": boolean,"excludes_ingredient_ids": (string)[],"excludes_traits": (string)[],"id": string,"name": NonNullable<Json>,"replaced_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "deprecated"?: boolean,"excludes_ingredient_ids"?: (string)[],"excludes_traits"?: (string)[],"id": string,"name": NonNullable<Json>,"replaced_by"?: string | null
                  }
                  Update: {
                    "deprecated"?: boolean,"excludes_ingredient_ids"?: (string)[],"excludes_traits"?: (string)[],"id"?: string,"name"?: NonNullable<Json>,"replaced_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "dict_dietary_restrictions_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "dict_dietary_restrictions"
      referencedColumns: ["id"]
    }
                  ]
                },"dict_equipment_types": {
                  Row: {
                    "aliases": NonNullable<Json>,"assists": (string)[],"category": string,"deprecated": boolean,"dishwasher_safe": string,"icon_key": string,"id": string,"is_heat_source": boolean,"name": NonNullable<Json>,"onboarding": NonNullable<Json>,"optional_techniques": (string)[],"regions": (string)[],"replaced_by": string | null,"requires_heat_source": boolean,"techniques": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "aliases"?: NonNullable<Json>,"assists"?: (string)[],"category": string,"deprecated"?: boolean,"dishwasher_safe": string,"icon_key": string,"id": string,"is_heat_source": boolean,"name": NonNullable<Json>,"onboarding": NonNullable<Json>,"optional_techniques"?: (string)[],"regions"?: (string)[],"replaced_by"?: string | null,"requires_heat_source": boolean,"techniques"?: (string)[]
                  }
                  Update: {
                    "aliases"?: NonNullable<Json>,"assists"?: (string)[],"category"?: string,"deprecated"?: boolean,"dishwasher_safe"?: string,"icon_key"?: string,"id"?: string,"is_heat_source"?: boolean,"name"?: NonNullable<Json>,"onboarding"?: NonNullable<Json>,"optional_techniques"?: (string)[],"regions"?: (string)[],"replaced_by"?: string | null,"requires_heat_source"?: boolean,"techniques"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "dict_equipment_types_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "dict_equipment_types"
      referencedColumns: ["id"]
    }
                  ]
                },"dict_ingredients": {
                  Row: {
                    "aliases": NonNullable<Json>,"allergen_ids": (string)[],"category": string,"default_storage": string,"density_g_per_ml": number | null,"deprecated": boolean,"family": string,"flavor_tags": (string)[],"id": string,"is_perishable": boolean,"name": NonNullable<Json>,"replaced_by": string | null,"season_months": NonNullable<Json>,"traits": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "aliases"?: NonNullable<Json>,"allergen_ids"?: (string)[],"category": string,"default_storage": string,"density_g_per_ml"?: number | null,"deprecated"?: boolean,"family": string,"flavor_tags"?: (string)[],"id": string,"is_perishable": boolean,"name": NonNullable<Json>,"replaced_by"?: string | null,"season_months"?: NonNullable<Json>,"traits"?: (string)[]
                  }
                  Update: {
                    "aliases"?: NonNullable<Json>,"allergen_ids"?: (string)[],"category"?: string,"default_storage"?: string,"density_g_per_ml"?: number | null,"deprecated"?: boolean,"family"?: string,"flavor_tags"?: (string)[],"id"?: string,"is_perishable"?: boolean,"name"?: NonNullable<Json>,"replaced_by"?: string | null,"season_months"?: NonNullable<Json>,"traits"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "dict_ingredients_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "dict_ingredients"
      referencedColumns: ["id"]
    }
                  ]
                },"dict_preference_dimensions": {
                  Row: {
                    "deprecated": boolean,"dimension_group": string,"impact": number,"key": string,"name": NonNullable<Json>,"parent_key": string | null,"replaced_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "deprecated"?: boolean,"dimension_group": string,"impact": number,"key": string,"name": NonNullable<Json>,"parent_key"?: string | null,"replaced_by"?: string | null
                  }
                  Update: {
                    "deprecated"?: boolean,"dimension_group"?: string,"impact"?: number,"key"?: string,"name"?: NonNullable<Json>,"parent_key"?: string | null,"replaced_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "dict_preference_dimensions_parent_key_fkey"
      columns: ["parent_key"]
isOneToOne: false
      referencedRelation: "dict_preference_dimensions"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "dict_preference_dimensions_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "dict_preference_dimensions"
      referencedColumns: ["key"]
    }
                  ]
                },"dict_quiz_items": {
                  Row: {
                    "context_field": string | null,"deprecated": boolean,"description": Json | null,"excluded_allergen_ids": (string)[],"excluded_restriction_ids": (string)[],"follow_ups": (string)[],"id": string,"item_type": string,"mapping": NonNullable<Json>,"options": Json | null,"regions": (string)[],"replaced_by": string | null,"spectrum": Json | null,"title": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "context_field"?: string | null,"deprecated"?: boolean,"description"?: Json | null,"excluded_allergen_ids"?: (string)[],"excluded_restriction_ids"?: (string)[],"follow_ups"?: (string)[],"id": string,"item_type": string,"mapping"?: NonNullable<Json>,"options"?: Json | null,"regions"?: (string)[],"replaced_by"?: string | null,"spectrum"?: Json | null,"title": NonNullable<Json>
                  }
                  Update: {
                    "context_field"?: string | null,"deprecated"?: boolean,"description"?: Json | null,"excluded_allergen_ids"?: (string)[],"excluded_restriction_ids"?: (string)[],"follow_ups"?: (string)[],"id"?: string,"item_type"?: string,"mapping"?: NonNullable<Json>,"options"?: Json | null,"regions"?: (string)[],"replaced_by"?: string | null,"spectrum"?: Json | null,"title"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "dict_quiz_items_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "dict_quiz_items"
      referencedColumns: ["id"]
    }
                  ]
                },"dict_regions": {
                  Row: {
                    "code": string,"common_pantry_ingredient_ids": (string)[],"data_status": string,"default_locale": string,"default_timezone": string,"default_units": NonNullable<Json>,"deprecated": boolean,"hemisphere": string,"holidays": NonNullable<Json>,"name": NonNullable<Json>,"pantry_seasoning_ids": (string)[],"replaced_by": string | null,"seasons": NonNullable<Json>,"staple_ingredient_ids": (string)[],"uses_solar_terms": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"common_pantry_ingredient_ids"?: (string)[],"data_status": string,"default_locale": string,"default_timezone": string,"default_units": NonNullable<Json>,"deprecated"?: boolean,"hemisphere": string,"holidays"?: NonNullable<Json>,"name": NonNullable<Json>,"pantry_seasoning_ids"?: (string)[],"replaced_by"?: string | null,"seasons": NonNullable<Json>,"staple_ingredient_ids"?: (string)[],"uses_solar_terms"?: boolean
                  }
                  Update: {
                    "code"?: string,"common_pantry_ingredient_ids"?: (string)[],"data_status"?: string,"default_locale"?: string,"default_timezone"?: string,"default_units"?: NonNullable<Json>,"deprecated"?: boolean,"hemisphere"?: string,"holidays"?: NonNullable<Json>,"name"?: NonNullable<Json>,"pantry_seasoning_ids"?: (string)[],"replaced_by"?: string | null,"seasons"?: NonNullable<Json>,"staple_ingredient_ids"?: (string)[],"uses_solar_terms"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "dict_regions_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "dict_regions"
      referencedColumns: ["code"]
    }
                  ]
                },"dict_techniques": {
                  Row: {
                    "deprecated": boolean,"id": string,"name": NonNullable<Json>,"replaced_by": string | null,"safety_rule_id": string | null,"technique_group": string
                  }
                  ComputedFields: never
                  Insert: {
                    "deprecated"?: boolean,"id": string,"name": NonNullable<Json>,"replaced_by"?: string | null,"safety_rule_id"?: string | null,"technique_group": string
                  }
                  Update: {
                    "deprecated"?: boolean,"id"?: string,"name"?: NonNullable<Json>,"replaced_by"?: string | null,"safety_rule_id"?: string | null,"technique_group"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dict_techniques_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "dict_techniques"
      referencedColumns: ["id"]
    }
                  ]
                },"dict_version": {
                  Row: {
                    "id": boolean,"imported_at": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: boolean,"imported_at"?: string,"version": string
                  }
                  Update: {
                    "id"?: boolean,"imported_at"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"dietary_profiles": {
                  Row: {
                    "allergen_ids": (string)[],"created_at": string,"dietary_restriction_ids": (string)[],"dislike_ingredient_ids": (string)[],"id": string,"no_cooking_alcohol": boolean,"schema_version": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allergen_ids"?: (string)[],"created_at"?: string,"dietary_restriction_ids"?: (string)[],"dislike_ingredient_ids"?: (string)[],"id": string,"no_cooking_alcohol"?: boolean,"schema_version"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "allergen_ids"?: (string)[],"created_at"?: string,"dietary_restriction_ids"?: (string)[],"dislike_ingredient_ids"?: (string)[],"id"?: string,"no_cooking_alcohol"?: boolean,"schema_version"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"entitlements": {
                  Row: {
                    "created_at": string,"fair_use_override": Json | null,"plan": string,"updated_at": string,"user_id": string,"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"fair_use_override"?: Json | null,"plan"?: string,"updated_at"?: string,"user_id": string,"valid_until"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"fair_use_override"?: Json | null,"plan"?: string,"updated_at"?: string,"user_id"?: string,"valid_until"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"error_logs": {
                  Row: {
                    "analytics_id": string | null,"app_version": string | null,"count": number,"first_at": string,"id": string,"kind": string,"last_at": string,"location": string,"platform": string | null,"severity": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "analytics_id"?: string | null,"app_version"?: string | null,"count"?: number,"first_at"?: string,"id"?: string,"kind": string,"last_at"?: string,"location": string,"platform"?: string | null,"severity": string,"source": string
                  }
                  Update: {
                    "analytics_id"?: string | null,"app_version"?: string | null,"count"?: number,"first_at"?: string,"id"?: string,"kind"?: string,"last_at"?: string,"location"?: string,"platform"?: string | null,"severity"?: string,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ingredient_mappings": {
                  Row: {
                    "created_at": string,"ingredient_id": string | null,"model": string | null,"raw_text_normalized": string,"source": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ingredient_id"?: string | null,"model"?: string | null,"raw_text_normalized": string,"source": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"ingredient_id"?: string | null,"model"?: string | null,"raw_text_normalized"?: string,"source"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingredient_mappings_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "dict_ingredients"
      referencedColumns: ["id"]
    }
                  ]
                },"invite_code_attempts": {
                  Row: {
                    "created_at": string,"failed_count": number,"last_failed_at": string | null,"locked_until": string | null,"source_hash": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"failed_count"?: number,"last_failed_at"?: string | null,"locked_until"?: string | null,"source_hash": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"failed_count"?: number,"last_failed_at"?: string | null,"locked_until"?: string | null,"source_hash"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"invites": {
                  Row: {
                    "accepted_at": string | null,"accepted_user_id": string | null,"accepted_via": string | null,"befriend_inviter": boolean,"code_expires_at": string | null,"code_hash": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"kitchen_id": string | null,"link_regenerated_at": string | null,"note": string | null,"plan": string,"status": string,"token_hash": string,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_user_id"?: string | null,"accepted_via"?: string | null,"befriend_inviter"?: boolean,"code_expires_at"?: string | null,"code_hash"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id": string,"invited_by"?: string | null,"kitchen_id"?: string | null,"link_regenerated_at"?: string | null,"note"?: string | null,"plan"?: string,"status"?: string,"token_hash": string,"type"?: string,"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_user_id"?: string | null,"accepted_via"?: string | null,"befriend_inviter"?: boolean,"code_expires_at"?: string | null,"code_hash"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"kitchen_id"?: string | null,"link_regenerated_at"?: string | null,"note"?: string | null,"plan"?: string,"status"?: string,"token_hash"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invites_kitchen_id_fkey"
      columns: ["kitchen_id"]
isOneToOne: false
      referencedRelation: "kitchens"
      referencedColumns: ["id"]
    }
                  ]
                },"kitchen_equipment": {
                  Row: {
                    "acquired_at": string | null,"brand": string | null,"capacity_unit": string | null,"capacity_value": number | null,"created_at": string,"created_by": string | null,"description": string | null,"dishwasher_safe": boolean | null,"enabled_optional_techniques": (string)[],"equipment_type_id": string | null,"id": string,"kitchen_id": string,"model": string | null,"raw_name": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acquired_at"?: string | null,"brand"?: string | null,"capacity_unit"?: string | null,"capacity_value"?: number | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"dishwasher_safe"?: boolean | null,"enabled_optional_techniques"?: (string)[],"equipment_type_id"?: string | null,"id": string,"kitchen_id": string,"model"?: string | null,"raw_name": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "acquired_at"?: string | null,"brand"?: string | null,"capacity_unit"?: string | null,"capacity_value"?: number | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"dishwasher_safe"?: boolean | null,"enabled_optional_techniques"?: (string)[],"equipment_type_id"?: string | null,"id"?: string,"kitchen_id"?: string,"model"?: string | null,"raw_name"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "kitchen_equipment_equipment_type_id_fkey"
      columns: ["equipment_type_id"]
isOneToOne: false
      referencedRelation: "dict_equipment_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "kitchen_equipment_kitchen_id_fkey"
      columns: ["kitchen_id"]
isOneToOne: false
      referencedRelation: "kitchens"
      referencedColumns: ["id"]
    }
                  ]
                },"kitchen_members": {
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
                },"pantry_items": {
                  Row: {
                    "added_on": string,"alert_on": string | null,"alert_tier": string | null,"created_at": string,"created_by": string | null,"date_type": string | null,"expires_at": string | null,"expiry_set_on": string | null,"id": string,"ingredient_id": string | null,"kitchen_id": string,"note": string | null,"raw_name": string,"removed_at": string | null,"removed_by": string | null,"removed_with_recipe_id": string | null,"status": string,"still_there_asked_on": string | null,"updated_at": string,"updated_by": string | null,"want_to_use_soon": boolean,"zone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_on": string,"alert_on"?: string | null,"alert_tier"?: string | null,"created_at"?: string,"created_by"?: string | null,"date_type"?: string | null,"expires_at"?: string | null,"expiry_set_on"?: string | null,"id": string,"ingredient_id"?: string | null,"kitchen_id": string,"note"?: string | null,"raw_name": string,"removed_at"?: string | null,"removed_by"?: string | null,"removed_with_recipe_id"?: string | null,"status"?: string,"still_there_asked_on"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"want_to_use_soon"?: boolean,"zone": string
                  }
                  Update: {
                    "added_on"?: string,"alert_on"?: string | null,"alert_tier"?: string | null,"created_at"?: string,"created_by"?: string | null,"date_type"?: string | null,"expires_at"?: string | null,"expiry_set_on"?: string | null,"id"?: string,"ingredient_id"?: string | null,"kitchen_id"?: string,"note"?: string | null,"raw_name"?: string,"removed_at"?: string | null,"removed_by"?: string | null,"removed_with_recipe_id"?: string | null,"status"?: string,"still_there_asked_on"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"want_to_use_soon"?: boolean,"zone"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pantry_items_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "dict_ingredients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pantry_items_kitchen_id_fkey"
      columns: ["kitchen_id"]
isOneToOne: false
      referencedRelation: "kitchens"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pantry_items_removed_with_recipe_fk"
      columns: ["removed_with_recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"password_reset_links": {
                  Row: {
                    "created_at": string,"created_by": string | null,"expires_at": string,"id": string,"token_hash": string,"updated_at": string,"used_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"id": string,"token_hash": string,"updated_at"?: string,"used_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"id"?: string,"token_hash"?: string,"updated_at"?: string,"used_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"photos": {
                  Row: {
                    "cook_note_id": string | null,"created_at": string,"created_by": string | null,"feed_path": string,"height": number,"id": string,"is_cover": boolean,"kitchen_id": string | null,"owner_id": string,"owner_type": string,"recipe_id": string | null,"sort_order": number,"storage_path": string,"taken_at": string | null,"thumb_path": string,"updated_at": string,"user_id": string | null,"width": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cook_note_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"feed_path": string,"height": number,"id": string,"is_cover"?: boolean,"kitchen_id"?: string | null,"owner_id": string,"owner_type": string,"recipe_id"?: string | null,"sort_order"?: number,"storage_path": string,"taken_at"?: string | null,"thumb_path": string,"updated_at"?: string,"user_id"?: string | null,"width": number
                  }
                  Update: {
                    "cook_note_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"feed_path"?: string,"height"?: number,"id"?: string,"is_cover"?: boolean,"kitchen_id"?: string | null,"owner_id"?: string,"owner_type"?: string,"recipe_id"?: string | null,"sort_order"?: number,"storage_path"?: string,"taken_at"?: string | null,"thumb_path"?: string,"updated_at"?: string,"user_id"?: string | null,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "photos_kitchen_id_fkey"
      columns: ["kitchen_id"]
isOneToOne: false
      referencedRelation: "kitchens"
      referencedColumns: ["id"]
    }
                  ]
                },"preference_profiles": {
                  Row: {
                    "answered_item_ids": (string)[],"card_title": string | null,"context": NonNullable<Json>,"created_at": string,"dims": NonNullable<Json>,"last_explored_at": string | null,"schema_version": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answered_item_ids"?: (string)[],"card_title"?: string | null,"context"?: NonNullable<Json>,"created_at"?: string,"dims"?: NonNullable<Json>,"last_explored_at"?: string | null,"schema_version"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "answered_item_ids"?: (string)[],"card_title"?: string | null,"context"?: NonNullable<Json>,"created_at"?: string,"dims"?: NonNullable<Json>,"last_explored_at"?: string | null,"schema_version"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recipe_private": {
                  Row: {
                    "created_at": string,"dictation": Json | null,"diners": NonNullable<Json>,"recipe_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"dictation"?: Json | null,"diners"?: NonNullable<Json>,"recipe_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"dictation"?: Json | null,"diners"?: NonNullable<Json>,"recipe_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_private_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: true
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"recipes": {
                  Row: {
                    "ai_tags": Json | null,"cook_notes": NonNullable<Json>,"cooked_at": string | null,"cooked_dates": (string)[],"cooked_on": string | null,"created_at": string,"created_via": string,"deleted_at": string | null,"difficulty": Json | null,"equipment_type_ids": (string)[],"equipment_used_ids": (string)[],"highlights": (string)[],"id": string,"ingredient_ids": (string)[],"ingredients": NonNullable<Json>,"kitchen_id": string | null,"lang": string,"parent_recipe_id": string | null,"published_at": string | null,"safety_warnings": (string)[],"schema_version": number,"servings": number | null,"source": Json | null,"status": string,"steps": NonNullable<Json>,"story": string | null,"techniques": (string)[],"tips": string | null,"title": string | null,"updated_at": string,"user_id": string,"version": number,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_tags"?: Json | null,"cook_notes"?: NonNullable<Json>,"cooked_at"?: string | null,"cooked_dates"?: (string)[],"cooked_on"?: string | null,"created_at"?: string,"created_via"?: string,"deleted_at"?: string | null,"difficulty"?: Json | null,"equipment_type_ids"?: (string)[],"equipment_used_ids"?: (string)[],"highlights"?: (string)[],"id": string,"ingredient_ids"?: (string)[],"ingredients"?: NonNullable<Json>,"kitchen_id"?: string | null,"lang"?: string,"parent_recipe_id"?: string | null,"published_at"?: string | null,"safety_warnings"?: (string)[],"schema_version"?: number,"servings"?: number | null,"source"?: Json | null,"status"?: string,"steps"?: NonNullable<Json>,"story"?: string | null,"techniques"?: (string)[],"tips"?: string | null,"title"?: string | null,"updated_at"?: string,"user_id": string,"version"?: number,"visibility"?: string
                  }
                  Update: {
                    "ai_tags"?: Json | null,"cook_notes"?: NonNullable<Json>,"cooked_at"?: string | null,"cooked_dates"?: (string)[],"cooked_on"?: string | null,"created_at"?: string,"created_via"?: string,"deleted_at"?: string | null,"difficulty"?: Json | null,"equipment_type_ids"?: (string)[],"equipment_used_ids"?: (string)[],"highlights"?: (string)[],"id"?: string,"ingredient_ids"?: (string)[],"ingredients"?: NonNullable<Json>,"kitchen_id"?: string | null,"lang"?: string,"parent_recipe_id"?: string | null,"published_at"?: string | null,"safety_warnings"?: (string)[],"schema_version"?: number,"servings"?: number | null,"source"?: Json | null,"status"?: string,"steps"?: NonNullable<Json>,"story"?: string | null,"techniques"?: (string)[],"tips"?: string | null,"title"?: string | null,"updated_at"?: string,"user_id"?: string,"version"?: number,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipes_kitchen_id_fkey"
      columns: ["kitchen_id"]
isOneToOne: false
      referencedRelation: "kitchens"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipes_parent_recipe_id_fkey"
      columns: ["parent_recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
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
                },"user_ingredient_mappings": {
                  Row: {
                    "created_at": string,"ingredient_id": string,"raw_text_normalized": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ingredient_id": string,"raw_text_normalized": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"ingredient_id"?: string,"raw_text_normalized"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_ingredient_mappings_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "dict_ingredients"
      referencedColumns: ["id"]
    }
                  ]
                },"user_profiles": {
                  Row: {
                    "ai_paused": boolean,"created_at": string,"invite_id": string | null,"last_active_at": string | null,"role": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_paused"?: boolean,"created_at"?: string,"invite_id"?: string | null,"last_active_at"?: string | null,"role"?: string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "ai_paused"?: boolean,"created_at"?: string,"invite_id"?: string | null,"last_active_at"?: string | null,"role"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_profiles_invite_id_fkey"
      columns: ["invite_id"]
isOneToOne: false
      referencedRelation: "invites"
      referencedColumns: ["id"]
    }
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
            "add_pantry_items":
{ Args: { "p_items": Json,"p_kitchen_id": string }; Returns: {
              "added_on": string,
"alert_on": string | null,
"alert_tier": string | null,
"created_at": string,
"created_by": string | null,
"date_type": string | null,
"expires_at": string | null,
"expiry_set_on": string | null,
"id": string,
"ingredient_id": string | null,
"kitchen_id": string,
"note": string | null,
"raw_name": string,
"removed_at": string | null,
"removed_by": string | null,
"removed_with_recipe_id": string | null,
"status": string,
"still_there_asked_on": string | null,
"updated_at": string,
"updated_by": string | null,
"want_to_use_soon": boolean,
"zone": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "pantry_items"
        isOneToOne: false
        isSetofReturn: true
      } },
"admin_create_invite":
{ Args: { "p_admin": string,"p_befriend_inviter"?: boolean,"p_email": string,"p_id": string,"p_note"?: string,"p_plan"?: string }; Returns: {
              "expires_at": string,"invite_id": string,"token": string
            }[]
                           },
"admin_create_reset_link":
{ Args: { "p_admin": string,"p_id": string,"p_user_id": string }; Returns: {
              "expires_at": string,"link_id": string,"token": string
            }[]
                           },
"admin_extend_invite":
{ Args: { "p_admin": string,"p_days": number,"p_invite_id": string }; Returns: string
                           },
"admin_get_ai_protection":
{ Args: { "p_admin": string }; Returns: Json
                           },
"admin_get_ai_usage":
{ Args: { "p_admin": string,"p_now"?: string }; Returns: Json
                           },
"admin_get_config":
{ Args: { "p_admin": string }; Returns: Json
                           },
"admin_is_admin":
{ Args: { "p_user": string }; Returns: boolean
                           },
"admin_list_ai_alerts":
{ Args: { "p_admin": string,"p_before"?: string,"p_limit"?: number,"p_status"?: string }; Returns: Json
                           },
"admin_list_audit_logs":
{ Args: { "p_admin": string,"p_before"?: string,"p_limit"?: number }; Returns: Json
                           },
"admin_list_invites":
{ Args: { "p_admin": string }; Returns: Json
                           },
"admin_list_users":
{ Args: { "p_admin": string }; Returns: Json
                           },
"admin_regenerate_invite":
{ Args: { "p_admin": string,"p_invite_id": string }; Returns: {
              "expires_at": string,"invite_id": string,"token": string
            }[]
                           },
"admin_resolve_ai_alert":
{ Args: { "p_admin": string,"p_alert_id": string,"p_resolution": string }; Returns: undefined
                           },
"admin_revoke_invite":
{ Args: { "p_admin": string,"p_invite_id": string }; Returns: undefined
                           },
"admin_set_user_ai_paused":
{ Args: { "p_admin": string,"p_paused": boolean,"p_user_id": string }; Returns: undefined
                           },
"admin_set_user_fair_use":
{ Args: { "p_admin": string,"p_clear"?: boolean,"p_daily_usd"?: number,"p_monthly_usd"?: number,"p_user_id": string }; Returns: Json
                           },
"admin_set_user_plan":
{ Args: { "p_admin": string,"p_plan": string,"p_user_id": string }; Returns: undefined
                           },
"admin_set_user_status":
{ Args: { "p_admin": string,"p_status": string,"p_user_id": string }; Returns: undefined
                           },
"admin_update_ai_protection":
{ Args: { "p_admin": string,"p_protection": Json }; Returns: Json
                           },
"admin_update_config":
{ Args: { "p_admin": string,"p_ai_enabled"?: boolean,"p_ai_monthly_budget_usd"?: number,"p_max_users"?: number,"p_soft_delete_retention_days"?: number }; Returns: Json
                           },
"admin_update_invite_email":
{ Args: { "p_admin": string,"p_email": string,"p_invite_id": string }; Returns: undefined
                           },
"ai_budget_state":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"ai_get_context":
{ Args: { "p_user": string }; Returns: Json
                           },
"ai_guard_check":
{ Args: { "p_background"?: boolean,"p_now"?: string,"p_user": string }; Returns: Json
                           },
"ai_home_cache_save":
{ Args: { "p_input_hash": string,"p_kitchen": string,"p_payload": Json,"p_round": number,"p_ttl_hours"?: number,"p_user": string }; Returns: string
                           },
"ai_home_context":
{ Args: { "p_user": string }; Returns: Json
                           },
"ai_record_usage":
{ Args: { "p_cache_read_tokens": number,"p_cache_write_tokens": number,"p_cost_usd": number,"p_input_hash"?: string,"p_input_ratio"?: number,"p_input_tokens": number,"p_latency_ms"?: number,"p_model": string,"p_now"?: string,"p_ok": boolean,"p_output_tokens": number,"p_session_id"?: string,"p_task": string,"p_user": string }; Returns: undefined
                           },
"backfill_recipe_ingredients":
{ Args: { "p_ingredients": Json,"p_recipe_id": string }; Returns: boolean
                           },
"bookmark_recipe":
{ Args: { "p_base_dish_id": string,"p_id": string,"p_title": string,"p_why": string }; Returns: {
              "cooked_recipe_id": string | null,
"created_at": string,
"deleted_at": string | null,
"id": string,
"idea": NonNullable<Json>,
"idea_ingredient_ids": (string)[],
"kind": string,
"note": string | null,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "bookmarks"
        isOneToOne: true
        isSetofReturn: false
      } },
"claim_background_jobs":
{ Args: { "p_kind": string,"p_limit"?: number }; Returns: Json
                           },
"claim_password_reset_link":
{ Args: { "p_token_hash": string }; Returns: string
                           },
"clear_my_ingredient_mapping":
{ Args: { "p_raw_text": string }; Returns: undefined
                           },
"complete_google_signup":
{ Args: { "p_display_name"?: string,"p_region"?: string,"p_timezone"?: string }; Returns: string
                           },
"complete_invite_signup":
{ Args: { "p_display_name"?: string,"p_invite_id": string,"p_region"?: string,"p_timezone"?: string,"p_user_id": string }; Returns: string
                           },
"complete_normalization_jobs":
{ Args: { "p_results": Json }; Returns: number
                           },
"create_invite":
{ Args: { "p_befriend_inviter"?: boolean,"p_email": string,"p_id": string,"p_invited_by"?: string,"p_kitchen_id"?: string,"p_note"?: string,"p_plan"?: string,"p_type"?: string }; Returns: {
              "expires_at": string,"invite_id": string,"token": string
            }[]
                           },
"create_password_reset_link":
{ Args: { "p_created_by"?: string,"p_id": string,"p_user_id": string }; Returns: {
              "expires_at": string,"link_id": string,"token": string
            }[]
                           },
"delete_recipe":
{ Args: { "p_id": string }; Returns: {
              "ai_tags": Json | null,
"cook_notes": NonNullable<Json>,
"cooked_at": string | null,
"cooked_dates": (string)[],
"cooked_on": string | null,
"created_at": string,
"created_via": string,
"deleted_at": string | null,
"difficulty": Json | null,
"equipment_type_ids": (string)[],
"equipment_used_ids": (string)[],
"highlights": (string)[],
"id": string,
"ingredient_ids": (string)[],
"ingredients": NonNullable<Json>,
"kitchen_id": string | null,
"lang": string,
"parent_recipe_id": string | null,
"published_at": string | null,
"safety_warnings": (string)[],
"schema_version": number,
"servings": number | null,
"source": Json | null,
"status": string,
"steps": NonNullable<Json>,
"story": string | null,
"techniques": (string)[],
"tips": string | null,
"title": string | null,
"updated_at": string,
"user_id": string,
"version": number,
"visibility": string
            }
                          SetofOptions: {
        from: "*"
        to: "recipes"
        isOneToOne: true
        isSetofReturn: false
      } },
"fail_background_job":
{ Args: { "p_code": string,"p_id": string,"p_retry"?: boolean }; Returns: undefined
                           },
"hook_before_user_created":
{ Args: { "event": Json }; Returns: Json
                           },
"invite_inviter_name":
{ Args: { "p_invite_id": string }; Returns: string
                           },
"log_error":
{ Args: { "p_app_version"?: string,"p_kind": string,"p_location": string,"p_platform"?: string,"p_severity": string }; Returns: undefined
                           },
"publish_recipe":
{ Args: { "p_id": string }; Returns: {
              "ai_tags": Json | null,
"cook_notes": NonNullable<Json>,
"cooked_at": string | null,
"cooked_dates": (string)[],
"cooked_on": string | null,
"created_at": string,
"created_via": string,
"deleted_at": string | null,
"difficulty": Json | null,
"equipment_type_ids": (string)[],
"equipment_used_ids": (string)[],
"highlights": (string)[],
"id": string,
"ingredient_ids": (string)[],
"ingredients": NonNullable<Json>,
"kitchen_id": string | null,
"lang": string,
"parent_recipe_id": string | null,
"published_at": string | null,
"safety_warnings": (string)[],
"schema_version": number,
"servings": number | null,
"source": Json | null,
"status": string,
"steps": NonNullable<Json>,
"story": string | null,
"techniques": (string)[],
"tips": string | null,
"title": string | null,
"updated_at": string,
"user_id": string,
"version": number,
"visibility": string
            }
                          SetofOptions: {
        from: "*"
        to: "recipes"
        isOneToOne: true
        isSetofReturn: false
      } },
"redeem_invite_code":
{ Args: { "p_code_hash": string,"p_source_hash": string }; Returns: {
              "email": string,"invite_id": string,"locked_until": string,"result": string
            }[]
                           },
"release_background_jobs":
{ Args: { "p_delay_seconds"?: number,"p_ids": (string)[] }; Returns: undefined
                           },
"release_password_reset_link":
{ Args: { "p_token_hash": string }; Returns: undefined
                           },
"remove_pantry_item":
{ Args: { "p_id": string }; Returns: {
              "added_on": string,
"alert_on": string | null,
"alert_tier": string | null,
"created_at": string,
"created_by": string | null,
"date_type": string | null,
"expires_at": string | null,
"expiry_set_on": string | null,
"id": string,
"ingredient_id": string | null,
"kitchen_id": string,
"note": string | null,
"raw_name": string,
"removed_at": string | null,
"removed_by": string | null,
"removed_with_recipe_id": string | null,
"status": string,
"still_there_asked_on": string | null,
"updated_at": string,
"updated_by": string | null,
"want_to_use_soon": boolean,
"zone": string
            }
                          SetofOptions: {
        from: "*"
        to: "pantry_items"
        isOneToOne: true
        isSetofReturn: false
      } },
"restore_pantry_item":
{ Args: { "p_id": string }; Returns: {
              "added_on": string,
"alert_on": string | null,
"alert_tier": string | null,
"created_at": string,
"created_by": string | null,
"date_type": string | null,
"expires_at": string | null,
"expiry_set_on": string | null,
"id": string,
"ingredient_id": string | null,
"kitchen_id": string,
"note": string | null,
"raw_name": string,
"removed_at": string | null,
"removed_by": string | null,
"removed_with_recipe_id": string | null,
"status": string,
"still_there_asked_on": string | null,
"updated_at": string,
"updated_by": string | null,
"want_to_use_soon": boolean,
"zone": string
            }
                          SetofOptions: {
        from: "*"
        to: "pantry_items"
        isOneToOne: true
        isSetofReturn: false
      } },
"restore_recipe":
{ Args: { "p_id": string }; Returns: {
              "ai_tags": Json | null,
"cook_notes": NonNullable<Json>,
"cooked_at": string | null,
"cooked_dates": (string)[],
"cooked_on": string | null,
"created_at": string,
"created_via": string,
"deleted_at": string | null,
"difficulty": Json | null,
"equipment_type_ids": (string)[],
"equipment_used_ids": (string)[],
"highlights": (string)[],
"id": string,
"ingredient_ids": (string)[],
"ingredients": NonNullable<Json>,
"kitchen_id": string | null,
"lang": string,
"parent_recipe_id": string | null,
"published_at": string | null,
"safety_warnings": (string)[],
"schema_version": number,
"servings": number | null,
"source": Json | null,
"status": string,
"steps": NonNullable<Json>,
"story": string | null,
"techniques": (string)[],
"tips": string | null,
"title": string | null,
"updated_at": string,
"user_id": string,
"version": number,
"visibility": string
            }
                          SetofOptions: {
        from: "*"
        to: "recipes"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_recipe":
{ Args: { "p_expected_updated_at"?: string,"p_photos"?: Json,"p_private"?: Json,"p_recipe": Json }; Returns: {
              "ai_tags": Json | null,
"cook_notes": NonNullable<Json>,
"cooked_at": string | null,
"cooked_dates": (string)[],
"cooked_on": string | null,
"created_at": string,
"created_via": string,
"deleted_at": string | null,
"difficulty": Json | null,
"equipment_type_ids": (string)[],
"equipment_used_ids": (string)[],
"highlights": (string)[],
"id": string,
"ingredient_ids": (string)[],
"ingredients": NonNullable<Json>,
"kitchen_id": string | null,
"lang": string,
"parent_recipe_id": string | null,
"published_at": string | null,
"safety_warnings": (string)[],
"schema_version": number,
"servings": number | null,
"source": Json | null,
"status": string,
"steps": NonNullable<Json>,
"story": string | null,
"techniques": (string)[],
"tips": string | null,
"title": string | null,
"updated_at": string,
"user_id": string,
"version": number,
"visibility": string
            }
                          SetofOptions: {
        from: "*"
        to: "recipes"
        isOneToOne: true
        isSetofReturn: false
      } },
"search_my_recipes":
{ Args: { "p_query": string }; Returns: {
              "match_kind": string,"match_text": string,"recipe_id": string
            }[]
                           },
"set_avatar":
{ Args: { "p_photo_id": string }; Returns: undefined
                           },
"set_current_kitchen":
{ Args: { "p_kitchen_id": string }; Returns: undefined
                           },
"set_invite_code":
{ Args: { "p_code_hash": string,"p_invite_id": string }; Returns: string
                           },
"set_my_ingredient_mapping":
{ Args: { "p_ingredient_id": string,"p_raw_text": string }; Returns: undefined
                           },
"setup_new_user":
{ Args: { "p_create_kitchen"?: boolean,"p_display_name"?: string,"p_kitchen_name"?: string,"p_region"?: string,"p_timezone"?: string,"p_user_id": string }; Returns: string
                           },
"unbookmark_recipe":
{ Args: { "p_id": string }; Returns: undefined
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
