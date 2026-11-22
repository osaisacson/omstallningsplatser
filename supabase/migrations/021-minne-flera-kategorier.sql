-- 021: Ett inlägg kan ligga i flera kategorier i Minne: alla som valts när någon sparat det.
-- Redaktionen kan sätta kategorierna själv; då gäller Redaktionens val.
alter table public.posts add column if not exists memory_themes text[];
update public.posts set memory_themes = array[memory_theme] where memory_theme is not null and memory_themes is null;

create or replace function public.set_post_themes(p_post uuid, p_themes text[]) returns void
language plpgsql security definer set search_path = public as $$
declare t text; list text[] := array(select distinct btrim(x) from unnest(coalesce(p_themes, '{}')) x where btrim(x) <> ''); c text;
begin
  perform need_editor();
  foreach t in array list loop insert into memory_themes (name) values (t) on conflict do nothing; end loop;
  select coalesce(nullif(left(caption, 50), ''), 'inlägg') into c from posts where id = p_post;
  if c is null then raise exception 'Inlägget finns inte.'; end if;
  update posts set memory_themes = case when cardinality(list) = 0 then null else list end, memory_theme = null where id = p_post;
  insert into editor_log (actor_id, action, target_id, summary)
  values (auth.uid(), 'post_theme', p_post, 'satte kategorierna för ”' || c || '” i Minne: ' || coalesce(array_to_string(list, ', '), 'de sparade'));
end $$;

-- Byte av namn på en kategori följer med i inläggens listor.
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
  update posts set memory_theme = n where memory_theme = p_old;
  update posts set memory_themes = array(select distinct x from unnest(array_replace(memory_themes, p_old, n)) x) where p_old = any(memory_themes);
  insert into editor_log (actor_id, action, target_id, summary)
  values (auth.uid(), 'theme_rename', null, 'bytte namn på kategorin ”' || p_old || '” till ”' || n || '” i Minne');
end $$;
select 'klart' as resultat;
