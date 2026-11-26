-- 043: Forum (som ett litet Reddit) och snabbare bilder.
-- * Forum: samtal som heter o/namn. Varje samtal har trådar med röster och kommentarer i trådar.
--   Feedbacken blir samtalet o/feedback, fäst överst. Trådarna ligger kvar i tabellen feedback (nu med forum_id).
-- * En tråd kan visa befintliga inlägg från appen (post_ids). Bara inlägg man själv får se visas.
-- * Bilder: en liten version (thumb_url) och en suddig förhandsbild (placeholder) per bild.

-- ---------- Bilder ----------
alter table public.post_slides add column if not exists thumb_url text;
alter table public.post_slides add column if not exists placeholder text check (placeholder is null or char_length(placeholder) <= 3000);

-- ---------- Samtal ----------
create table if not exists public.forums (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9åäö][a-z0-9åäö-]{1,39}$'),
  description text check (description is null or char_length(description) <= 500),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
alter table public.forums enable row level security;
drop policy if exists "samtal syns" on public.forums;
create policy "samtal syns" on public.forums for select to authenticated using (true);
drop policy if exists "starta samtal" on public.forums;
create policy "starta samtal" on public.forums for insert to authenticated with check (created_by = auth.uid() and not pinned);
drop policy if exists "ändra eget samtal" on public.forums;
create policy "ändra eget samtal" on public.forums for update to authenticated
  using (created_by = auth.uid() or public.is_editor()) with check (created_by = auth.uid() or public.is_editor());
drop policy if exists "redaktionen tar bort samtal" on public.forums;
create policy "redaktionen tar bort samtal" on public.forums for delete to authenticated using (public.is_editor() and not pinned);

-- Bara Redaktionen fäster samtal, och namnet går inte att byta (länkar ska fungera).
create or replace function public.guard_forum() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  new.slug := old.slug; new.created_by := old.created_by;
  if not public.is_editor() then new.pinned := old.pinned; end if;
  return new;
end $$;
drop trigger if exists forums_guard on public.forums;
create trigger forums_guard before update on public.forums for each row execute function public.guard_forum();

insert into public.forums (slug, description, pinned, created_by)
values ('feedback', 'Förslag och problem med appen. Rösta upp det du också vill ha – Redaktionen flyttar det som ska göras till Planerade och sedan Klara.', true, null)
on conflict (slug) do update set pinned = true;

-- ---------- Trådar (tabellen feedback) ----------
alter table public.feedback add column if not exists forum_id uuid references public.forums(id) on delete cascade;
alter table public.feedback add column if not exists post_ids uuid[] not null default '{}';
alter table public.feedback add column if not exists last_activity_at timestamptz not null default now();
update public.feedback set forum_id = (select id from public.forums where slug = 'feedback') where forum_id is null;
update public.feedback f set last_activity_at = greatest(f.created_at, coalesce((select max(created_at) from public.feedback_comments c where c.feedback_id = f.id), f.created_at));
alter table public.feedback alter column forum_id set not null;
-- En tråd kan vara bara en rubrik (som på Reddit).
alter table public.feedback drop constraint if exists feedback_body_check;
alter table public.feedback add constraint feedback_body_check check (char_length(body) <= 4000);
alter table public.feedback alter column body set default '';
create index if not exists feedback_forum_idx on public.feedback (forum_id, last_activity_at desc);
update public.forums fo set last_activity_at = coalesce((select max(last_activity_at) from public.feedback f where f.forum_id = fo.id), fo.created_at);

-- Senaste aktivitet: ny tråd eller kommentar flyttar upp tråden och samtalet.
create or replace function public.forum_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_forum uuid; v_thread uuid;
begin
  if tg_table_name = 'feedback' then v_thread := new.id; v_forum := new.forum_id;
  else
    v_thread := new.feedback_id;
    update feedback set last_activity_at = now() where id = v_thread returning forum_id into v_forum;
  end if;
  update forums set last_activity_at = now() where id = v_forum;
  return null;
end $$;
drop trigger if exists feedback_activity on public.feedback;
create trigger feedback_activity after insert on public.feedback for each row execute function public.forum_activity();
drop trigger if exists feedback_comment_activity on public.feedback_comments;
create trigger feedback_comment_activity after insert on public.feedback_comments for each row execute function public.forum_activity();

alter table public.notifications add column if not exists link text check (link is null or link ~ '^#/');

-- Den som skrivit tråden får en notis när någon kommenterar (eller svarar på ens kommentar).
create or replace function public.notify_forum_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare t feedback; v_to uuid; v_slug text;
begin
  select * into t from feedback where id = new.feedback_id;
  select slug into v_slug from forums where id = t.forum_id;
  v_to := coalesce((select author_id from feedback_comments where id = new.parent_id), t.author_id);
  if v_to is not null and v_to <> new.author_id then
    insert into notifications (user_id, kind, actor_id, link, body)
    values (v_to, 'forum', new.author_id, '#/o/' || v_slug || '/' || t.id, case when new.parent_id is null then 'kommenterade din tråd ”' else 'svarade dig i ”' end
      || left(t.title, 60) || '” i o/' || v_slug);
  end if;
  return null;
end $$;
drop trigger if exists feedback_comment_notify on public.feedback_comments;
create trigger feedback_comment_notify after insert on public.feedback_comments for each row execute function public.notify_forum_comment();

-- Den som skrivit tråden kan lägga till eller ta bort inlägg i den.
create or replace function public.set_thread_posts(p_id uuid, p_posts uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from feedback where id = p_id and author_id = auth.uid()) then raise exception 'Bara den som skrev tråden kan ändra den.'; end if;
  if coalesce(array_length(p_posts, 1), 0) > 20 then raise exception 'Högst 20 inlägg per tråd.'; end if;
  update feedback set post_ids = coalesce(p_posts, '{}') where id = p_id;
end $$;
grant execute on function public.set_thread_posts(uuid, uuid[]) to authenticated;

-- Nya trådar måste höra till ett samtal; status (Planerad/Klar) sätts bara av Redaktionen, som förut.
drop policy if exists "skriv feedback" on public.feedback;
create policy "skriv feedback" on public.feedback for insert to authenticated
  with check (author_id = auth.uid() and status is null and coalesce(array_length(post_ids, 1), 0) <= 20);

select (select count(*) from public.forums) as samtal,
       (select count(*) from public.feedback where forum_id is not null) as tradar,
       (select slug from public.forums where pinned limit 1) as fast;
