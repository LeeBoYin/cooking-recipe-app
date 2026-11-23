-- M1b-03：作者動過的難易度（source = 'author'），AI 不能再覆寫（03〈難易度〉）。
-- 寫在觸發器：不管是用說的、發佈後整理、還是之後的連接器，只要想把 author 的難易度換成 ai 估的，就維持原本的。
-- 作者自己改（source 還是 author）或清掉（null）都照常；只擋「author → ai」。
create function private.keep_author_difficulty()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.difficulty is not null and old.difficulty->>'source' = 'author'
     and new.difficulty is not null and new.difficulty->>'source' = 'ai' then
    new.difficulty := old.difficulty;
  end if;
  return new;
end;
$$;

create trigger keep_author_difficulty before update of difficulty on public.recipes
  for each row execute function private.keep_author_difficulty();
