-- 口味資料（M0-14）：口味維度、題庫、地區、基礎菜色四張字典，加上每個人的口味地圖與飲食限制。
-- 設計見 13 第八節、16 第三、四、八節、15。

---------------------------------------------------------------------------
-- 格式檢查
---------------------------------------------------------------------------

-- 地區代碼：兩個大寫字母（國家），可以加子區代碼：TW、JP、US-CA
create function private.is_region_code(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$';
$$;

-- 口味維度的 key：用點分層，第一段是群組：cuisine.southeast_asia.thai
create function private.is_dimension_key(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$';
$$;

-- 題目的 ID：小寫英文、數字、底線：card_tom_yum
create function private.is_quiz_item_id(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value ~ '^[a-z0-9]+(_[a-z0-9]+)*$';
$$;

-- 全站的地區代碼放寬成可以帶子區（美國加州 US-CA）；舊資料（TW）仍然合法
alter table public.kitchens drop constraint kitchens_region_check;
alter table public.kitchens add constraint kitchens_region_check check (private.is_region_code(region));

---------------------------------------------------------------------------
-- 字典表
---------------------------------------------------------------------------

create table public.dict_regions (
  code text primary key check (private.is_region_code(code)),
  name jsonb not null check (private.is_localized_text(name)),
  hemisphere text not null check (hemisphere in ('north', 'south')),
  default_timezone text not null check (char_length(default_timezone) between 1 and 64),
  default_locale text not null check (default_locale in ('zh-TW')),
  default_units jsonb not null check (extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["temperature", "measure"],
      "properties": {
        "temperature": { "enum": ["C", "F"] },
        "measure": { "enum": ["metric", "us"] }
      },
      "additionalProperties": false
    }'::json, default_units)),
  seasons jsonb not null check (extensions.jsonb_matches_schema(
    '{
      "type": "array",
      "items": {
        "type": "object",
        "required": ["key", "months"],
        "properties": {
          "key": { "enum": ["spring", "summer", "autumn", "winter"] },
          "months": { "type": "array", "items": { "type": "integer", "minimum": 1, "maximum": 12 } }
        },
        "additionalProperties": false
      }
    }'::json, seasons)),
  uses_solar_terms boolean not null default false,
  -- 節日（05 Holiday）：之後補地區資料時再定格式，現在先是空陣列
  holidays jsonb not null default '[]' check (jsonb_typeof(holidays) = 'array'),
  common_pantry_ingredient_ids text[] not null default '{}',
  data_status text not null check (data_status in ('full', 'partial')),
  deprecated boolean not null default false,
  replaced_by text references public.dict_regions (code) deferrable initially deferred
);

create table public.dict_preference_dimensions (
  key text primary key check (private.is_dimension_key(key)),
  dimension_group text not null check (dimension_group in (
    'cuisine', 'taste', 'spice_type', 'seasoning', 'texture', 'form', 'protein', 'ingredient', 'richness'
  )),
  name jsonb not null check (private.is_localized_text(name)),
  -- 樹狀：可以跨群組（辣的種類掛在 taste.spicy 底下）
  parent_key text references public.dict_preference_dimensions (key) deferrable initially deferred,
  impact numeric(3, 2) not null check (impact between 0 and 1),
  deprecated boolean not null default false,
  replaced_by text references public.dict_preference_dimensions (key) deferrable initially deferred,
  check (split_part(key, '.', 1) = dimension_group),
  check (parent_key is distinct from key)
);

create table public.dict_quiz_items (
  id text primary key check (private.is_quiz_item_id(id)),
  item_type text not null check (item_type in ('dish_card', 'this_or_that', 'spectrum', 'quick_fire', 'constraint', 'context')),
  title jsonb not null check (private.is_localized_text(title)),
  description jsonb check (private.is_localized_text(description)),
  regions text[] not null default '{}',
  -- 回答「喜歡」時各維度加多少（−1～1）；「不愛」時反向
  mapping jsonb not null default '{}' check (extensions.jsonb_matches_schema(
    '{ "type": "object", "additionalProperties": { "type": "number", "minimum": -1, "maximum": 1 } }'::json, mapping)),
  excluded_allergen_ids text[] not null default '{}',
  excluded_restriction_ids text[] not null default '{}',
  follow_ups text[] not null default '{}',
  deprecated boolean not null default false,
  replaced_by text references public.dict_quiz_items (id) deferrable initially deferred
);

create table public.dict_base_dishes (
  id text primary key check (private.is_dict_id(id)),
  name jsonb not null check (private.is_localized_text(name)),
  -- 空的代表各地都適合推薦
  regions text[] not null default '{}',
  cuisine_keys text[] not null default '{}',
  ingredient_ids text[] not null default '{}',
  techniques text[] not null default '{}',
  equipment_type_ids text[] not null default '{}',
  -- 五個面向各 1–5；總分不存，要用時以 private.difficulty_overall 算（和食譜同一個算法）
  difficulty jsonb not null check (
    extensions.jsonb_matches_schema(
      '{
        "type": "object",
        "required": ["ingredients", "equipment", "time", "technique", "failure_risk"],
        "properties": {
          "ingredients": { "type": "integer", "minimum": 1, "maximum": 5 },
          "equipment": { "type": "integer", "minimum": 1, "maximum": 5 },
          "time": { "type": "integer", "minimum": 1, "maximum": 5 },
          "technique": { "type": "integer", "minimum": 1, "maximum": 5 },
          "failure_risk": { "type": "integer", "minimum": 1, "maximum": 5 }
        },
        "additionalProperties": false
      }'::json, difficulty)
  ),
  deprecated boolean not null default false,
  replaced_by text references public.dict_base_dishes (id) deferrable initially deferred
);

alter table public.dict_regions enable row level security;
alter table public.dict_preference_dimensions enable row level security;
alter table public.dict_quiz_items enable row level security;
alter table public.dict_base_dishes enable row level security;

revoke all on public.dict_regions, public.dict_preference_dimensions, public.dict_quiz_items, public.dict_base_dishes
  from anon, authenticated;
grant select on public.dict_regions, public.dict_preference_dimensions, public.dict_quiz_items, public.dict_base_dishes
  to authenticated;

create policy "已登入的人可以讀" on public.dict_regions for select to authenticated using (true);
create policy "已登入的人可以讀" on public.dict_preference_dimensions for select to authenticated using (true);
create policy "已登入的人可以讀" on public.dict_quiz_items for select to authenticated using (true);
create policy "已登入的人可以讀" on public.dict_base_dishes for select to authenticated using (true);

---------------------------------------------------------------------------
-- 匯入：在原本的函式上加入地區、口味維度、題庫、基礎菜色（沒帶這四份的呼叫照舊可用）
---------------------------------------------------------------------------

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
    uses_solar_terms, holidays, common_pantry_ingredient_ids, data_status, deprecated, replaced_by
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
    x ->> 'dataStatus',
    coalesce((x ->> 'deprecated')::boolean, false),
    x ->> 'replacedBy'
  from jsonb_array_elements(coalesce(p_data -> 'regions', '[]')) x
  on conflict (code) do update set
    name = excluded.name, hemisphere = excluded.hemisphere, default_timezone = excluded.default_timezone,
    default_locale = excluded.default_locale, default_units = excluded.default_units, seasons = excluded.seasons,
    uses_solar_terms = excluded.uses_solar_terms, holidays = excluded.holidays,
    common_pantry_ingredient_ids = excluded.common_pantry_ingredient_ids, data_status = excluded.data_status,
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
    follow_ups, deprecated, replaced_by
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
    coalesce((x ->> 'deprecated')::boolean, false),
    x ->> 'replacedBy'
  from jsonb_array_elements(coalesce(p_data -> 'quizItems', '[]')) x
  on conflict (id) do update set
    item_type = excluded.item_type, title = excluded.title, description = excluded.description,
    regions = excluded.regions, mapping = excluded.mapping,
    excluded_allergen_ids = excluded.excluded_allergen_ids,
    excluded_restriction_ids = excluded.excluded_restriction_ids, follow_ups = excluded.follow_ups,
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
  from public.dict_regions r, unnest(r.common_pantry_ingredient_ids) a
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

---------------------------------------------------------------------------
-- 我的口味地圖（preference_profiles）：只有本人能讀寫
---------------------------------------------------------------------------

create table public.preference_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  schema_version smallint not null default 1,
  -- 每個維度的喜好與把握程度；key 對應 dict_preference_dimensions（由觸發器檢查）
  dims jsonb not null default '{}' check (extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["affinity", "confidence", "source", "updated_at"],
        "properties": {
          "affinity": { "type": "number", "minimum": -1, "maximum": 1 },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
          "source": { "enum": ["user_set", "explored", "learned"] },
          "updated_at": { "type": "string" }
        },
        "additionalProperties": false
      }
    }'::json, dims)),
  -- 情境：下廚頻率只用來調整點子難度，不顯示給任何人
  context jsonb not null default '{"adventure": 0.2, "goals": [], "festive_dishes": false}' check (extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["adventure", "goals", "festive_dishes"],
      "properties": {
        "cooking_frequency": { "enum": ["occasional", "weekly", "daily"] },
        "time_preference": { "enum": ["quick", "normal", "relaxed"] },
        "cooks_for": { "type": "array", "items": { "enum": ["self", "partner", "family", "guests"] } },
        "adventure": { "type": "number", "minimum": 0, "maximum": 1 },
        "goals": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 20 },
        "festive_dishes": { "type": "boolean" }
      },
      "additionalProperties": false
    }'::json, context)),
  answered_item_ids text[] not null default '{}' check (cardinality(answered_item_ids) <= 500),
  last_explored_at timestamptz,
  card_title text check (char_length(card_title) <= 40)
);

-- 寫入前：維度 key 都要在字典裡；時間欄位由資料庫設定
create function private.preference_profiles_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_unknown text;
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.schema_version := old.schema_version;
    new.updated_at := now();
  end if;

  select string_agg(k, ', ') into v_unknown
  from jsonb_object_keys(new.dims) k
  where k not in (select key from public.dict_preference_dimensions);
  if v_unknown is not null then
    raise exception 'unknown_dimension: %', v_unknown using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger preference_profiles_before_write before insert or update on public.preference_profiles
  for each row execute function private.preference_profiles_before_write();

alter table public.preference_profiles enable row level security;

revoke all on public.preference_profiles from anon, authenticated;
grant select, delete on public.preference_profiles to authenticated;
grant insert (user_id, dims, context, answered_item_ids, last_explored_at, card_title) on public.preference_profiles to authenticated;
grant update (dims, context, answered_item_ids, last_explored_at, card_title) on public.preference_profiles to authenticated;

create policy "本人讀自己的口味地圖" on public.preference_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "本人新增自己的口味地圖" on public.preference_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_active_user());
create policy "本人修改自己的口味地圖" on public.preference_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.is_active_user());
create policy "本人刪除自己的口味地圖" on public.preference_profiles
  for delete to authenticated
  using (user_id = (select auth.uid()) and private.is_active_user());

---------------------------------------------------------------------------
-- 飲食限制（dietary_profiles）：過敏、不吃的食物、飲食原則、週期性規則
-- M0 只有屬於使用者的；家人檔案（household_profile_id）等 M2 建 household_profiles 時再加。
---------------------------------------------------------------------------

create table public.dietary_profiles (
  id uuid primary key check (private.is_uuid_v7(id)),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  schema_version smallint not null default 1,
  allergen_ids text[] not null default '{}' check (cardinality(allergen_ids) <= 100),
  dislike_ingredient_ids text[] not null default '{}' check (cardinality(dislike_ingredient_ids) <= 300),
  dietary_restriction_ids text[] not null default '{}' check (cardinality(dietary_restriction_ids) <= 50),
  -- 週期性規則：初一十五吃素、齋戒月、每週某天無肉
  recurring_rules jsonb not null default '[]' check (extensions.jsonb_matches_schema(
    '{
      "type": "array",
      "maxItems": 20,
      "items": {
        "type": "object",
        "required": ["restriction_id", "schedule"],
        "properties": {
          "restriction_id": { "type": "string" },
          "schedule": { "enum": ["lunar_1_15", "weekly", "ramadan"] },
          "weekday": { "type": "integer", "minimum": 0, "maximum": 6 }
        },
        "additionalProperties": false
      }
    }'::json, recurring_rules)),
  -- 不用料理酒（米酒、紹興、味醂）
  no_cooking_alcohol boolean not null default false
);

-- 寫入前：ID 都要在字典裡；時間欄位由資料庫設定
create function private.dietary_profiles_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_unknown text;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.schema_version := old.schema_version;
    new.updated_at := now();
  end if;

  select string_agg(a, ', ') into v_unknown
  from unnest(new.allergen_ids) a where a not in (select id from public.dict_allergens);
  if v_unknown is not null then
    raise exception 'unknown_allergen: %', v_unknown using errcode = '23514';
  end if;

  select string_agg(a, ', ') into v_unknown
  from unnest(new.dislike_ingredient_ids) a where a not in (select id from public.dict_ingredients);
  if v_unknown is not null then
    raise exception 'unknown_ingredient: %', v_unknown using errcode = '23514';
  end if;

  select string_agg(a, ', ') into v_unknown
  from (
    select unnest(new.dietary_restriction_ids) a
    union all
    select r ->> 'restriction_id' from jsonb_array_elements(new.recurring_rules) r
  ) x
  where a not in (select id from public.dict_dietary_restrictions);
  if v_unknown is not null then
    raise exception 'unknown_restriction: %', v_unknown using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger dietary_profiles_before_write before insert or update on public.dietary_profiles
  for each row execute function private.dietary_profiles_before_write();

-- 讀得到這個人的飲食限制：本人；或同廚房、而且他選擇分享給家人
create function private.can_read_dietary(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner = (select auth.uid())
    or exists (
      select 1
      from public.kitchen_members me
      join public.kitchen_members other on other.kitchen_id = me.kitchen_id
      join public.kitchens k on k.id = me.kitchen_id
      where me.user_id = (select auth.uid()) and me.left_at is null
        and other.user_id = p_owner and other.left_at is null and other.share_dietary_info
        and k.deleted_at is null
    );
$$;

alter table public.dietary_profiles enable row level security;

revoke all on public.dietary_profiles from anon, authenticated;
grant select, delete on public.dietary_profiles to authenticated;
grant insert (id, user_id, allergen_ids, dislike_ingredient_ids, dietary_restriction_ids, recurring_rules, no_cooking_alcohol)
  on public.dietary_profiles to authenticated;
grant update (allergen_ids, dislike_ingredient_ids, dietary_restriction_ids, recurring_rules, no_cooking_alcohol)
  on public.dietary_profiles to authenticated;

create policy "本人和同意分享的家人可以讀" on public.dietary_profiles
  for select to authenticated
  using (private.can_read_dietary(user_id));
create policy "本人新增自己的飲食限制" on public.dietary_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_active_user());
create policy "本人修改自己的飲食限制" on public.dietary_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.is_active_user());
create policy "本人刪除自己的飲食限制" on public.dietary_profiles
  for delete to authenticated
  using (user_id = (select auth.uid()) and private.is_active_user());

---------------------------------------------------------------------------
-- 註冊時多建兩份空的（16 第八節），並補上已經有的帳號
---------------------------------------------------------------------------

create or replace function public.setup_new_user(
  p_user_id uuid,
  p_display_name text default '我',
  p_create_kitchen boolean default true,
  p_kitchen_name text default '我家',
  p_timezone text default 'Asia/Taipei',
  p_region text default 'TW'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kitchen_id uuid;
begin
  insert into public.user_profiles (user_id) values (p_user_id) on conflict do nothing;
  insert into public.user_identities (user_id, display_name)
    values (p_user_id, coalesce(nullif(btrim(p_display_name), ''), '我'))
    on conflict do nothing;
  insert into public.user_settings (user_id) values (p_user_id) on conflict do nothing;
  insert into public.preference_profiles (user_id) values (p_user_id) on conflict do nothing;
  insert into public.dietary_profiles (id, user_id) values (private.uuid_v7(), p_user_id) on conflict do nothing;

  select kitchen_id into v_kitchen_id
  from public.kitchen_members
  where user_id = p_user_id and left_at is null
  order by joined_at
  limit 1;

  if v_kitchen_id is null and p_create_kitchen then
    v_kitchen_id := private.uuid_v7();
    insert into public.kitchens (id, name, timezone, region, created_by, updated_by)
      values (v_kitchen_id, p_kitchen_name, p_timezone, p_region, p_user_id, p_user_id);
    insert into public.kitchen_members (id, kitchen_id, user_id, role)
      values (private.uuid_v7(), v_kitchen_id, p_user_id, 'admin');
  end if;

  update public.user_settings
    set current_kitchen_id = v_kitchen_id
    where user_id = p_user_id and current_kitchen_id is null and v_kitchen_id is not null;

  return v_kitchen_id;
end;
$$;

insert into public.preference_profiles (user_id)
  select user_id from public.user_profiles
  on conflict do nothing;
insert into public.dietary_profiles (id, user_id)
  select private.uuid_v7(), user_id from public.user_profiles
  on conflict do nothing;
