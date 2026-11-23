-- M1b-04b：發佈後整理與大廚的一句話（03〈AI 功能清單〉發佈後整理、〈難易度〉；05 RecipePrivate.chefNote、BackgroundJob）。
-- 一、recipe_private.chef_note：第一次發佈時大廚的一句話，只有作者讀得到；使用者不能寫，只有 ai 函式經 save_chef_note 寫入。
-- 二、背景任務 post_publish：發佈（或已發佈的食譜改了內容）時由觸發器排隊，background-jobs 補標籤與難易度。
--     觸發器不會丟錯：發佈一定先成功，排隊失敗只是少了標籤。
-- 三、ai_suggestion_cache.kind 拿掉 observation（記錄時的一句話改存在 recipe_private）。

---------------------------------------------------------------------------
-- 一、大廚的一句話
---------------------------------------------------------------------------
alter table public.recipe_private
  add column chef_note jsonb check (chef_note is null or extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["text", "at"],
      "properties": {
        "text": { "type": "string", "minLength": 1, "maxLength": 80 },
        "at": { "type": "string", "maxLength": 40 }
      },
      "additionalProperties": false
    }'::json, chef_note));
-- 欄位層級的寫入權限（20261120000008）沒有包含 chef_note：作者只能讀，寫入只走 save_chef_note

-- 這一篇現在可不可以請大廚說一句話：自己的、已發佈、剛發佈（10 分鐘內，也就是「草稿第一次發佈」）、還沒有一句話。
-- 回傳那一篇的文字內容；不符合就回 null。
create function public.chef_note_context(p_user uuid, p_recipe uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'lang', r.lang,
    'title', r.title,
    'story', r.story,
    'tips', r.tips,
    'ingredients', coalesce((select jsonb_agg(i ->> 'raw_text') from jsonb_array_elements(r.ingredients) i), '[]'),
    'steps', coalesce((select jsonb_agg(s ->> 'text' order by (s ->> 'order')::int) from jsonb_array_elements(r.steps) s), '[]')
  )
  from public.recipes r
  where r.id = p_recipe and r.user_id = p_user and r.status = 'published' and r.deleted_at is null
    and r.published_at > now() - interval '10 minutes'
    and not exists (select 1 from public.recipe_private p where p.recipe_id = r.id and p.chef_note is not null);
$$;

-- 存一句話：只存一次（已經有就不蓋掉）。回傳有沒有真的存進去。
create function public.save_chef_note(p_user uuid, p_recipe uuid, p_text text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
begin
  if v_text = '' or char_length(v_text) > 80 then
    return false;
  end if;
  if not exists (select 1 from public.recipes r where r.id = p_recipe and r.user_id = p_user and r.status = 'published' and r.deleted_at is null) then
    return false;
  end if;
  insert into public.recipe_private (recipe_id, user_id, chef_note)
  values (p_recipe, p_user, jsonb_build_object('text', v_text, 'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
  on conflict (recipe_id) do update set chef_note = excluded.chef_note
    where public.recipe_private.chef_note is null;
  return found;
end;
$$;

---------------------------------------------------------------------------
-- 二、發佈後整理（背景任務 post_publish）
---------------------------------------------------------------------------
alter table public.background_jobs drop constraint background_jobs_kind_check;
alter table public.background_jobs add constraint background_jobs_kind_check
  check (kind in ('normalize_ingredients', 'post_publish'));

-- 排隊：同一篇同時只會有一筆（dedupe_key 是食譜 ID）。已經排著的遇到「做法改了」就升級成 edit。
-- 預算用完、AI 關閉都照樣排：背景任務執行時才檢查，暫停排隊、之後再處理。
create function private.enqueue_post_publish(p_recipe uuid, p_user uuid, p_mode text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  if (select count(*) from public.background_jobs where kind = 'post_publish' and status = 'pending') >= 1000 then
    return;
  end if;
  insert into public.background_jobs (kind, dedupe_key, payload, requested_by)
  values ('post_publish', p_recipe::text, jsonb_build_object('mode', p_mode), p_user)
  on conflict (kind, dedupe_key) where status in ('pending', 'running') do update
    set payload = jsonb_build_object('mode',
      case when public.background_jobs.payload ->> 'mode' = 'edit' or excluded.payload ->> 'mode' = 'edit' then 'edit' else 'publish' end);
end;
$$;

-- 食譜發佈、或已發佈的食譜改了文字內容（菜名、心得、食材、做法、筆記）就排隊。
-- 背景回填（食材正規化、發佈後整理自己的寫入）會設 app.keep_updated_at，不算「內容改了」。
-- 任何錯誤都吞掉：發佈與儲存不能被 AI 的排隊擋住。
create function private.recipes_post_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.keep_updated_at', true) = 'on' then
    return null;
  end if;
  begin
    if tg_op = 'UPDATE' and old.status = 'published' then
      if (old.title, old.story, old.tips, old.ingredients, old.steps) is distinct from (new.title, new.story, new.tips, new.ingredients, new.steps) then
        perform private.enqueue_post_publish(new.id, new.user_id, 'edit');
      end if;
    else
      perform private.enqueue_post_publish(new.id, new.user_id, 'publish');
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;
revoke execute on function private.recipes_post_publish() from public, anon, authenticated;

create trigger recipes_post_publish_ins after insert on public.recipes
  for each row when (new.status = 'published' and new.deleted_at is null)
  execute function private.recipes_post_publish();
create trigger recipes_post_publish_upd after update on public.recipes
  for each row when (new.status = 'published' and new.deleted_at is null and old.deleted_at is null)
  execute function private.recipes_post_publish();

-- 背景任務要處理的那一篇（給 background-jobs 用）：任務在執行中、食譜還在且已發佈才回傳。
-- difficulty_source：null＝還沒有難易度、'ai'、'author'。updated_at 之後交回 complete_post_publish 比對。
create function public.post_publish_context(p_job uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'recipe_id', r.id,
    'user_id', r.user_id,
    'mode', j.payload ->> 'mode',
    'lang', r.lang,
    'title', r.title,
    'story', r.story,
    'tips', r.tips,
    'ingredients', coalesce((select jsonb_agg(jsonb_build_object('text', i ->> 'raw_text', 'ingredient_id', i ->> 'ingredient_id')) from jsonb_array_elements(r.ingredients) i), '[]'),
    'steps', coalesce((select jsonb_agg(s ->> 'text' order by (s ->> 'order')::int) from jsonb_array_elements(r.steps) s), '[]'),
    'difficulty_source', r.difficulty ->> 'source',
    'tags_confirmed', coalesce((r.ai_tags ->> 'confirmed_by_user')::boolean, false),
    'updated_at', r.updated_at
  )
  from public.background_jobs j
  join public.recipes r on r.id = j.dedupe_key::uuid
  where j.id = p_job and j.kind = 'post_publish' and j.status = 'running'
    and r.status = 'published' and r.deleted_at is null;
$$;

-- 回報結果：標籤與難易度（有就寫、沒有就不動）。
--   • 標籤：主食材只收字典裡還在的 ID；使用者已經確認過的標籤（confirmed_by_user）不蓋掉。
--   • 難易度：只寫在「沒有」或「source = ai」的食譜上；作者動過的（author）不碰。
--   • 食譜在讀取之後又被改過（updated_at 比 p_read_at 新）：這次的結果不寫，任務放回佇列用 edit 再跑一次。
-- 寫入設 app.keep_updated_at：不改 updated_at（作者存檔時用它判斷衝突）、不排新的任務，也不算新的一版。
create function public.complete_post_publish(p_job uuid, p_tags jsonb, p_difficulty jsonb, p_read_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.background_jobs;
  v_r public.recipes;
  v_tags jsonb;
  v_diff jsonb;
  v_main text[];
begin
  select * into v_job from public.background_jobs where id = p_job and kind = 'post_publish' and status = 'running' for update;
  if not found then
    return false;
  end if;
  select * into v_r from public.recipes where id = v_job.dedupe_key::uuid for update;
  if not found or v_r.deleted_at is not null or v_r.status <> 'published' then
    update public.background_jobs set status = 'done', last_error = null, locked_at = null where id = p_job;
    return false;
  end if;
  if v_r.updated_at > p_read_at then
    update public.background_jobs
       set status = 'pending', attempts = greatest(attempts - 1, 0), locked_at = null, run_after = now(),
           payload = jsonb_build_object('mode', 'edit')
     where id = p_job;
    return false;
  end if;

  perform set_config('app.keep_updated_at', 'on', true);

  if p_tags is not null and not coalesce((v_r.ai_tags ->> 'confirmed_by_user')::boolean, false) then
    select coalesce(array_agg(d.id order by t.ord), '{}') into v_main
    from jsonb_array_elements_text(coalesce(p_tags -> 'main_ingredient_ids', '[]')) with ordinality as t(id, ord)
    join public.dict_ingredients d on d.id = t.id and not d.deprecated;
    v_tags := jsonb_build_object(
      'cuisine_keys', coalesce(p_tags -> 'cuisine_keys', '[]'),
      'main_ingredient_ids', to_jsonb(v_main),
      'techniques', coalesce(p_tags -> 'techniques', '[]'),
      'equipment_type_ids', coalesce(p_tags -> 'equipment_type_ids', '[]'),
      'confirmed_by_user', false
    );
    update public.recipes
       set ai_tags = v_tags,
           ingredient_ids = private.recipe_ingredient_ids(v_r.ingredients, v_tags)
     where id = v_r.id;
  end if;

  if p_difficulty is not null and (v_r.difficulty is null or v_r.difficulty ->> 'source' = 'ai') then
    v_diff := jsonb_build_object(
      'ingredients', p_difficulty -> 'ingredients',
      'equipment', p_difficulty -> 'equipment',
      'time', p_difficulty -> 'time',
      'technique', p_difficulty -> 'technique',
      'failure_risk', p_difficulty -> 'failure_risk',
      'source', 'ai',
      'estimated_from', coalesce(p_difficulty ->> 'estimated_from', 'recipe')
    );
    v_diff := jsonb_set(v_diff, '{overall}', to_jsonb(private.difficulty_overall(v_diff)));
    update public.recipes set difficulty = v_diff where id = v_r.id;
  end if;

  perform set_config('app.keep_updated_at', 'off', true);
  update public.background_jobs set status = 'done', last_error = null, locked_at = null where id = p_job;
  return true;
end;
$$;

---------------------------------------------------------------------------
-- 三、ai_suggestion_cache.kind 拿掉 observation
---------------------------------------------------------------------------
delete from public.ai_suggestion_cache where kind = 'observation';
alter table public.ai_suggestion_cache drop constraint ai_suggestion_cache_kind_check;
alter table public.ai_suggestion_cache add constraint ai_suggestion_cache_kind_check
  check (kind in ('home', 'chat', 'easter_egg'));

---------------------------------------------------------------------------
-- 權限：只給後端（service_role）
---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'chef_note_context(uuid, uuid)',
    'save_chef_note(uuid, uuid, text)',
    'post_publish_context(uuid)',
    'complete_post_publish(uuid, jsonb, jsonb, timestamptz)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
