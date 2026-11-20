-- 地區的常備食材（M0-18）：新手引導 ⑦「廚房裡有什麼」的常備食材清單（05 RegionProfile.stapleIngredientIds）。
-- 先加欄位（預設空陣列），和前一版 App 相容；匯入函式多收這個欄位，並檢查食材都在字典裡。

alter table public.dict_regions
  add column staple_ingredient_ids text[] not null default '{}';

-- 匯入：多收 stapleIngredientIds
create or replace function private.import_dictionaries(p_data jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_missing text;
begin
  if coalesce(p_data ->> 'version', '') = '' then
    raise exception 'dictionary_version_missing' using errcode = '22023';
  end if;

  -- ID 不能消失
  select string_agg(id, ', ') into v_missing
  from (
    select id from public.dict_allergens
      where id not in (select x ->> 'id' from jsonb_array_elements(p_data -> 'allergens') x)
    union all
    select id from public.dict_ingredients
      where id not in (select x ->> 'id' from jsonb_array_elements(p_data -> 'ingredients') x)
    union all
    select id from public.dict_dietary_restrictions
      where id not in (select x ->> 'id' from jsonb_array_elements(p_data -> 'dietaryRestrictions') x)
    union all
    select id from public.dict_techniques
      where id not in (select x ->> 'id' from jsonb_array_elements(coalesce(p_data -> 'techniques', '[]')) x)
    union all
    select id from public.dict_equipment_types
      where id not in (select x ->> 'id' from jsonb_array_elements(coalesce(p_data -> 'equipmentTypes', '[]')) x)
    union all
    select code from public.dict_regions
      where code not in (select x ->> 'code' from jsonb_array_elements(coalesce(p_data -> 'regions', '[]')) x)
    union all
    select key from public.dict_preference_dimensions
      where key not in (select x ->> 'key' from jsonb_array_elements(coalesce(p_data -> 'preferenceDimensions', '[]')) x)
    union all
    select id from public.dict_quiz_items
      where id not in (select x ->> 'id' from jsonb_array_elements(coalesce(p_data -> 'quizItems', '[]')) x)
    union all
    select id from public.dict_base_dishes
      where id not in (select x ->> 'id' from jsonb_array_elements(coalesce(p_data -> 'baseDishes', '[]')) x)
  ) gone;
  if v_missing is not null then
    raise exception 'dictionary_id_removed: %', v_missing using errcode = '23503',
      hint = '字典 ID 不能刪除，請改標 deprecated';
  end if;

  set constraints all deferred;

  insert into public.dict_allergens as t (id, name, aliases, parent_id, regions, display_level_by_region, deprecated, replaced_by)
  select
    x ->> 'id',
    x -> 'name',
    coalesce(x -> 'aliases', '{"zh-TW": []}'),
    x ->> 'parentId',
    coalesce(array(select jsonb_array_elements_text(x -> 'regions')), '{}'),
    coalesce(x -> 'displayLevelByRegion', '{}'),
    coalesce((x ->> 'deprecated')::boolean, false),
    x ->> 'replacedBy'
  from jsonb_array_elements(p_data -> 'allergens') x
  on conflict (id) do update set
    name = excluded.name, aliases = excluded.aliases, parent_id = excluded.parent_id,
    regions = excluded.regions, display_level_by_region = excluded.display_level_by_region,
    deprecated = excluded.deprecated, replaced_by = excluded.replaced_by;

  insert into public.dict_ingredients as t (
    id, name, aliases, family, traits, category, default_storage, is_perishable, recent_days,
    density_g_per_ml, season_months, flavor_tags, allergen_ids, deprecated, replaced_by
  )
  select
    x ->> 'id',
    x -> 'name',
    coalesce(x -> 'aliases', '{"zh-TW": []}'),
    x ->> 'family',
    coalesce(array(select jsonb_array_elements_text(x -> 'traits')), '{}'),
    x ->> 'category',
    x ->> 'defaultStorage',
    (x ->> 'isPerishable')::boolean,
    (x ->> 'recentDays')::smallint,
    (x ->> 'densityGPerMl')::numeric,
    coalesce(x -> 'seasonMonths', '{}'),
    coalesce(array(select jsonb_array_elements_text(x -> 'flavorTags')), '{}'),
    coalesce(array(select jsonb_array_elements_text(x -> 'allergenIds')), '{}'),
    coalesce((x ->> 'deprecated')::boolean, false),
    x ->> 'replacedBy'
  from jsonb_array_elements(p_data -> 'ingredients') x
  on conflict (id) do update set
    name = excluded.name, aliases = excluded.aliases, family = excluded.family, traits = excluded.traits,
    category = excluded.category, default_storage = excluded.default_storage,
    is_perishable = excluded.is_perishable, recent_days = excluded.recent_days,
    density_g_per_ml = excluded.density_g_per_ml, season_months = excluded.season_months,
    flavor_tags = excluded.flavor_tags, allergen_ids = excluded.allergen_ids,
    deprecated = excluded.deprecated, replaced_by = excluded.replaced_by;

  insert into public.dict_dietary_restrictions as t (id, name, excludes_traits, excludes_ingredient_ids, deprecated, replaced_by)
  select
    x ->> 'id',
    x -> 'name',
    coalesce(array(select jsonb_array_elements_text(x -> 'excludesTraits')), '{}'),
    coalesce(array(select jsonb_array_elements_text(x -> 'excludesIngredientIds')), '{}'),
    coalesce((x ->> 'deprecated')::boolean, false),
    x ->> 'replacedBy'
  from jsonb_array_elements(p_data -> 'dietaryRestrictions') x
  on conflict (id) do update set
    name = excluded.name, excludes_traits = excluded.excludes_traits,
    excludes_ingredient_ids = excluded.excludes_ingredient_ids,
    deprecated = excluded.deprecated, replaced_by = excluded.replaced_by;

  insert into public.dict_techniques as t (id, name, technique_group, safety_rule_id, deprecated, replaced_by)
  select
    x ->> 'id',
    x -> 'name',
    x ->> 'group',
    x ->> 'safetyRuleId',
    coalesce((x ->> 'deprecated')::boolean, false),
    x ->> 'replacedBy'
  from jsonb_array_elements(coalesce(p_data -> 'techniques', '[]')) x
  on conflict (id) do update set
    name = excluded.name, technique_group = excluded.technique_group, safety_rule_id = excluded.safety_rule_id,
    deprecated = excluded.deprecated, replaced_by = excluded.replaced_by;

  insert into public.dict_equipment_types as t (
    id, name, aliases, regions, category, techniques, optional_techniques, requires_heat_source,
    is_heat_source, assists, onboarding, dishwasher_safe, icon_key, deprecated, replaced_by
  )
  select
    x ->> 'id',
    x -> 'name',
    coalesce(x -> 'aliases', '{"zh-TW": []}'),
    coalesce(array(select jsonb_array_elements_text(x -> 'regions')), '{}'),
    x ->> 'category',
    coalesce(array(select jsonb_array_elements_text(x -> 'techniques')), '{}'),
    coalesce(array(select jsonb_array_elements_text(x -> 'optionalTechniques')), '{}'),
    (x ->> 'requiresHeatSource')::boolean,
    (x ->> 'isHeatSource')::boolean,
    coalesce(array(select jsonb_array_elements_text(x -> 'assists')), '{}'),
    x -> 'onboarding',
    x ->> 'dishwasherSafe',
    x ->> 'iconKey',
    coalesce((x ->> 'deprecated')::boolean, false),
    x ->> 'replacedBy'
  from jsonb_array_elements(coalesce(p_data -> 'equipmentTypes', '[]')) x
  on conflict (id) do update set
    name = excluded.name, aliases = excluded.aliases, regions = excluded.regions, category = excluded.category,
    techniques = excluded.techniques, optional_techniques = excluded.optional_techniques,
    requires_heat_source = excluded.requires_heat_source, is_heat_source = excluded.is_heat_source,
    assists = excluded.assists, onboarding = excluded.onboarding, dishwasher_safe = excluded.dishwasher_safe,
    icon_key = excluded.icon_key, deprecated = excluded.deprecated, replaced_by = excluded.replaced_by;

  insert into public.dict_regions as t (
    code, name, hemisphere, default_timezone, default_locale, default_units, seasons,
    uses_solar_terms, holidays, common_pantry_ingredient_ids, staple_ingredient_ids, data_status, deprecated, replaced_by
  )
  select
    x ->> 'code',
    x -> 'name',
    x ->> 'hemisphere',
    x ->> 'defaultTimezone',
    x ->> 'defaultLocale',
    x -> 'defaultUnits',
    x -> 'seasons',
    coalesce((x ->> 'usesSolarTerms')::boolean, false),
    coalesce(x -> 'holidays', '[]'),
    coalesce(array(select jsonb_array_elements_text(x -> 'commonPantryIngredientIds')), '{}'),
    coalesce(array(select jsonb_array_elements_text(x -> 'stapleIngredientIds')), '{}'),
    x ->> 'dataStatus',
    coalesce((x ->> 'deprecated')::boolean, false),
    x ->> 'replacedBy'
  from jsonb_array_elements(coalesce(p_data -> 'regions', '[]')) x
  on conflict (code) do update set
    name = excluded.name, hemisphere = excluded.hemisphere, default_timezone = excluded.default_timezone,
    default_locale = excluded.default_locale, default_units = excluded.default_units, seasons = excluded.seasons,
    uses_solar_terms = excluded.uses_solar_terms, holidays = excluded.holidays,
    common_pantry_ingredient_ids = excluded.common_pantry_ingredient_ids,
    staple_ingredient_ids = excluded.staple_ingredient_ids, data_status = excluded.data_status,
    deprecated = excluded.deprecated, replaced_by = excluded.replaced_by;

  insert into public.dict_preference_dimensions as t (key, dimension_group, name, parent_key, impact, deprecated, replaced_by)
  select
    x ->> 'key',
    x ->> 'group',
    x -> 'name',
    x ->> 'parentKey',
    (x ->> 'impact')::numeric,
    coalesce((x ->> 'deprecated')::boolean, false),
    x ->> 'replacedBy'
  from jsonb_array_elements(coalesce(p_data -> 'preferenceDimensions', '[]')) x
  on conflict (key) do update set
    dimension_group = excluded.dimension_group, name = excluded.name, parent_key = excluded.parent_key,
    impact = excluded.impact, deprecated = excluded.deprecated, replaced_by = excluded.replaced_by;

  insert into public.dict_quiz_items as t (
    id, item_type, title, description, regions, mapping, excluded_allergen_ids, excluded_restriction_ids,
    follow_ups, options, spectrum, context_field, deprecated, replaced_by
  )
  select
    x ->> 'id',
    x ->> 'type',
    x -> 'title',
    x -> 'description',
    coalesce(array(select jsonb_array_elements_text(x -> 'regions')), '{}'),
    coalesce(x -> 'mapping', '{}'),
    coalesce(array(select jsonb_array_elements_text(x -> 'excludedAllergenIds')), '{}'),
    coalesce(array(select jsonb_array_elements_text(x -> 'excludedRestrictionIds')), '{}'),
    coalesce(array(select jsonb_array_elements_text(x -> 'followUps')), '{}'),
    x -> 'options',
    x -> 'spectrum',
    x ->> 'contextField',
    coalesce((x ->> 'deprecated')::boolean, false),
    x ->> 'replacedBy'
  from jsonb_array_elements(coalesce(p_data -> 'quizItems', '[]')) x
  on conflict (id) do update set
    item_type = excluded.item_type, title = excluded.title, description = excluded.description,
    regions = excluded.regions, mapping = excluded.mapping,
    excluded_allergen_ids = excluded.excluded_allergen_ids,
    excluded_restriction_ids = excluded.excluded_restriction_ids, follow_ups = excluded.follow_ups,
    options = excluded.options, spectrum = excluded.spectrum, context_field = excluded.context_field,
    deprecated = excluded.deprecated, replaced_by = excluded.replaced_by;

  -- 難易度只存五個面向（字典檔 failureRisk → failure_risk）
  insert into public.dict_base_dishes as t (
    id, name, regions, cuisine_keys, ingredient_ids, techniques, equipment_type_ids, difficulty, deprecated, replaced_by
  )
  select
    x ->> 'id',
    x -> 'name',
    coalesce(array(select jsonb_array_elements_text(x -> 'regions')), '{}'),
    coalesce(array(select jsonb_array_elements_text(x -> 'cuisineKeys')), '{}'),
    coalesce(array(select jsonb_array_elements_text(x -> 'ingredientIds')), '{}'),
    coalesce(array(select jsonb_array_elements_text(x -> 'techniques')), '{}'),
    coalesce(array(select jsonb_array_elements_text(x -> 'equipmentTypeIds')), '{}'),
    jsonb_build_object(
      'ingredients', x #> '{difficulty,ingredients}',
      'equipment', x #> '{difficulty,equipment}',
      'time', x #> '{difficulty,time}',
      'technique', x #> '{difficulty,technique}',
      'failure_risk', x #> '{difficulty,failureRisk}'
    ),
    coalesce((x ->> 'deprecated')::boolean, false),
    x ->> 'replacedBy'
  from jsonb_array_elements(coalesce(p_data -> 'baseDishes', '[]')) x
  on conflict (id) do update set
    name = excluded.name, regions = excluded.regions, cuisine_keys = excluded.cuisine_keys,
    ingredient_ids = excluded.ingredient_ids, techniques = excluded.techniques,
    equipment_type_ids = excluded.equipment_type_ids, difficulty = excluded.difficulty,
    deprecated = excluded.deprecated, replaced_by = excluded.replaced_by;

  -- 陣列裡的參照（外鍵做不到的部分）
  select string_agg(distinct a, ', ') into v_missing
  from public.dict_ingredients i, unnest(i.allergen_ids) a
  where a not in (select id from public.dict_allergens);
  if v_missing is not null then
    raise exception 'unknown_allergen: %', v_missing using errcode = '23503';
  end if;

  select string_agg(distinct a, ', ') into v_missing
  from public.dict_dietary_restrictions r, unnest(r.excludes_ingredient_ids) a
  where a not in (select id from public.dict_ingredients);
  if v_missing is not null then
    raise exception 'unknown_ingredient: %', v_missing using errcode = '23503';
  end if;

  select string_agg(distinct a, ', ') into v_missing
  from public.dict_equipment_types e, unnest(e.techniques || e.optional_techniques || e.assists) a
  where a not in (select id from public.dict_techniques);
  if v_missing is not null then
    raise exception 'unknown_technique: %', v_missing using errcode = '23503';
  end if;

  select string_agg(distinct a, ', ') into v_missing
  from public.dict_regions r, unnest(r.common_pantry_ingredient_ids || r.staple_ingredient_ids) a
  where a not in (select id from public.dict_ingredients);
  if v_missing is not null then
    raise exception 'unknown_ingredient: %', v_missing using errcode = '23503';
  end if;

  select string_agg(distinct a, ', ') into v_missing
  from public.dict_quiz_items q, jsonb_object_keys(q.mapping) a
  where a not in (select key from public.dict_preference_dimensions);
  if v_missing is not null then
    raise exception 'unknown_dimension: %', v_missing using errcode = '23503';
  end if;

  -- 二選一的選項、光譜、情境題「想學」指到的維度都要存在
  select string_agg(distinct a, ', ') into v_missing
  from (
    select o.key as a
    from public.dict_quiz_items q,
      jsonb_array_elements(coalesce(q.options, '[]')) opt,
      jsonb_object_keys(coalesce(opt -> 'mapping', '{}')) o(key)
    union all
    select q.spectrum ->> 'dimension' from public.dict_quiz_items q where q.spectrum is not null
    union all
    select opt ->> 'addGoal' from public.dict_quiz_items q, jsonb_array_elements(coalesce(q.options, '[]')) opt
      where opt ->> 'addGoal' is not null
  ) s
  where a not in (select key from public.dict_preference_dimensions);
  if v_missing is not null then
    raise exception 'unknown_dimension: %', v_missing using errcode = '23503';
  end if;

  select string_agg(distinct a, ', ') into v_missing
  from public.dict_quiz_items q, unnest(q.regions) a
  where a not in (select code from public.dict_regions);
  if v_missing is not null then
    raise exception 'unknown_region: %', v_missing using errcode = '23503';
  end if;

  select string_agg(distinct a, ', ') into v_missing
  from public.dict_quiz_items q, unnest(q.follow_ups) a
  where a not in (select id from public.dict_quiz_items);
  if v_missing is not null then
    raise exception 'unknown_quiz_item: %', v_missing using errcode = '23503';
  end if;

  select string_agg(distinct a, ', ') into v_missing
  from public.dict_quiz_items q, unnest(q.excluded_allergen_ids) a
  where a not in (select id from public.dict_allergens);
  if v_missing is not null then
    raise exception 'unknown_allergen: %', v_missing using errcode = '23503';
  end if;

  select string_agg(distinct a, ', ') into v_missing
  from public.dict_quiz_items q, unnest(q.excluded_restriction_ids) a
  where a not in (select id from public.dict_dietary_restrictions);
  if v_missing is not null then
    raise exception 'unknown_restriction: %', v_missing using errcode = '23503';
  end if;

  select string_agg(distinct a, ', ') into v_missing
  from public.dict_base_dishes b, unnest(b.regions) a
  where a not in (select code from public.dict_regions);
  if v_missing is not null then
    raise exception 'unknown_region: %', v_missing using errcode = '23503';
  end if;

  select string_agg(distinct a, ', ') into v_missing
  from public.dict_base_dishes b, unnest(b.cuisine_keys) a
  where a not in (select key from public.dict_preference_dimensions);
  if v_missing is not null then
    raise exception 'unknown_dimension: %', v_missing using errcode = '23503';
  end if;

  select string_agg(distinct a, ', ') into v_missing
  from public.dict_base_dishes b, unnest(b.ingredient_ids) a
  where a not in (select id from public.dict_ingredients);
  if v_missing is not null then
    raise exception 'unknown_ingredient: %', v_missing using errcode = '23503';
  end if;

  select string_agg(distinct a, ', ') into v_missing
  from public.dict_base_dishes b, unnest(b.techniques) a
  where a not in (select id from public.dict_techniques);
  if v_missing is not null then
    raise exception 'unknown_technique: %', v_missing using errcode = '23503';
  end if;

  select string_agg(distinct a, ', ') into v_missing
  from public.dict_base_dishes b, unnest(b.equipment_type_ids) a
  where a not in (select id from public.dict_equipment_types);
  if v_missing is not null then
    raise exception 'unknown_equipment: %', v_missing using errcode = '23503';
  end if;

  set constraints all immediate;

  insert into public.dict_version (id, version) values (true, p_data ->> 'version')
  on conflict (id) do update set version = excluded.version, imported_at = now();

  return p_data ->> 'version';
end;
$$;

revoke execute on function private.import_dictionaries(jsonb) from public, authenticated, service_role;
