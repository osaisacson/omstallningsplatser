-- 022: Man kan välja flera kategorier när man sparar ett inlägg i Minne.
alter table public.memory_votes add column if not exists themes text[];
update public.memory_votes set themes = array[theme] where theme is not null and themes is null;

-- Byte av namn på en kategori följer med i allas val.
create or replace function public.rename_memory_theme(p_old text, p_new text) returns void
language plpgsql security definer set search_path = public as $$
declare n text := btrim(p_new);
begin
  perform need_editor();
  if n = '' or length(n) > 40 then raise exception 'Skriv ett namn (högst 40 tecken).'; end if;
  if n = p_old then return; end if;
  if exists (select 1 from memory_themes where name = n) then
    delete from memory_themes where name = p_old;
  else
    update memory_themes set name = n where name = p_old;
    if not found then insert into memory_themes (name) values (n); end if;
  end if;
  update memory_votes set theme = n where theme = p_old;
  update memory_votes set themes = array(select distinct x from unnest(array_replace(themes, p_old, n)) x) where p_old = any(themes);
  update posts set memory_theme = n where memory_theme = p_old;
  update posts set memory_themes = array(select distinct x from unnest(array_replace(memory_themes, p_old, n)) x) where p_old = any(memory_themes);
  insert into editor_log (actor_id, action, target_id, summary)
  values (auth.uid(), 'theme_rename', null, 'bytte namn på kategorin ”' || p_old || '” till ”' || n || '” i Minne');
end $$;
select 'klart' as resultat;
