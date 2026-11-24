-- 034: Gilla (hjärta) på inlägg och kommentarer, video i inlägg, verifierade grupper och medlemmar,
-- samt samtal med flera personer eller med en hel grupp (med notiser som går att stänga av).

-- ---------- Gilla ----------
create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.post_likes enable row level security;
alter table public.comment_likes enable row level security;
-- Gillningar följer inlägget: syns bara för den som ser inlägget.
drop policy if exists "gillningar syns" on public.post_likes;
create policy "gillningar syns" on public.post_likes for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "gilla själv" on public.post_likes;
create policy "gilla själv" on public.post_likes for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "ta tillbaka gillning" on public.post_likes;
create policy "ta tillbaka gillning" on public.post_likes for delete to authenticated using (user_id = auth.uid());
drop policy if exists "gillningar syns" on public.comment_likes;
create policy "gillningar syns" on public.comment_likes for select to authenticated using (exists (select 1 from public.comments c where c.id = comment_id));
drop policy if exists "gilla själv" on public.comment_likes;
create policy "gilla själv" on public.comment_likes for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.comments c where c.id = comment_id));
drop policy if exists "ta tillbaka gillning" on public.comment_likes;
create policy "ta tillbaka gillning" on public.comment_likes for delete to authenticated using (user_id = auth.uid());

-- Den som skrev inlägget får en notis när någon gillar det.
create or replace function public.on_post_like() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, kind, actor_id, post_id, body)
  select p.author_id, 'like', new.user_id, p.id, 'gillade ditt inlägg' from posts p
  where p.id = new.post_id and p.author_id <> new.user_id
    and not exists (select 1 from notifications n where n.kind = 'like' and n.post_id = p.id and n.actor_id = new.user_id);
  return new;
end $$;
drop trigger if exists post_liked on public.post_likes;
create trigger post_liked after insert on public.post_likes for each row execute function public.on_post_like();

-- ---------- Video ----------
alter table public.post_slides add column if not exists media_type text not null default 'image';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'post_slides_media_type_check') then
    alter table public.post_slides add constraint post_slides_media_type_check check (media_type in ('image', 'video'));
  end if;
end $$;

-- ---------- Verifierade grupper (Redaktionen) ----------
alter table public.groups add column if not exists verified_at timestamptz;
alter table public.groups add column if not exists verified_by uuid references public.profiles(id) on delete set null;

-- Bara Redaktionen kan verifiera – även om en admin ändrar gruppen själv.
create or replace function public.guard_group_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_editor() then return new; end if;
  if tg_op = 'INSERT' then new.verified_at := null; new.verified_by := null;
  else new.verified_at := old.verified_at; new.verified_by := old.verified_by; end if;
  return new;
end $$;
drop trigger if exists groups_guard_verified on public.groups;
create trigger groups_guard_verified before insert or update on public.groups for each row execute function public.guard_group_verified();

create or replace function public.set_group_verified(p_group uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  perform need_editor();
  select name into n from groups where id = p_group;
  if n is null then raise exception 'Gruppen finns inte.'; end if;
  update groups set verified_at = case when p_on then now() end, verified_by = case when p_on then auth.uid() end where id = p_group;
  insert into editor_log (actor_id, action, target_id, summary)
  values (auth.uid(), 'group_verify', p_group, case when p_on then 'verifierade gruppen ' else 'tog bort verifieringen av ' end || n);
end $$;

-- ---------- Verifierade medlemmar (gruppens admins) ----------
alter table public.group_members add column if not exists verified boolean not null default false;
alter table public.group_members add column if not exists verified_by uuid references public.profiles(id) on delete set null;

create or replace function public.guard_member_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verified and (tg_op = 'INSERT' or not old.verified) and not public.is_admin(new.group_id) then
    new.verified := false; new.verified_by := null;
  end if;
  return new;
end $$;
drop trigger if exists group_members_guard_verified on public.group_members;
create trigger group_members_guard_verified before insert or update on public.group_members for each row execute function public.guard_member_verified();

create or replace function public.set_member_verified(p_group uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare gname text;
begin
  if not public.is_admin(p_group) then raise exception 'Bara gruppens admins kan verifiera medlemmar.'; end if;
  select name into gname from groups where id = p_group;
  update group_members set verified = p_on, verified_by = case when p_on then auth.uid() end where group_id = p_group and user_id = p_user;
  if not found then raise exception 'Personen är inte med i gruppen.'; end if;
  if p_on and p_user <> auth.uid() then
    insert into notifications (user_id, kind, actor_id, group_id, body) values (p_user, 'admin', auth.uid(), p_group, 'verifierade dig som medlem i ' || gname);
  end if;
end $$;

-- ---------- Samtal ----------
-- Ett samtal är antingen med utvalda personer (chat_members) eller med en hel grupp (group_id: alla medlemmar är med).
-- Meddelanden mellan två personer finns kvar i messages som förut.
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  title text,
  group_id uuid unique references public.groups(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create table if not exists public.chat_members (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  muted boolean not null default false,
  last_read_at timestamptz not null default now(),
  added_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  from_id uuid references public.profiles(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_chat_idx on public.chat_messages (chat_id, created_at desc);
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

create or replace function public.in_chat(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from chats ch where ch.id = c and (
    (ch.group_id is null and exists (select 1 from chat_members m where m.chat_id = c and m.user_id = auth.uid()))
    or (ch.group_id is not null and public.is_member(ch.group_id))));
$$;

drop policy if exists "egna samtal" on public.chats;
create policy "egna samtal" on public.chats for select to authenticated using (public.in_chat(id));
drop policy if exists "deltagare syns" on public.chat_members;
create policy "deltagare syns" on public.chat_members for select to authenticated using (public.in_chat(chat_id));
drop policy if exists "egen rad" on public.chat_members;
create policy "egen rad" on public.chat_members for update to authenticated using (user_id = auth.uid());
drop policy if exists "lämna samtal" on public.chat_members;
create policy "lämna samtal" on public.chat_members for delete to authenticated using (user_id = auth.uid());
drop policy if exists "meddelanden i egna samtal" on public.chat_messages;
create policy "meddelanden i egna samtal" on public.chat_messages for select to authenticated using (public.in_chat(chat_id));
drop policy if exists "skriv i egna samtal" on public.chat_messages;
create policy "skriv i egna samtal" on public.chat_messages for insert to authenticated with check (from_id = auth.uid() and public.in_chat(chat_id));

-- Nytt samtal med utvalda personer.
create or replace function public.create_chat(p_title text, p_users uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Logga in först.'; end if;
  if coalesce(array_length(array_remove(p_users, auth.uid()), 1), 0) < 1 then raise exception 'Välj minst en person.'; end if;
  insert into chats (title, created_by) values (nullif(btrim(coalesce(p_title, '')), ''), auth.uid()) returning id into v_id;
  insert into chat_members (chat_id, user_id)
  select v_id, u from (select distinct unnest(array_append(p_users, auth.uid())) as u) x where exists (select 1 from profiles p where p.id = x.u);
  return v_id;
end $$;

create or replace function public.add_chat_members(p_chat uuid, p_users uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.in_chat(p_chat) or exists (select 1 from chats where id = p_chat and group_id is not null) then raise exception 'Det går inte här.'; end if;
  insert into chat_members (chat_id, user_id) select p_chat, u from unnest(p_users) u where exists (select 1 from profiles p where p.id = u)
  on conflict do nothing;
end $$;

-- Gruppens samtal: ett per grupp, alla medlemmar är med.
create or replace function public.group_chat(p_group uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_member(p_group) then raise exception 'Gå med i gruppen först.'; end if;
  select id into v_id from chats where group_id = p_group;
  if v_id is null then
    insert into chats (group_id, created_by) values (p_group, auth.uid()) on conflict (group_id) do nothing returning id into v_id;
    if v_id is null then select id into v_id from chats where group_id = p_group; end if;
  end if;
  return v_id;
end $$;

create or replace function public.mark_chat_read(p_chat uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.in_chat(p_chat) then return; end if;
  insert into chat_members (chat_id, user_id, last_read_at) values (p_chat, auth.uid(), now())
  on conflict (chat_id, user_id) do update set last_read_at = now();
end $$;

create or replace function public.set_chat_muted(p_chat uuid, p_muted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.in_chat(p_chat) then raise exception 'Du är inte med i samtalet.'; end if;
  insert into chat_members (chat_id, user_id, muted) values (p_chat, auth.uid(), p_muted)
  on conflict (chat_id, user_id) do update set muted = p_muted;
end $$;

-- En persons samtal, med senaste meddelandet och antal olästa. _for används också av push-funktionen.
create or replace function public.chats_for(p_user uuid)
returns table (id uuid, title text, group_id uuid, group_name text, group_avatar text, last_message_at timestamptz,
  last_body text, last_from uuid, last_from_name text, unread int, muted boolean, member_names text, member_count int)
language sql stable security definer set search_path = public as $$
  select c.id, c.title, c.group_id, g.name, g.avatar_url, c.last_message_at, lm.body, lm.from_id, lp.name,
    (select count(*) from chat_messages x where x.chat_id = c.id and x.from_id is distinct from p_user
       and x.created_at > coalesce(cm.last_read_at, gm.joined_at, c.created_at))::int,
    coalesce(cm.muted, false),
    (select string_agg(p.name, ', ' order by p.name) from chat_members m2 join profiles p on p.id = m2.user_id where m2.chat_id = c.id and m2.user_id <> p_user),
    (case when c.group_id is null then (select count(*) from chat_members m3 where m3.chat_id = c.id)
          else (select count(*) from group_members m4 where m4.group_id = c.group_id) end)::int
  from chats c
  left join groups g on g.id = c.group_id
  left join group_members gm on gm.group_id = c.group_id and gm.user_id = p_user
  left join chat_members cm on cm.chat_id = c.id and cm.user_id = p_user
  left join lateral (select body, from_id from chat_messages where chat_id = c.id order by created_at desc limit 1) lm on true
  left join profiles lp on lp.id = lm.from_id
  where (c.group_id is null and cm.user_id is not null) or (c.group_id is not null and gm.user_id is not null and (lm.body is not null or cm.user_id is not null))
  order by c.last_message_at desc;
$$;
revoke execute on function public.chats_for(uuid) from public, anon, authenticated;
create or replace function public.my_chats()
returns table (id uuid, title text, group_id uuid, group_name text, group_avatar text, last_message_at timestamptz,
  last_body text, last_from uuid, last_from_name text, unread int, muted boolean, member_names text, member_count int)
language sql stable security definer set search_path = public as $$ select * from public.chats_for(auth.uid()) $$;
create or replace function public.chat_unread_for(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(unread) filter (where not muted), 0)::int from public.chats_for(p_user);
$$;
revoke execute on function public.chat_unread_for(uuid) from public, anon, authenticated;
create or replace function public.my_chat_unread() returns int
language sql stable security definer set search_path = public as $$ select public.chat_unread_for(auth.uid()) $$;

-- Nytt meddelande: samtalet hamnar överst, och push skickas (push-funktionen hoppar över den som stängt av notiser).
create or replace function public.on_chat_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update chats set last_message_at = new.created_at where id = new.chat_id;
  insert into chat_members (chat_id, user_id, last_read_at) values (new.chat_id, new.from_id, new.created_at)
  on conflict (chat_id, user_id) do update set last_read_at = excluded.last_read_at;
  return new;
end $$;
drop trigger if exists chat_message_created on public.chat_messages;
create trigger chat_message_created after insert on public.chat_messages for each row execute function public.on_chat_message();
drop trigger if exists push_on_chat_message on public.chat_messages;
create trigger push_on_chat_message after insert on public.chat_messages for each row execute function public.notify_push();

select (select count(*) from public.chats) as samtal,
       exists (select 1 from information_schema.columns where table_name = 'post_slides' and column_name = 'media_type') as video,
       exists (select 1 from information_schema.columns where table_name = 'groups' and column_name = 'verified_at') as verifierade_grupper;
