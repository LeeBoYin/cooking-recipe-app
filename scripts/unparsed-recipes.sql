-- 還沒解析過食材的食譜（任何一列食材沒有 ingredient_id、amount、unit），輸出成一個 JSON：[{ id, ingredients }]
select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ingredients', ingredients)), '[]'::jsonb)
from public.recipes
where deleted_at is null
  and exists (
    select 1 from jsonb_array_elements(ingredients) i
    where not (i ? 'ingredient_id' or i ? 'amount' or i ? 'unit')
  );
