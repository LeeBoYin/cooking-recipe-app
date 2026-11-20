-- 我的食譜的搜尋：名稱與食材原文的關鍵字比對（02 搜尋、05 索引）。
-- M0 資料量小，先用 ilike；之後資料量大了再換 PGroonga，函式的介面不變。
-- security invoker：照呼叫者的權限讀（RLS），再限定只找自己已發佈、未刪除的食譜。

create function public.search_my_recipes(p_query text)
returns table (recipe_id uuid, match_kind text, match_text text)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    -- 把 \ % _ 當成一般字元，不當成萬用字元
    select '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
           btrim(p_query) <> '' as ok
  )
  select
    r.id,
    case when r.title ilike q.pat then 'title' else 'ingredient' end,
    case
      when r.title ilike q.pat then r.title
      else (select i->>'raw_text' from jsonb_array_elements(r.ingredients) i where i->>'raw_text' ilike q.pat limit 1)
    end
  from public.recipes r, q
  where q.ok
    and r.user_id = (select auth.uid())
    and r.status = 'published'
    and r.deleted_at is null
    and (
      r.title ilike q.pat
      or exists (select 1 from jsonb_array_elements(r.ingredients) i where i->>'raw_text' ilike q.pat)
    )
  order by r.published_at desc, r.id desc
  limit 200;
$$;

revoke execute on function public.search_my_recipes(text) from public, anon;
grant execute on function public.search_my_recipes(text) to authenticated;
