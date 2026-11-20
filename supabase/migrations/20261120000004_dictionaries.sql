-- 字典（16 第三節〈字典〉）：唯一來源是程式碼庫裡的字典檔，每次部署整批匯入；使用者與 App 都不能寫。
-- 字典 ID 永遠不刪、不改名；淘汰的標 deprecated，所以其他表的外鍵用「限制」也不會擋到部署。
-- 這次先建食材相關的三種；廚具與手法、口味地圖、地區、基礎菜色在各自的功能一起加。

---------------------------------------------------------------------------
-- 格式檢查
---------------------------------------------------------------------------

-- LocalizedText：{ "zh-TW": "醬油", "ja": "醤油" }，繁中必填
create function private.is_localized_text(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["zh-TW"],
      "properties": { "zh-TW": { "type": "string", "minLength": 1 } },
      "additionalProperties": { "type": "string", "minLength": 1 }
    }'::json,
    value
  );
$$;

-- LocalizedTerms：{ "zh-TW": ["生抽"] }，繁中必填（可以是空陣列）
create function private.is_localized_terms(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["zh-TW"],
      "additionalProperties": { "type": "array", "items": { "type": "string", "minLength": 1 } }
    }'::json,
    value
  );
$$;

create function private.is_dict_id(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value ~ '^[a-z0-9]+(-[a-z0-9]+)*$';
$$;

---------------------------------------------------------------------------
-- 資料表
---------------------------------------------------------------------------

-- 目前資料庫裡的字典版本（字典檔內容的雜湊）
create table public.dict_version (
  id boolean primary key default true check (id),
  version text not null,
  imported_at timestamptz not null default now()
);

create table public.dict_allergens (
  id text primary key check (private.is_dict_id(id)),
  name jsonb not null check (private.is_localized_text(name)),
  aliases jsonb not null default '{"zh-TW": []}' check (private.is_localized_terms(aliases)),
  parent_id text references public.dict_allergens (id) deferrable initially deferred,
  regions text[] not null default '{}',
  display_level_by_region jsonb not null default '{}',
  deprecated boolean not null default false,
  replaced_by text references public.dict_allergens (id) deferrable initially deferred
);

create table public.dict_ingredients (
  id text primary key check (private.is_dict_id(id)),
  name jsonb not null check (private.is_localized_text(name)),
  aliases jsonb not null default '{"zh-TW": []}' check (private.is_localized_terms(aliases)),
  family text not null check (private.is_dict_id(family)),
  traits text[] not null default '{}' check (
    traits <@ array['animal', 'meat', 'pork', 'beef', 'lamb', 'poultry', 'seafood', 'shellfish', 'egg', 'dairy', 'honey', 'alcohol', 'allium']
  ),
  category text not null check (category in (
    'vegetable', 'fruit', 'mushroom', 'meat', 'poultry', 'seafood', 'egg', 'dairy', 'tofu-bean',
    'grain', 'noodle', 'seasoning', 'sauce', 'spice', 'herb', 'oil', 'nut-seed', 'dried-goods', 'processed', 'beverage', 'other'
  )),
  default_storage text not null check (default_storage in ('seasoning', 'fridge', 'freezer', 'pantry')),
  is_perishable boolean not null,
  recent_days smallint check (recent_days between 1 and 60),
  density_g_per_ml numeric(6, 3) check (density_g_per_ml > 0),
  season_months jsonb not null default '{}',
  flavor_tags text[] not null default '{}' check (
    flavor_tags <@ array['salty', 'sweet', 'sour', 'spicy', 'umami', 'aromatic', 'bitter']
  ),
  allergen_ids text[] not null default '{}',
  deprecated boolean not null default false,
  replaced_by text references public.dict_ingredients (id) deferrable initially deferred,
  check (is_perishable or recent_days is null)
);

create table public.dict_dietary_restrictions (
  id text primary key check (private.is_dict_id(id)),
  name jsonb not null check (private.is_localized_text(name)),
  excludes_traits text[] not null default '{}' check (
    excludes_traits <@ array['animal', 'meat', 'pork', 'beef', 'lamb', 'poultry', 'seafood', 'shellfish', 'egg', 'dairy', 'honey', 'alcohol', 'allium']
  ),
  excludes_ingredient_ids text[] not null default '{}',
  deprecated boolean not null default false,
  replaced_by text references public.dict_dietary_restrictions (id) deferrable initially deferred
);

---------------------------------------------------------------------------
-- 權限：所有已登入的人可以讀，沒有人能從 App 寫
---------------------------------------------------------------------------

alter table public.dict_version enable row level security;
alter table public.dict_allergens enable row level security;
alter table public.dict_ingredients enable row level security;
alter table public.dict_dietary_restrictions enable row level security;

revoke all on public.dict_version, public.dict_allergens, public.dict_ingredients, public.dict_dietary_restrictions
  from anon, authenticated;
grant select on public.dict_version, public.dict_allergens, public.dict_ingredients, public.dict_dietary_restrictions
  to authenticated;

create policy "已登入的人可以讀" on public.dict_version for select to authenticated using (true);
create policy "已登入的人可以讀" on public.dict_allergens for select to authenticated using (true);
create policy "已登入的人可以讀" on public.dict_ingredients for select to authenticated using (true);
create policy "已登入的人可以讀" on public.dict_dietary_restrictions for select to authenticated using (true);

---------------------------------------------------------------------------
-- 匯入：一次交易裡整批更新，全部成功或全部不做
---------------------------------------------------------------------------
-- p_data 的格式和字典檔相同（camelCase）：
--   { "version": "…", "allergens": [...], "ingredients": [...], "dietaryRestrictions": [...] }
-- 規則：已經在資料庫裡的 ID 不能從字典檔消失（要淘汰就標 deprecated）；參照到的 ID 都要存在。
create function private.import_dictionaries(p_data jsonb)
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

  set constraints all immediate;

  insert into public.dict_version (id, version) values (true, p_data ->> 'version')
  on conflict (id) do update set version = excluded.version, imported_at = now();

  return p_data ->> 'version';
end;
$$;

revoke execute on function private.import_dictionaries(jsonb) from public, authenticated, service_role;
