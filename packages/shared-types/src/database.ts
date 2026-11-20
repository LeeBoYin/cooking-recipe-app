
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
            "app_config": {
                  Row: {
                    "id": boolean,"max_steps": number,"photo_limits": NonNullable<Json>,"soft_delete_retention_days": number,"text_limits": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: boolean,"max_steps"?: number,"photo_limits"?: NonNullable<Json>,"soft_delete_retention_days"?: number,"text_limits"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "id"?: boolean,"max_steps"?: number,"photo_limits"?: NonNullable<Json>,"soft_delete_retention_days"?: number,"text_limits"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    
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
                    "aliases": NonNullable<Json>,"allergen_ids": (string)[],"category": string,"default_storage": string,"density_g_per_ml": number | null,"deprecated": boolean,"family": string,"flavor_tags": (string)[],"id": string,"is_perishable": boolean,"name": NonNullable<Json>,"recent_days": number | null,"replaced_by": string | null,"season_months": NonNullable<Json>,"traits": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "aliases"?: NonNullable<Json>,"allergen_ids"?: (string)[],"category": string,"default_storage": string,"density_g_per_ml"?: number | null,"deprecated"?: boolean,"family": string,"flavor_tags"?: (string)[],"id": string,"is_perishable": boolean,"name": NonNullable<Json>,"recent_days"?: number | null,"replaced_by"?: string | null,"season_months"?: NonNullable<Json>,"traits"?: (string)[]
                  }
                  Update: {
                    "aliases"?: NonNullable<Json>,"allergen_ids"?: (string)[],"category"?: string,"default_storage"?: string,"density_g_per_ml"?: number | null,"deprecated"?: boolean,"family"?: string,"flavor_tags"?: (string)[],"id"?: string,"is_perishable"?: boolean,"name"?: NonNullable<Json>,"recent_days"?: number | null,"replaced_by"?: string | null,"season_months"?: NonNullable<Json>,"traits"?: (string)[]
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
