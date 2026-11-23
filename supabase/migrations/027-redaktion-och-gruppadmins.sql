-- 027: Redaktionen modererar hela plattformen och tar hand om grupper som saknar admin.
-- * Gruppen Omställningsplatser heter nu Redaktion.
-- * Den som läggs till i Redaktionen måste godkänna sina befogenheter innan de gäller.
-- * En grupp utan admin sköts av Redaktionen. Ingen blir admin automatiskt längre:
--   en medlem kan be om att bli admin (med ett kort meddelande), Redaktionen godkänner,
--   och personen bekräftar att den läst vad det innebär innan den blir admin.
-- * Åsa Isacson är inte längre admin för grupperna (det behövdes bara innan Redaktionen fanns).

-- ---------- Redaktion ----------
update public.groups set name = 'Redaktion',
  description = 'Redaktionen ansvarar för plattformen Omställningsplatser och modererar den: går igenom anmälningar, kan ta bort inlägg, grupper och konton som bryter mot villkoren, tar hand om grupper som saknar admin och godkänner nya gruppadmins. Bara Redaktionen kan lägga till nya medlemmar här.'
where locked and name = 'Omställningsplatser';

alter table public.editors add column if not exists accepted_at timestamptz;
update public.editors set accepted_at = coalesce(accepted_at, added_at, now());

-- Bara den som godkänt sina befogenheter räknas som Redaktionen.
create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from editors where user_id = auth.uid() and accepted_at is not null)
$$;
create or replace function public.need_editor() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from editors where user_id = auth.uid() and accepted_at is not null) then
    raise exception 'Bara Redaktionen kan göra det.';
  end if;
end $$;

-- Gruppen Redaktion följer de som godkänt (och lämnar man Redaktionen lämnar man gruppen).
create or replace function public.sync_editor_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if new.accepted_at is not null then
      insert into group_members (group_id, user_id, role)
      select g.id, new.user_id, 'admin' from groups g where g.locked
      on conflict (group_id, user_id) do update set role = 'admin';
    end if;
    return new;
  end if;
  delete from group_members gm using groups g where gm.group_id = g.id and g.locked and gm.user_id = old.user_id;
  return old;
end $$;
drop trigger if exists editors_sync_group on public.editors;
create trigger editors_sync_group after insert or update or delete on public.editors
  for each row execute function public.sync_editor_group();

-- Lägg till i Redaktionen: personen får en fråga och måste godkänna först.
create or replace function public.set_editor(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  perform need_editor();
  select name into n from profiles where id = p_user;
  if n is null then raise exception 'Personen finns inte.'; end if;
  if p_on then
    if exists (select 1 from editors where user_id = p_user) then return; end if;
    insert into editors (user_id, added_by, accepted_at) values (p_user, auth.uid(), null);
    insert into editor_log (actor_id, action, target_id, summary) values (auth.uid(), 'editor_add', p_user, 'bjöd in ' || n || ' till Redaktionen');
    insert into notifications (user_id, kind, actor_id, body) values (p_user, 'admin', auth.uid(), 'bjöd in dig till Redaktionen – öppna appen för att läsa och godkänna');
  else
    if not exists (select 1 from editors where user_id = p_user) then return; end if;
    if (select count(*) from editors where accepted_at is not null and user_id <> p_user) < 1 then raise exception 'Redaktionen måste ha minst en person.'; end if;
    delete from editors where user_id = p_user;
    insert into editor_log (actor_id, action, target_id, summary) values (auth.uid(), 'editor_remove', p_user, 'tog bort ' || n || ' ur Redaktionen');
  end if;
end $$;

-- Den inbjudna godkänner (eller tackar nej).
create or replace function public.accept_editor(p_yes boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  if not exists (select 1 from editors where user_id = auth.uid() and accepted_at is null) then raise exception 'Ingen inbjudan att svara på.'; end if;
  select name into n from profiles where id = auth.uid();
  if p_yes then
    update editors set accepted_at = now() where user_id = auth.uid();
    insert into editor_log (actor_id, action, target_id, summary) values (auth.uid(), 'editor_accept', auth.uid(), 'godkände sina befogenheter och är nu med i Redaktionen');
  else
    delete from editors where user_id = auth.uid();
    insert into editor_log (actor_id, action, target_id, summary) values (auth.uid(), 'editor_decline', auth.uid(), 'tackade nej till Redaktionen');
  end if;
end $$;

-- ---------- Gruppadmins ----------
-- En grupp utan admin sköts av Redaktionen.
create or replace function public.is_admin(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = g and user_id = auth.uid() and role = 'admin')
    or (public.is_editor() and not exists (select 1 from group_members where group_id = g and role = 'admin'));
$$;

-- Ingen blir admin automatiskt längre när sista admin lämnar: gruppen går till Redaktionen.
create or replace function public.ensure_group_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  return null;
end $$;

-- Inaktiva admins: efter ett år utan inloggning mejlas de, och efter 30 dagar till lämnar de över gruppen till Redaktionen.
create or replace function public.admin_succession() returns void
language plpgsql security definer set search_path = public as $$
declare g record;
begin
  for g in select * from groups where not locked loop
    if not exists (select 1 from group_members where group_id = g.id and role = 'admin') then continue; end if;
    if exists (
      select 1 from group_members m join profiles p on p.id = m.user_id
      where m.group_id = g.id and m.role = 'admin' and p.last_seen_at > now() - interval '1 year'
    ) then
      if g.succession_notified_at is not null then update groups set succession_notified_at = null where id = g.id; end if;
    elsif g.succession_notified_at is null then
      insert into email_outbox (to_email, subject, body)
      select u.email, 'Gruppen ' || g.name || ' saknar aktiv admin',
             'Hej! Ingen admin i ' || g.name || ' har loggat in på ett år. Om ingen admin loggar in inom 30 dagar tar Redaktionen över gruppen, och medlemmarna kan be om att bli admin. Logga in för att behålla din roll.'
      from group_members m join auth.users u on u.id = m.user_id
      where m.group_id = g.id and m.role = 'admin' and u.email is not null;
      update groups set succession_notified_at = now() where id = g.id;
    elsif g.succession_notified_at < now() - interval '30 days' then
      update group_members set role = 'member' where group_id = g.id and role = 'admin';
      update groups set succession_notified_at = null where id = g.id;
    end if;
  end loop;
end $$;

-- Förfrågningar om att bli admin för en grupp utan admin.
create table if not exists public.admin_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (length(trim(message)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'accepted')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.admin_requests enable row level security;
drop policy if exists "egna och Redaktionens" on public.admin_requests;
create policy "egna och Redaktionens" on public.admin_requests for select to authenticated using (user_id = auth.uid() or public.is_editor());

create or replace function public.request_admin(p_group uuid, p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare g groups;
begin
  select * into g from groups where id = p_group;
  if g.id is null or g.locked then raise exception 'Det går inte för den här gruppen.'; end if;
  if not exists (select 1 from group_members where group_id = p_group and user_id = auth.uid()) then raise exception 'Gå med i gruppen först.'; end if;
  if exists (select 1 from group_members where group_id = p_group and role = 'admin') then raise exception 'Gruppen har redan en admin – fråga dem.'; end if;
  if exists (select 1 from admin_requests where group_id = p_group and user_id = auth.uid() and status in ('pending', 'approved')) then raise exception 'Du har redan frågat.'; end if;
  insert into admin_requests (group_id, user_id, message) values (p_group, auth.uid(), btrim(p_message));
  insert into notifications (user_id, kind, actor_id, group_id, body)
  select e.user_id, 'admin', auth.uid(), p_group, 'vill bli admin för ' || g.name || ' – finns i Redaktionens checklista'
  from editors e where e.accepted_at is not null and e.user_id <> auth.uid();
end $$;

create or replace function public.decide_admin_request(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r admin_requests; gname text; uname text;
begin
  perform need_editor();
  select * into r from admin_requests where id = p_id;
  if r.id is null or r.status <> 'pending' then raise exception 'Förfrågan är redan behandlad.'; end if;
  select name into gname from groups where id = r.group_id;
  select name into uname from profiles where id = r.user_id;
  update admin_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now() where id = p_id;
  insert into notifications (user_id, kind, actor_id, group_id, body) values (r.user_id, 'admin', auth.uid(), r.group_id,
    case when p_approve then 'godkände att du blir admin för ' || gname || ' – öppna appen och bekräfta' else 'godkände inte att du blir admin för ' || gname end);
  insert into editor_log (actor_id, action, target_id, summary) values (auth.uid(), 'admin_request', p_id,
    case when p_approve then 'godkände ' else 'avslog ' end || uname || ' som admin för ' || gname);
end $$;

-- Personen bekräftar att den läst vad det innebär, och blir admin.
create or replace function public.accept_admin_role(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r admin_requests;
begin
  select * into r from admin_requests where id = p_id and user_id = auth.uid();
  if r.id is null or r.status <> 'approved' then raise exception 'Det finns inget godkännande att bekräfta.'; end if;
  insert into group_members (group_id, user_id, role) values (r.group_id, r.user_id, 'admin')
  on conflict (group_id, user_id) do update set role = 'admin';
  update admin_requests set status = 'accepted' where id = p_id;
end $$;

-- ---------- Åsa Isacson är inte längre admin för grupperna ----------
-- I grupper där hon är enda medlem (t.ex. hämtade grupper) tas hon bort; i övriga blir hon vanlig medlem.
delete from public.group_members gm using public.groups g
where gm.group_id = g.id and not g.locked
  and gm.user_id = (select id from public.profiles where name = 'Åsa Isacson' limit 1)
  and not exists (select 1 from public.group_members o where o.group_id = gm.group_id and o.user_id <> gm.user_id)
  and not exists (select 1 from public.posts p where p.group_id = gm.group_id and p.author_id = gm.user_id);
update public.group_members gm set role = 'member' from public.groups g
where gm.group_id = g.id and not g.locked and gm.role = 'admin'
  and gm.user_id = (select id from public.profiles where name = 'Åsa Isacson' limit 1);

select (select count(*) from public.group_members m join public.profiles p on p.id = m.user_id join public.groups g on g.id = m.group_id
        where p.name = 'Åsa Isacson' and m.role = 'admin' and not g.locked) as asa_admin_kvar,
       (select count(*) from public.group_members m join public.profiles p on p.id = m.user_id where p.name = 'Åsa Isacson') as asa_medlem_i,
       (select name from public.groups where locked) as redaktionsgruppen;
