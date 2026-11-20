-- 廚具與手法字典（07）、廚房的廚具（kitchen_equipment）。
-- 字典唯讀、整批匯入，規則同 20261120000004；廚具是廚房資料，同廚房成員都能新增、修改、刪除，
-- 不需要 RPC（單一資料表、沒有衍生欄位）。照片等 photos 表建好後再接。

---------------------------------------------------------------------------
-- 字典表
---------------------------------------------------------------------------

create table public.dict_techniques (
  id text primary key check (private.is_dict_id(id)),
  name jsonb not null check (private.is_localized_text(name)),
  technique_group text not null check (technique_group in ('heat', 'no-heat', 'time-temp')),
  -- 需要安全檢查的手法對應的規則（例：SR-sous-vide）；規則本身在程式碼庫維護
  safety_rule_id text,
  deprecated boolean not null default false,
  replaced_by text references public.dict_techniques (id) deferrable initially deferred
);

create table public.dict_equipment_types (
  id text primary key check (private.is_dict_id(id)),
  name jsonb not null check (private.is_localized_text(name)),
  aliases jsonb not null default '{"zh-TW": []}' check (private.is_localized_terms(aliases)),
  regions text[] not null default '{}',
  category text not null check (category in (
    'heat-source', 'cookware', 'appliance', 'blending', 'knife-prep', 'special', 'measuring', 'baking'
  )),
  techniques text[] not null default '{}',
  optional_techniques text[] not null default '{}',
  requires_heat_source boolean not null,
  is_heat_source boolean not null,
  assists text[] not null default '{}',
  onboarding jsonb not null check (extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["default"],
      "properties": {
        "default": { "enum": ["default-on", "show", "hidden"] },
        "byRegion": { "type": "object", "additionalProperties": { "enum": ["default-on", "show", "hidden"] } }
      },
      "additionalProperties": false
    }'::json,
    onboarding
  )),
  dishwasher_safe text not null check (dishwasher_safe in ('yes', 'partial', 'no', 'n/a')),
  icon_key text not null,
  deprecated boolean not null default false,
  replaced_by text references public.dict_equipment_types (id) deferrable initially deferred,
  check (not (requires_heat_source and is_heat_source))
);

alter table public.dict_techniques enable row level security;
alter table public.dict_equipment_types enable row level security;
revoke all on public.dict_techniques, public.dict_equipment_types from anon, authenticated;
grant select on public.dict_techniques, public.dict_equipment_types to authenticated;
create policy "已登入的人可以讀" on public.dict_techniques for select to authenticated using (true);
create policy "已登入的人可以讀" on public.dict_equipment_types for select to authenticated using (true);

---------------------------------------------------------------------------
-- 匯入：在原本的函式上加入手法與廚具（沒帶這兩份的呼叫照舊可用）
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

  set constraints all immediate;

  insert into public.dict_version (id, version) values (true, p_data ->> 'version')
  on conflict (id) do update set version = excluded.version, imported_at = now();

  return p_data ->> 'version';
end;
$$;

revoke execute on function private.import_dictionaries(jsonb) from public, authenticated, service_role;

---------------------------------------------------------------------------
-- 廚房的廚具
---------------------------------------------------------------------------

create table public.kitchen_equipment (
  id uuid primary key check (private.is_uuid_v7(id)),
  kitchen_id uuid not null references public.kitchens (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 對應到字典；自訂的廚具為空，不參與推薦（限制：有資料時字典項目不能刪）
  equipment_type_id text references public.dict_equipment_types (id) on delete restrict,
  -- 使用者取的名字（「阿嬤的鐵鍋」）；選了字典項目時預設填字典的名稱
  raw_name text not null check (char_length(btrim(raw_name)) between 1 and 60),
  brand text check (char_length(brand) <= 60),
  model text check (char_length(model) <= 60),
  -- 容量：原始值＋原始單位（10 人份、5 公升、6 吋），顯示時才換算
  capacity_value numeric(8, 2) check (capacity_value > 0),
  capacity_unit text check (char_length(capacity_unit) between 1 and 20),
  -- 類型有選配功能時，使用者回答「有」的（例：烤箱有熱風 → air-fry）；其他手法不能手動改
  enabled_optional_techniques text[] not null default '{}',
  -- 使用者修正自己這件能不能進洗碗機；空值代表照字典
  dishwasher_safe boolean,
  acquired_at date,
  description text check (char_length(description) <= 500),
  check ((capacity_value is null) = (capacity_unit is null)),
  check (equipment_type_id is not null or enabled_optional_techniques = '{}')
);

create index kitchen_equipment_kitchen on public.kitchen_equipment (kitchen_id);

-- 寫入前：記下誰改的；選配手法只能是字典該類型列出的
create function private.kitchen_equipment_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed text[];
begin
  new.updated_by := (select auth.uid());
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  if new.enabled_optional_techniques <> '{}' then
    select optional_techniques into v_allowed from public.dict_equipment_types where id = new.equipment_type_id;
    if not (new.enabled_optional_techniques <@ coalesce(v_allowed, '{}')) then
      raise exception 'invalid_optional_technique' using errcode = '23514',
        hint = '選配手法只能是字典列出的';
    end if;
    new.enabled_optional_techniques := array(select distinct unnest(new.enabled_optional_techniques) order by 1);
  end if;
  return new;
end;
$$;

create trigger kitchen_equipment_before_write before insert or update on public.kitchen_equipment
  for each row execute function private.kitchen_equipment_before_write();

---------------------------------------------------------------------------
-- 權限（RLS）：同廚房成員讀、新增、修改、刪除；寫入要帳號啟用中
---------------------------------------------------------------------------

alter table public.kitchen_equipment enable row level security;

revoke all on public.kitchen_equipment from anon, authenticated;
grant select, delete on public.kitchen_equipment to authenticated;
grant insert (
  id, kitchen_id, equipment_type_id, raw_name, brand, model, capacity_value, capacity_unit,
  enabled_optional_techniques, dishwasher_safe, acquired_at, description
) on public.kitchen_equipment to authenticated;
-- 不能改 id、所屬廚房與建立資訊
grant update (
  equipment_type_id, raw_name, brand, model, capacity_value, capacity_unit,
  enabled_optional_techniques, dishwasher_safe, acquired_at, description
) on public.kitchen_equipment to authenticated;

create policy "成員可以讀廚具" on public.kitchen_equipment
  for select to authenticated
  using (private.is_kitchen_member(kitchen_id));
create policy "成員可以新增廚具" on public.kitchen_equipment
  for insert to authenticated
  with check (private.is_kitchen_member(kitchen_id) and private.is_active_user());
create policy "成員可以改廚具" on public.kitchen_equipment
  for update to authenticated
  using (private.is_kitchen_member(kitchen_id))
  with check (private.is_kitchen_member(kitchen_id) and private.is_active_user());
create policy "成員可以刪廚具" on public.kitchen_equipment
  for delete to authenticated
  using (private.is_kitchen_member(kitchen_id) and private.is_active_user());

alter publication supabase_realtime add table public.kitchen_equipment;
