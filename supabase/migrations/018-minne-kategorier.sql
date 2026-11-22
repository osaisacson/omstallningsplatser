-- 018: Minnets kategorier som en egen lista. Redaktionen kan byta namn på en kategori och flytta inlägg.
-- Ett inläggs kategori är den flest valt när de sparade det (vid lika: den som valdes först),
-- om inte Redaktionen har flyttat inlägget – då gäller Redaktionens val.

create table if not exists public.memory_themes (
  name text primary key check (length(trim(name)) between 1 and 40),
  position int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.memory_themes enable row level security;
drop policy if exists "kategorier syns" on public.memory_themes;
create policy "kategorier syns" on public.memory_themes for select to authenticated using (true);
drop policy if exists "skapa kategori" on public.memory_themes;
create policy "skapa kategori" on public.memory_themes for insert to authenticated with check (position = 100);

insert into public.memory_themes (name, position) values
  ('Bygga & bo', 1), ('Mat & odling', 2), ('Energi', 3), ('Vatten & avfall', 4),
  ('Produktion & reparation', 5), ('Ekonomi & delning', 6), ('Rättvisa & organisering', 7), ('Relationer & gemenskap', 8)
on conflict (name) do nothing;
insert into public.memory_themes (name) select distinct theme from public.memory_votes where theme is not null on conflict (name) do nothing;

-- Redaktionens val för ett inlägg
alter table public.posts add column if not exists memory_theme text;

-- Byt namn på en kategori (finns det redan en med det nya namnet slås de ihop).
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
  insert into editor_log (actor_id, action, target_id, summary)
  values (auth.uid(), 'theme_rename', null, 'bytte namn på kategorin ”' || p_old || '” till ”' || n || '” i Minne');
end $$;

-- Flytta ett inlägg till en annan kategori.
create or replace function public.set_post_theme(p_post uuid, p_theme text) returns void
language plpgsql security definer set search_path = public as $$
declare n text := nullif(btrim(coalesce(p_theme, '')), ''); c text;
begin
  perform need_editor();
  if n is not null then insert into memory_themes (name) values (n) on conflict do nothing; end if;
  select coalesce(nullif(left(caption, 50), ''), 'inlägg') into c from posts where id = p_post;
  if c is null then raise exception 'Inlägget finns inte.'; end if;
  update posts set memory_theme = n where id = p_post;
  insert into editor_log (actor_id, action, target_id, summary)
  values (auth.uid(), 'post_theme', p_post, 'flyttade ”' || c || '” till ' || coalesce('”' || n || '”', 'sparade kategorier') || ' i Minne');
end $$;

select (select count(*) from public.memory_themes) as kategorier;
