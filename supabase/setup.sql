-- =====================================================================
-- Omställningsplatser – databas för Supabase
-- Klistra in hela filen i Supabase → SQL Editor → Run.
-- Kör sedan seed.sql om du vill ha exempeldata.
-- =====================================================================

-- ---------- Tabeller --------------------------------------------------

create table public.profiles (
  id uuid primary key,                      -- samma id som auth.users (exempelanvändare saknar inloggning)
  name text not null,
  nickname text,
  avatar_url text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Var man håller till – syns bara för en själv (se policyn längre ner).
create table public.home_places (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  country text, region text, city text,
  postcode text,                     -- stadsdelen räknas från de tre första siffrorna
  district text,                     -- stadsdelens namn (från OpenStreetMap), om det hittades
  level text not null default 'city' check (level in ('country', 'region', 'city', 'district')),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  homepage text,
  imported_from text,              -- t.ex. 'byggemenskaper.se': hämtad därifrån, visas med en banner tills gruppen fått en egen admin
  country text,                              -- land, region och stad: flödet kan visas per plats
  region text,
  city text,
  address text,                              -- gatuadress eller område, visas på kartan
  postcode text,
  lat double precision,
  lng double precision,
  avatar_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  succession_notified_at timestamptz         -- när admins mejlades om att gruppen saknar aktiv admin
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.highlights (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null,
  post_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.categories (
  name text primary key,
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  caption text not null default '',
  kind text not null default 'vanlig' check (kind in ('vanlig', 'finansiering', 'lokal')),
  is_resource boolean not null default false,  -- något andra kan ha nytta av (har ämnen, är finansiering eller lokal)
  categories text[] not null default '{}',     -- ämnen, t.ex. Energi, Byggmetod, Off-grid
  space_functions text[] not null default '{}', -- lokaler: vad lokalen kan användas till
  space_cost text check (space_cost in ('gratis', 'gentjanst', 'kostar')),
  space_price text,
  is_event boolean not null default false,     -- evenemang: datum, tid, plats och anmälan
  event_start timestamptz,
  event_end timestamptz,
  event_address text,
  event_postcode text,
  event_city text,
  event_region text,
  event_country text,
  event_lat double precision,
  event_lng double precision,
  event_rsvp boolean not null default true,   -- får folk anmäla intresse?
  fin_total numeric check (fin_total is null or fin_total > 0),
  fin_mode text check (fin_mode in ('single', 'split')),
  fin_expires_at timestamptz,
  fin_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create index posts_created_idx on public.posts (created_at desc);
create index posts_group_idx on public.posts (group_id);
create index posts_author_idx on public.posts (author_id);

create table public.post_slides (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  position int not null default 0,
  image_url text not null,
  text text not null default ''
);
create index post_slides_post_idx on public.post_slides (post_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,      -- ansökningar görs i en grupps namn
  parent_id uuid references public.comments(id) on delete cascade,    -- svar i tråd
  body text not null,
  created_at timestamptz not null default now(),
  applied_amount numeric,                      -- satt om kommentaren är en ansökan
  status text check (status in ('applied', 'granted', 'denied', 'paid')),
  decided_at timestamptz,
  paid_at timestamptz
);
create index comments_post_idx on public.comments (post_id);

-- Swishnummer/bankkonto. Syns bara för den som sökt och den som delar ut.
create table public.payouts (
  comment_id uuid primary key references public.comments(id) on delete cascade,
  details text not null
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,                          -- comment | application | decision | paid | admin
  actor_id uuid references public.profiles(id) on delete set null,
  post_id uuid references public.posts(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_to_idx on public.messages (to_id, created_at desc);
create index messages_from_idx on public.messages (from_id, created_at desc);

-- Mejl som ska skickas (t.ex. när en grupp saknar aktiv admin). Se README.
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

insert into public.categories (name) values ('Energi'), ('Byggmetod'), ('Off-grid'), ('Vatten'), ('Avfall'), ('Mat'), ('Ekonomi');

-- ---------- Hjälpfunktioner -------------------------------------------

create or replace function public.is_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = g and user_id = auth.uid());
$$;

create or replace function public.is_admin(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = g and user_id = auth.uid() and role = 'admin');
$$;

-- ---------- Triggers ---------------------------------------------------

-- Ny inloggning → ny profil (namnet skickas med vid registrering)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); h jsonb := m->'home';
begin
  insert into profiles (id, name, nickname, avatar_url)
  values (
    new.id,
    coalesce(nullif(trim(m->>'name'), ''), nullif(trim(m->>'full_name'), ''), split_part(new.email, '@', 1)),
    nullif(trim(m->>'nickname'), ''),
    coalesce(nullif(m->>'avatar_url', ''), nullif(m->>'picture', ''))   -- profilbild från Google
  );
  if jsonb_typeof(h) = 'object' and nullif(trim(h->>'country'), '') is not null then
    insert into home_places (user_id, country, region, city, postcode, district, level)
    values (new.id, trim(h->>'country'), nullif(trim(h->>'region'), ''), nullif(trim(h->>'city'), ''),
      nullif(trim(h->>'postcode'), ''), nullif(h->>'district', ''),
      case when h->>'level' in ('country', 'region', 'city', 'district') then h->>'level' else 'city' end);
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Den som skapar en grupp blir admin
create or replace function public.on_group_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into group_members (group_id, user_id, role) values (new.id, new.created_by, 'admin')
    on conflict (group_id, user_id) do update set role = 'admin';
  end if;
  return new;
end $$;
create trigger group_created after insert on public.groups
  for each row execute function public.on_group_created();

-- Nytt inlägg = aktivitet i gruppen
create or replace function public.on_post_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is not null then
    update groups set last_activity_at = now() where id = new.group_id;
  end if;
  return new;
end $$;
create trigger post_created after insert on public.posts
  for each row execute function public.on_post_created();

-- Ny kommentar = aktivitet på inlägget och i gruppen, + notiser
create or replace function public.on_comment_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_post posts; v_parent comments; v_group text;
begin
  select * into v_post from posts where id = new.post_id;
  if new.parent_id is not null then
    select * into v_parent from comments where id = new.parent_id;
    if v_parent.post_id is distinct from new.post_id then raise exception 'Svaret hör inte till samma inlägg.'; end if;
  end if;
  update posts set last_activity_at = now() where id = new.post_id;
  if v_post.group_id is not null then
    update groups set last_activity_at = now() where id = v_post.group_id;
  end if;
  if v_post.author_id <> new.author_id then
    select name into v_group from groups where id = new.group_id;
    insert into notifications (user_id, kind, actor_id, post_id, body)
    values (
      v_post.author_id,
      case when new.status = 'applied' then 'application' else 'comment' end,
      new.author_id, new.post_id,
      case when new.status = 'applied' then 'ansökte om ' || new.applied_amount || ' kr för ' || coalesce(v_group, 'sin grupp')
           when new.parent_id is not null then 'svarade i en tråd på ditt inlägg: ' || left(new.body, 80)
           else 'kommenterade: ' || left(new.body, 80) end
    );
  end if;
  if v_parent.id is not null and v_parent.author_id <> new.author_id and v_parent.author_id <> v_post.author_id then
    insert into notifications (user_id, kind, actor_id, post_id, body)
    values (v_parent.author_id, 'reply', new.author_id, new.post_id, 'svarade på din kommentar: ' || left(new.body, 80));
  end if;
  return new;
end $$;
create trigger comment_created after insert on public.comments
  for each row execute function public.on_comment_created();

-- En grupp med medlemmar ska alltid ha minst en admin.
-- Lämnar sista admin → den som varit med längst blir admin.
create or replace function public.ensure_group_admin() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_gid uuid; v_user uuid; v_name text;
begin
  v_gid := case when tg_op = 'DELETE' then old.group_id else new.group_id end;
  if not exists (select 1 from groups where id = v_gid) then return null; end if;
  if exists (select 1 from group_members where group_id = v_gid and role = 'admin') then return null; end if;
  select user_id into v_user from group_members where group_id = v_gid order by joined_at limit 1;
  if v_user is null then return null; end if;
  perform set_config('app.auto_promote', '1', true);
  update group_members set role = 'admin' where group_id = v_gid and user_id = v_user;
  perform set_config('app.auto_promote', '', true);
  select name into v_name from groups where id = v_gid;
  insert into notifications (user_id, kind, group_id, body)
  values (v_user, 'admin', v_gid, 'Du är nu admin för ' || v_name || ' eftersom gruppen saknade admin.');
  return null;
end $$;
create trigger group_members_admin after delete or update on public.group_members
  for each row execute function public.ensure_group_admin();

-- Notis när någon görs till admin
create or replace function public.on_admin_granted() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.role = 'admin' and old.role <> 'admin' and auth.uid() is not null and auth.uid() <> new.user_id
     and coalesce(current_setting('app.auto_promote', true), '') <> '1' then
    select name into v_name from groups where id = new.group_id;
    insert into notifications (user_id, kind, actor_id, group_id, body)
    values (new.user_id, 'admin', auth.uid(), new.group_id, 'gjorde dig till admin för ' || v_name);
  end if;
  return new;
end $$;
create trigger group_members_admin_granted after update on public.group_members
  for each row execute function public.on_admin_granted();

-- ---------- Funktioner som appen anropar ------------------------------

-- Markera att man är aktiv (används för att se om admins är inaktiva)
create or replace function public.touch() returns void
language sql security definer set search_path = public as $$
  update profiles set last_seen_at = now() where id = auth.uid();
$$;

create or replace function public.apply_for_funding(p_post uuid, p_group uuid, p_body text, p_amount numeric, p_payout text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_post posts; v_used numeric; v_amount numeric := p_amount; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad.'; end if;
  if p_group is null or not exists (select 1 from group_members where group_id = p_group and user_id = auth.uid()) then
    raise exception 'Välj en grupp du är med i att söka för.';
  end if;
  select * into v_post from posts where id = p_post;
  if v_post.id is null or v_post.fin_total is null then raise exception 'Inlägget är ingen finansiering.'; end if;
  if v_post.author_id = auth.uid() then raise exception 'Du kan inte söka från din egen finansiering.'; end if;
  if v_post.fin_closed or (v_post.fin_expires_at is not null and v_post.fin_expires_at < now()) then
    raise exception 'Finansieringen är stängd.';
  end if;
  if v_post.fin_mode = 'single' then v_amount := v_post.fin_total; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Ange ett belopp.'; end if;
  select coalesce(sum(applied_amount), 0) into v_used from comments where post_id = p_post and status in ('granted', 'paid');
  if v_amount > v_post.fin_total - v_used then
    raise exception 'Beloppet är större än det som finns kvar (% kr).', v_post.fin_total - v_used;
  end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Skriv en motivering.'; end if;
  if coalesce(trim(p_payout), '') = '' then raise exception 'Ange swishnummer eller bankkonto.'; end if;
  insert into comments (post_id, author_id, group_id, body, applied_amount, status)
  values (p_post, auth.uid(), p_group, trim(p_body), v_amount, 'applied') returning id into v_id;
  insert into payouts (comment_id, details) values (v_id, trim(p_payout));
  return v_id;
end $$;

create or replace function public.decide_application(p_comment uuid, p_decision text)
returns void language plpgsql security definer set search_path = public as $$
declare v_c comments; v_post posts; v_used numeric;
begin
  select * into v_c from comments where id = p_comment;
  select * into v_post from posts where id = v_c.post_id;
  if v_post.author_id is distinct from auth.uid() then raise exception 'Bara den som delar ut pengarna kan besluta.'; end if;
  if v_c.status is distinct from 'applied' then raise exception 'Ansökan är redan behandlad.'; end if;
  if p_decision not in ('granted', 'denied') then raise exception 'Ogiltigt beslut.'; end if;
  if p_decision = 'granted' then
    select coalesce(sum(applied_amount), 0) into v_used from comments where post_id = v_post.id and status in ('granted', 'paid');
    if v_c.applied_amount > v_post.fin_total - v_used then raise exception 'Det finns inte tillräckligt kvar för att bevilja.'; end if;
  end if;
  update comments set status = p_decision, decided_at = now() where id = p_comment;
  insert into notifications (user_id, kind, actor_id, post_id, body)
  values (v_c.author_id, 'decision', auth.uid(), v_post.id,
          case when p_decision = 'granted' then 'beviljade din ansökan på ' || v_c.applied_amount || ' kr'
               else 'avslog din ansökan' end);
  -- Den som sökt får ett meddelande (syns under meddelanden uppe till höger)
  insert into messages (from_id, to_id, body)
  values (auth.uid(), v_c.author_id,
          case when p_decision = 'granted'
               then 'Er ansökan på ' || v_c.applied_amount || ' kr har beviljats. Jag hör av mig när pengarna är skickade. #/post/' || v_post.id
               else 'Er ansökan på ' || v_c.applied_amount || ' kr fick tyvärr avslag den här gången. #/post/' || v_post.id end);
end $$;

create or replace function public.mark_paid(p_comment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_c comments; v_post posts;
begin
  select * into v_c from comments where id = p_comment;
  select * into v_post from posts where id = v_c.post_id;
  if v_post.author_id is distinct from auth.uid() then raise exception 'Bara den som delar ut pengarna kan markera utbetalningar.'; end if;
  if v_c.status is distinct from 'granted' then raise exception 'Ansökan är inte beviljad.'; end if;
  update comments set status = 'paid', paid_at = now() where id = p_comment;
  insert into notifications (user_id, kind, actor_id, post_id, body)
  values (v_c.author_id, 'paid', auth.uid(), v_post.id, 'har skickat ' || v_c.applied_amount || ' kr till dig');
  insert into messages (from_id, to_id, body)
  values (auth.uid(), v_c.author_id, 'Nu har jag skickat ' || v_c.applied_amount || ' kr till er. #/post/' || v_post.id);
end $$;

-- Körs varje natt (se cron.sql). Om en grupp inte haft någon aktiv admin på ett år:
-- 1) admins mejlas, 2) efter 30 dagar utan reaktion blir den som varit medlem längst admin.
create or replace function public.admin_succession() returns void
language plpgsql security definer set search_path = public as $$
declare g record; v_user uuid;
begin
  for g in select * from groups loop
    if exists (
      select 1 from group_members m join profiles p on p.id = m.user_id
      where m.group_id = g.id and m.role = 'admin' and p.last_seen_at > now() - interval '1 year'
    ) then
      if g.succession_notified_at is not null then
        update groups set succession_notified_at = null where id = g.id;
      end if;
    elsif g.succession_notified_at is null then
      insert into email_outbox (to_email, subject, body)
      select u.email,
             'Gruppen ' || g.name || ' saknar aktiv admin',
             'Hej! Ingen admin i ' || g.name || ' har loggat in på ett år. Om ingen admin loggar in inom 30 dagar blir den medlem som varit med längst admin. Logga in för att behålla din roll.'
      from group_members m join auth.users u on u.id = m.user_id
      where m.group_id = g.id and m.role = 'admin' and u.email is not null;
      update groups set succession_notified_at = now() where id = g.id;
    elsif g.succession_notified_at < now() - interval '30 days' then
      select m.user_id into v_user
      from group_members m join profiles p on p.id = m.user_id
      where m.group_id = g.id and m.role = 'member' and p.last_seen_at > now() - interval '1 year'
      order by m.joined_at limit 1;
      if v_user is not null then
        perform set_config('app.auto_promote', '1', true);
        update group_members set role = 'admin' where group_id = g.id and user_id = v_user;
        perform set_config('app.auto_promote', '', true);
        insert into notifications (user_id, kind, group_id, body)
        values (v_user, 'admin', g.id, 'Du är nu admin för ' || g.name || ' eftersom gruppen saknat aktiv admin i ett år.');
      end if;
      update groups set succession_notified_at = null where id = g.id;
    end if;
  end loop;
end $$;
revoke execute on function public.admin_succession() from public, anon, authenticated;

-- ---------- Behörigheter (Row Level Security) -------------------------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.highlights enable row level security;
alter table public.categories enable row level security;
alter table public.posts enable row level security;
alter table public.post_slides enable row level security;
alter table public.comments enable row level security;
alter table public.payouts enable row level security;
alter table public.notifications enable row level security;
alter table public.messages enable row level security;
alter table public.email_outbox enable row level security;   -- inga regler = bara servern kommer åt

create policy "profiler syns för inloggade" on public.profiles for select to authenticated using (true);
create policy "egen profil kan ändras" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

alter table public.home_places enable row level security;
create policy "egen plats" on public.home_places for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Platser där det finns grupper, för förslagen när man skapar konto (innan man är inloggad).
-- Bara land, region och stad – inga namn eller andra uppgifter.
create or replace function public.group_places() returns table (country text, region text, city text)
language sql stable security definer set search_path = public as $$
  select country, region, city from groups where country is not null;
$$;
grant execute on function public.group_places() to anon, authenticated;

create policy "grupper syns" on public.groups for select to authenticated using (true);
create policy "alla kan skapa grupper" on public.groups for insert to authenticated with check (created_by = auth.uid());
create policy "admins ändrar grupp" on public.groups for update to authenticated using (public.is_admin(id));
create policy "admins tar bort grupp" on public.groups for delete to authenticated using (public.is_admin(id));

create policy "medlemskap syns" on public.group_members for select to authenticated using (true);
create policy "öppet att gå med" on public.group_members for insert to authenticated with check (user_id = auth.uid() and role = 'member');
create policy "admins ändrar roller" on public.group_members for update to authenticated using (public.is_admin(group_id));
create policy "lämna eller ta bort" on public.group_members for delete to authenticated using (user_id = auth.uid() or public.is_admin(group_id));

create policy "höjdpunkter syns" on public.highlights for select to authenticated using (true);
create policy "medlemmar skapar höjdpunkter" on public.highlights for insert to authenticated with check (public.is_member(group_id));
create policy "medlemmar ändrar höjdpunkter" on public.highlights for update to authenticated using (public.is_member(group_id));
create policy "medlemmar tar bort höjdpunkter" on public.highlights for delete to authenticated using (public.is_member(group_id));

create policy "kategorier syns" on public.categories for select to authenticated using (true);
create policy "alla kan skapa kategorier" on public.categories for insert to authenticated with check (length(trim(name)) between 1 and 40);

create policy "inlägg syns" on public.posts for select to authenticated using (true);
create policy "posta själv, i egna grupper" on public.posts for insert to authenticated
  with check (author_id = auth.uid() and (group_id is null or public.is_member(group_id)));
create policy "författaren ändrar" on public.posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid() and (group_id is null or public.is_member(group_id)));
create policy "författaren eller gruppadmin tar bort" on public.posts for delete to authenticated
  using (author_id = auth.uid() or (group_id is not null and public.is_admin(group_id)));

create policy "bilder syns" on public.post_slides for select to authenticated using (true);
create policy "författaren hanterar bilder" on public.post_slides for all to authenticated
  using (exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid()))
  with check (exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid()));

create policy "kommentarer syns" on public.comments for select to authenticated using (true);
create policy "vanliga kommentarer" on public.comments for insert to authenticated
  with check (author_id = auth.uid() and status is null and applied_amount is null and group_id is null);
create policy "ta bort egen kommentar" on public.comments for delete to authenticated
  using (author_id = auth.uid() and (status is null or status in ('applied', 'denied')));

create policy "utbetalningsuppgifter syns för båda parter" on public.payouts for select to authenticated using (
  exists (select 1 from comments c join posts p on p.id = c.post_id
          where c.id = comment_id and (c.author_id = auth.uid() or p.author_id = auth.uid()))
);

create policy "egna notiser" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "markera notiser lästa" on public.notifications for update to authenticated using (user_id = auth.uid());

create policy "egna meddelanden" on public.messages for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());
create policy "skicka meddelanden" on public.messages for insert to authenticated with check (from_id = auth.uid() and to_id <> auth.uid());
create policy "markera meddelanden lästa" on public.messages for update to authenticated using (to_id = auth.uid());

-- Långtidsminnet: vem som vill spara vilket inlägg.
create table public.memory_votes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.memory_votes enable row level security;
create policy "minnesröster syns" on public.memory_votes for select to authenticated using (true);
create policy "rösta själv" on public.memory_votes for insert to authenticated with check (user_id = auth.uid());
create policy "ta tillbaka egen röst" on public.memory_votes for delete to authenticated using (user_id = auth.uid());

-- Evenemang: vem som är intresserad eller kommer.
create table public.event_rsvps (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('interested', 'going')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.event_rsvps enable row level security;
create policy "anmälningar syns" on public.event_rsvps for select to authenticated using (true);
create policy "anmäl dig själv" on public.event_rsvps for insert to authenticated with check (user_id = auth.uid());
create policy "ändra egen anmälan" on public.event_rsvps for update to authenticated using (user_id = auth.uid());
create policy "ta bort egen anmälan" on public.event_rsvps for delete to authenticated using (user_id = auth.uid());

-- ---------- Kalenderprenumeration och push-notiser ----------------

-- Inställningar som bara servern når (inga regler = ingen åtkomst från appen)
create table if not exists public.app_settings (key text primary key, value text not null);
alter table public.app_settings enable row level security;

-- Varje person får en hemlig kalenderlänk
create table if not exists public.user_secrets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  calendar_token uuid not null unique default gen_random_uuid()
);
alter table public.user_secrets enable row level security;
drop policy if exists "egen hemlighet" on public.user_secrets;
create policy "egen hemlighet" on public.user_secrets for select to authenticated using (user_id = auth.uid());

create or replace function public.my_calendar_token() returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad.'; end if;
  insert into user_secrets (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select calendar_token into v from user_secrets where user_id = auth.uid();
  return v;
end $$;

-- Telefoner/webbläsare som vill ha push
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "egna push-prenumerationer" on public.push_subscriptions;
create policy "egna push-prenumerationer" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Nytt meddelande eller ny ansökan → be serverfunktionen skicka en push
create extension if not exists pg_net;
create or replace function public.notify_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  if tg_table_name = 'comments' then
    -- bara ansökningar (vanliga kommentarer ger ingen push); läses via to_jsonb eftersom meddelanden saknar fältet
    if (to_jsonb(new) ->> 'status') is distinct from 'applied' then return new; end if;
  end if;
  select value into v_url from app_settings where key = 'push_url';
  select value into v_secret from app_settings where key = 'push_secret';
  if v_url is null or v_secret is null then return new; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('type', tg_table_name, 'id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret)
  );
  return new;
end $$;
drop trigger if exists push_on_message on public.messages;
create trigger push_on_message after insert on public.messages for each row execute function public.notify_push();
drop trigger if exists push_on_application on public.comments;
create trigger push_on_application after insert on public.comments for each row execute function public.notify_push();

-- ---------- Bildlagring ------------------------------------------------

insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;

create policy "ladda upp egna bilder" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bilder är publika" on storage.objects for select using (bucket_id = 'media');
create policy "ta bort egna bilder" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Redaktionen, anmälningar, historik och feedback (012) ----------

-- ---------- Redaktionen ----------
create table if not exists public.editors (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now()
);
alter table public.editors enable row level security;
drop policy if exists "redaktionen syns" on public.editors;
create policy "redaktionen syns" on public.editors for select to authenticated using (true);

create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from editors where user_id = auth.uid())
$$;

-- ---------- Anmälningar ----------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('post', 'group', 'user', 'feedback')),
  target_id uuid not null,
  target_name text,
  reason text not null check (length(trim(reason)) between 1 and 1000),
  reporter_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null
);
alter table public.reports enable row level security;
drop policy if exists "anmäl" on public.reports;
create policy "anmäl" on public.reports for insert to authenticated with check (reporter_id = auth.uid() and done_at is null);
drop policy if exists "redaktionen ser anmälningar" on public.reports;
create policy "redaktionen ser anmälningar" on public.reports for select to authenticated using (public.is_editor() or reporter_id = auth.uid());

-- ---------- Historik ----------
create table if not exists public.editor_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,          -- report_done | editor_add | editor_remove | delete_post | delete_group | delete_user | delete_feedback | feedback_status
  target_id uuid,
  summary text not null,
  created_at timestamptz not null default now(),
  reverted_at timestamptz,
  reverted_by uuid references public.profiles(id) on delete set null
);
alter table public.editor_log enable row level security;
drop policy if exists "redaktionen ser historiken" on public.editor_log;
create policy "redaktionen ser historiken" on public.editor_log for select to authenticated using (public.is_editor());

create or replace function public.need_editor() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from editors where user_id = auth.uid()) then
    raise exception 'Bara Redaktionen kan göra det.';
  end if;
end $$;

-- Ny anmälan → notis till Redaktionen
create or replace function public.on_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare what text := case new.kind when 'post' then 'ett inlägg' when 'group' then 'gruppen ' || coalesce(new.target_name, '')
  when 'user' then coalesce(new.target_name, 'en användare') else 'ett feedbackinlägg' end;
begin
  insert into notifications (user_id, kind, actor_id, post_id, group_id, body)
  select e.user_id, 'report', new.reporter_id,
    case when new.kind = 'post' then new.target_id end, case when new.kind = 'group' then new.target_id end,
    'anmälde ' || what || ': ”' || left(new.reason, 120) || '” – finns i Redaktionens checklista'
  from editors e where e.user_id is distinct from new.reporter_id;
  return new;
end $$;
drop trigger if exists report_created on public.reports;
create trigger report_created after insert on public.reports for each row execute function public.on_report();

-- Bocka av / öppna en anmälan igen
create or replace function public.set_report_done(p_id uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r reports;
begin
  perform need_editor();
  select * into r from reports where id = p_id;
  if r.id is null then raise exception 'Anmälan finns inte.'; end if;
  update reports set done_at = case when p_done then now() end, done_by = case when p_done then auth.uid() end where id = p_id;
  if p_done then
    insert into editor_log (actor_id, action, target_id, summary)
    values (auth.uid(), 'report_done', p_id, 'bockade av anmälan om ' || coalesce(r.target_name, 'innehåll') || ': ”' || left(r.reason, 80) || '”');
  end if;
end $$;

-- Lägg till eller ta bort någon ur Redaktionen
create or replace function public.set_editor(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  perform need_editor();
  select name into n from profiles where id = p_user;
  if n is null then raise exception 'Personen finns inte.'; end if;
  if p_on then
    if exists (select 1 from editors where user_id = p_user) then return; end if;
    insert into editors (user_id, added_by) values (p_user, auth.uid());
    insert into editor_log (actor_id, action, target_id, summary) values (auth.uid(), 'editor_add', p_user, 'lade till ' || n || ' i Redaktionen');
    insert into notifications (user_id, kind, actor_id, body) values (p_user, 'admin', auth.uid(), 'lade till dig i Redaktionen');
  else
    if not exists (select 1 from editors where user_id = p_user) then return; end if;
    if (select count(*) from editors) <= 1 then raise exception 'Redaktionen måste ha minst en person.'; end if;
    delete from editors where user_id = p_user;
    insert into editor_log (actor_id, action, target_id, summary) values (auth.uid(), 'editor_remove', p_user, 'tog bort ' || n || ' ur Redaktionen');
  end if;
end $$;

-- Ta bort inlägg, grupp, användare eller feedback (går inte att ångra)
create or replace function public.editor_delete(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  perform need_editor();
  if p_kind = 'post' then
    select coalesce(nullif(left(caption, 60), ''), 'inlägg') into n from posts where id = p_id;
    delete from posts where id = p_id;
  elsif p_kind = 'group' then
    select name into n from groups where id = p_id;
    delete from posts where group_id = p_id;
    delete from groups where id = p_id;
  elsif p_kind = 'user' then
    if p_id = auth.uid() then raise exception 'Ta bort ditt eget konto under Hjälp → Radera ditt konto.'; end if;
    select name into n from profiles where id = p_id;
    delete from profiles where id = p_id;
    delete from auth.users where id = p_id;
  elsif p_kind = 'feedback' then
    select left(title, 60) into n from feedback where id = p_id;
    delete from feedback where id = p_id;
  else raise exception 'Okänd typ.';
  end if;
  if n is null then raise exception 'Det finns inte (längre).'; end if;
  -- Anmälningar om det som togs bort bockas av
  update reports set done_at = now(), done_by = auth.uid() where target_id = p_id and done_at is null;
  insert into editor_log (actor_id, action, target_id, summary)
  values (auth.uid(), 'delete_' || p_kind, p_id, 'tog bort ' || case p_kind when 'post' then 'inlägget ”' || n || '”'
    when 'group' then 'gruppen ' || n when 'user' then 'användaren ' || n else 'feedbacken ”' || n || '”' end);
end $$;

-- Ångra något i historiken (det som togs bort kan inte ångras)
create or replace function public.revert_log(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l editor_log;
begin
  perform need_editor();
  select * into l from editor_log where id = p_id;
  if l.id is null or l.reverted_at is not null then raise exception 'Redan ångrat.'; end if;
  if l.action = 'report_done' then
    update reports set done_at = null, done_by = null where id = l.target_id;
  elsif l.action = 'editor_add' then
    if (select count(*) from editors) <= 1 then raise exception 'Redaktionen måste ha minst en person.'; end if;
    delete from editors where user_id = l.target_id;
  elsif l.action = 'editor_remove' then
    insert into editors (user_id, added_by) values (l.target_id, auth.uid()) on conflict do nothing;
  elsif l.action = 'feedback_status' then
    update feedback set status = null where id = l.target_id;
  else raise exception 'Det här går inte att ångra.';
  end if;
  update editor_log set reverted_at = now(), reverted_by = auth.uid() where id = p_id;
  -- Den som gjorde det får veta att det ångrades
  if l.actor_id is distinct from auth.uid() then
    insert into notifications (user_id, kind, actor_id, body) values (l.actor_id, 'admin', auth.uid(), 'ångrade att du ' || l.summary);
  end if;
end $$;

-- ---------- Radera eget konto ----------
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Du är inte inloggad.'; end if;
  if exists (select 1 from editors where user_id = me) and (select count(*) from editors) <= 1 then
    raise exception 'Du är sista personen i Redaktionen. Lägg till någon annan först.';
  end if;
  delete from profiles where id = me;
  delete from auth.users where id = me;
end $$;

-- ---------- Feedback på appen ----------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  title text not null check (length(trim(title)) between 3 and 140),
  body text not null check (length(trim(body)) between 1 and 4000),
  status text check (status in ('planerad', 'klar')),
  created_at timestamptz not null default now()
);
create table if not exists public.feedback_votes (
  feedback_id uuid not null references public.feedback(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  value smallint not null check (value in (-1, 1)),
  primary key (feedback_id, user_id)
);
create table if not exists public.feedback_comments (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback(id) on delete cascade,
  parent_id uuid references public.feedback_comments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
alter table public.feedback_votes enable row level security;
alter table public.feedback_comments enable row level security;
drop policy if exists "feedback syns" on public.feedback;
create policy "feedback syns" on public.feedback for select to authenticated using (true);
drop policy if exists "skriv feedback" on public.feedback;
create policy "skriv feedback" on public.feedback for insert to authenticated with check (author_id = auth.uid() and status is null);
drop policy if exists "ta bort egen feedback" on public.feedback;
create policy "ta bort egen feedback" on public.feedback for delete to authenticated using (author_id = auth.uid());
drop policy if exists "röster syns" on public.feedback_votes;
create policy "röster syns" on public.feedback_votes for select to authenticated using (true);
drop policy if exists "egen röst" on public.feedback_votes;
create policy "egen röst" on public.feedback_votes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "feedbackkommentarer syns" on public.feedback_comments;
create policy "feedbackkommentarer syns" on public.feedback_comments for select to authenticated using (true);
drop policy if exists "kommentera feedback" on public.feedback_comments;
create policy "kommentera feedback" on public.feedback_comments for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "ta bort egen feedbackkommentar" on public.feedback_comments;
create policy "ta bort egen feedbackkommentar" on public.feedback_comments for delete to authenticated using (author_id = auth.uid() or public.is_editor());

-- Redaktionen sätter status (planerad, klar, inte nu) – syns för alla
create or replace function public.set_feedback_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare f feedback;
begin
  perform need_editor();
  select * into f from feedback where id = p_id;
  if f.id is null then raise exception 'Finns inte.'; end if;
  update feedback set status = p_status where id = p_id;
  if p_status is not null then
    insert into editor_log (actor_id, action, target_id, summary)
    values (auth.uid(), 'feedback_status', p_id, 'satte ”' || left(f.title, 60) || '” som ' || p_status);
    if f.author_id <> auth.uid() then
      insert into notifications (user_id, kind, actor_id, body) values (f.author_id, 'admin', auth.uid(), 'markerade din feedback ”' || left(f.title, 60) || '” som ' || p_status);
    end if;
  end if;
end $$;

-- Lägg till den första i Redaktionen för hand, t.ex.:
-- insert into public.editors (user_id) select id from public.profiles where name = 'Ditt Namn';

-- ---------- Låsta grupper (014) ----------
-- ---------- Låsta grupper ----------
-- En låst grupp går inte att gå med i själv. Gruppen Omställningsplatser är låst och dess medlemmar är Redaktionen.
alter table public.groups add column if not exists locked boolean not null default false;
update public.groups set locked = true where name = 'Omställningsplatser';

drop policy if exists "öppet att gå med" on public.group_members;
create policy "öppet att gå med" on public.group_members for insert to authenticated
  with check (user_id = auth.uid() and role = 'member'
    and not exists (select 1 from public.groups g where g.id = group_id and g.locked));

-- Medlemmarna i den låsta gruppen följer Redaktionen: läggs någon till eller tas bort där, följer gruppen med.
create or replace function public.sync_editor_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into group_members (group_id, user_id, role)
    select g.id, new.user_id, 'admin' from groups g where g.locked and g.name = 'Omställningsplatser'
    on conflict (group_id, user_id) do update set role = 'admin';
    return new;
  else
    delete from group_members gm using groups g
    where gm.group_id = g.id and g.locked and g.name = 'Omställningsplatser' and gm.user_id = old.user_id;
    return old;
  end if;
end $$;
drop trigger if exists editors_sync_group on public.editors;
create trigger editors_sync_group after insert or delete on public.editors
  for each row execute function public.sync_editor_group();

-- ---------- Gruppadmins (016) ----------
-- Inlägg som gruppen: bara gruppens admins får välja det.
alter table public.posts add column if not exists as_group boolean not null default false;

drop policy if exists "posta själv, i egna grupper" on public.posts;
create policy "posta själv, i egna grupper" on public.posts for insert to authenticated
  with check (author_id = auth.uid() and (group_id is null or public.is_member(group_id))
    and (not as_group or (group_id is not null and public.is_admin(group_id))));
drop policy if exists "författaren ändrar" on public.posts;
create policy "författaren ändrar" on public.posts for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid() and (group_id is null or public.is_member(group_id))
    and (not as_group or (group_id is not null and public.is_admin(group_id))));

-- Lägg till en medlem (bara gruppens admins, inte i låsta grupper). Personen får en notis.
create or replace function public.add_member(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g groups;
begin
  select * into g from groups where id = p_group;
  if g.id is null then raise exception 'Gruppen finns inte.'; end if;
  if not public.is_admin(p_group) then raise exception 'Bara gruppens admins kan lägga till medlemmar.'; end if;
  if g.locked then raise exception 'Gruppen är låst – medlemmarna är Redaktionen.'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'Personen finns inte.'; end if;
  insert into group_members (group_id, user_id, role) values (p_group, p_user, 'member') on conflict do nothing;
  if found and p_user <> auth.uid() then
    insert into notifications (user_id, kind, actor_id, group_id, body) values (p_user, 'admin', auth.uid(), p_group, 'lade till dig i ' || g.name);
  end if;
end $$;

-- ---------- Minne: kategori (017) ----------
alter table public.memory_votes add column if not exists theme text check (theme is null or length(trim(theme)) between 1 and 40);

-- ---------- Minnets kategorier (018) ----------

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

-- ---------- Länderna i appen (019) ----------
create or replace function public.available_countries() returns table (country text)
language sql stable security definer set search_path = public as $$
  select distinct btrim(c) from (
    select country as c from groups
    union select event_country from posts where is_event
    union select country from home_places
  ) x where coalesce(btrim(c), '') <> '' order by 1;
$$;
grant execute on function public.available_countries() to authenticated;

-- ---------- Platser med innehåll (020) ----------
create or replace function public.content_places()
returns table (country text, region text, city text, postcode text, district text)
language sql stable security definer set search_path = public as $$
  select distinct nullif(btrim(country), ''), nullif(btrim(region), ''), nullif(btrim(city), ''), nullif(btrim(postcode), ''), nullif(btrim(district), '') from (
    select country, region, city, postcode, null::text as district from groups
    union all
    select coalesce(p.event_country, g.country), p.event_region, p.event_city, p.event_postcode, null
      from posts p left join groups g on g.id = p.group_id where p.is_event and (p.event_city is not null or p.event_postcode is not null)
    union all
    select country, region, city, postcode, district from home_places
  ) x where coalesce(btrim(country), '') <> '';
$$;
grant execute on function public.content_places() to authenticated;

-- ---------- Minne: flera kategorier (021) ----------
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

-- ---------- Minne: flera val när man sparar (022) ----------
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

-- ---------- Inläggets plats (024) ----------
alter table public.posts add column if not exists country text;
alter table public.posts add column if not exists region text;
alter table public.posts add column if not exists city text;
alter table public.posts add column if not exists postcode text;

-- Evenemang i samma stad som gruppen får gruppens postnummer om adressen saknar det (t.ex. Sjöbergen, 426 71).
update public.posts p set event_postcode = g.postcode
from public.groups g
where p.is_event and p.event_postcode is null and p.group_id = g.id and g.postcode is not null
  and (p.event_city is null or lower(p.event_city) = lower(g.city));

-- Platsväljaren: grupper, inlägg utan grupp (deras egen plats) och personer.
create or replace function public.content_places()
returns table (country text, region text, city text, postcode text, district text)
language sql stable security definer set search_path = public as $$
  select distinct nullif(btrim(country), ''), nullif(btrim(region), ''), nullif(btrim(city), ''), nullif(btrim(postcode), ''), nullif(btrim(district), '') from (
    select country, region, city, postcode, null::text as district from groups
    union all
    select country, region, city, postcode, null from posts where group_id is null
    union all
    select country, region, city, postcode, district from home_places
  ) x where coalesce(btrim(country), '') <> '';
$$;

create or replace function public.available_countries() returns table (country text)
language sql stable security definer set search_path = public as $$
  select distinct btrim(c) from (
    select country as c from groups
    union select country from posts where group_id is null
    union select country from home_places
  ) x where coalesce(btrim(c), '') <> '' order by 1;
$$;

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

-- 028: Grupper, inlägg och platser som har region eller stad men saknar land hör till Sverige
-- (t.ex. Tempo Nordvärmland hamnade under "Andra länder" i platsväljaren).
update public.groups set country = 'Sverige' where coalesce(btrim(country), '') = '' and (region is not null or city is not null);
update public.posts set country = 'Sverige' where group_id is null and coalesce(btrim(country), '') = '' and (region is not null or city is not null);
update public.home_places set country = 'Sverige' where coalesce(btrim(country), '') = '' and (region is not null or city is not null);

-- 030: "Nytt sen sist" följer kontot, inte webbläsaren.
-- Ett besök börjar när man öppnar appen efter mer än 30 minuter borta. Då sparas när man senast var aktiv
-- som prev_visit_at, och det är det som räknas som "sist" (nya inlägg och uppdateringar av appen sen dess).
alter table public.profiles add column if not exists visit_started_at timestamptz;
alter table public.profiles add column if not exists prev_visit_at timestamptz;

create or replace function public.begin_visit() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare p profiles; fresh boolean;
begin
  select * into p from profiles where id = auth.uid();
  if p.id is null then return null; end if;
  fresh := p.visit_started_at is null or p.last_seen_at < now() - interval '30 minutes';
  update profiles set
    prev_visit_at = case when fresh then p.last_seen_at else prev_visit_at end,
    visit_started_at = case when fresh then now() else visit_started_at end,
    last_seen_at = now()
  where id = auth.uid()
  returning prev_visit_at into p.prev_visit_at;
  return p.prev_visit_at;
end $$;

-- 031: Vem ser inlägget? Som standard alla. Den som postar kan välja att bara vissa grupper ser det
-- (visible_to = gruppernas id). Författaren och Redaktionen ser alltid inlägget.
alter table public.posts add column if not exists visible_to uuid[];

create or replace function public.can_see_post(p_visible uuid[], p_author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_visible is null or cardinality(p_visible) = 0 or p_author = auth.uid() or public.is_editor()
    or exists (select 1 from group_members where user_id = auth.uid() and group_id = any(p_visible));
$$;

drop policy if exists "inlägg syns" on public.posts;
create policy "inlägg syns" on public.posts for select to authenticated using (public.can_see_post(visible_to, author_id));

-- Bilder och kommentarer följer inlägget.
drop policy if exists "bilder syns" on public.post_slides;
create policy "bilder syns" on public.post_slides for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "kommentarer syns" on public.comments;
create policy "kommentarer syns" on public.comments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

-- 032: Mejlen i email_outbox skickas (via funktionen mejl och Gmail).
-- * Nya mejl i kön skickas direkt.
-- * Ett mejl som inte gick iväg försöks igen varje timme, högst 5 gånger.
alter table public.email_outbox add column if not exists claimed_at timestamptz;
alter table public.email_outbox add column if not exists attempts int not null default 0;
alter table public.email_outbox add column if not exists error text;

-- Funktionen tar ett gäng mejl åt gången och markerar dem, så att samma mejl aldrig skickas två gånger.
create or replace function public.claim_outbox(p_limit int default 40) returns setof public.email_outbox
language sql security definer set search_path = public as $$
  update email_outbox o set claimed_at = now(), attempts = o.attempts + 1
  where o.id in (
    select id from email_outbox
    where sent_at is null and attempts < 5 and (claimed_at is null or claimed_at < now() - interval '10 minutes')
    order by created_at limit p_limit
    for update skip locked)
  returning o.*;
$$;
revoke execute on function public.claim_outbox(int) from public, anon, authenticated;

create or replace function public.send_outbox() returns void
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select value into v_url from app_settings where key = 'mejl_url';
  select value into v_secret from app_settings where key = 'push_secret';
  if v_url is null or v_secret is null then return; end if;
  if not exists (select 1 from email_outbox where sent_at is null and attempts < 5) then return; end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret));
end $$;
revoke execute on function public.send_outbox() from public, anon, authenticated;

create or replace function public.on_outbox() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.send_outbox();
  return null;
end $$;
drop trigger if exists outbox_send on public.email_outbox;
create trigger outbox_send after insert on public.email_outbox for each statement execute function public.on_outbox();

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

-- 035: Region fylls i automatiskt, och Redaktionen är alltid verifierad.
-- * En grupp, ett inlägg eller en plats med stad men utan region får regionen från andra platser i samma stad
--   (t.ex. Göteborg → Västra Götalands län). Gäller både det som redan finns och allt som sparas framöver.
-- * Gruppen Redaktion och alla dess medlemmar är verifierade, och nya medlemmar blir det direkt.

-- ---------- Region från staden ----------
create or replace function public.region_for_city(p_country text, p_city text) returns text
language sql stable security definer set search_path = public as $$
  select region from (
    select region from groups where region is not null and lower(city) = lower(p_city) and coalesce(lower(country), 'sverige') = coalesce(lower(p_country), 'sverige')
    union all select region from home_places where region is not null and lower(city) = lower(p_city)
    union all select region from posts where region is not null and lower(city) = lower(p_city)
  ) x group by region order by count(*) desc limit 1;
$$;

create or replace function public.fill_region() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.region is null and nullif(btrim(coalesce(new.city, '')), '') is not null then
    new.region := public.region_for_city(new.country, new.city);
  end if;
  return new;
end $$;
drop trigger if exists groups_fill_region on public.groups;
create trigger groups_fill_region before insert or update of city, region on public.groups for each row execute function public.fill_region();
drop trigger if exists posts_fill_region on public.posts;
create trigger posts_fill_region before insert or update of city, region on public.posts for each row execute function public.fill_region();
drop trigger if exists home_places_fill_region on public.home_places;
create trigger home_places_fill_region before insert or update of city, region on public.home_places for each row execute function public.fill_region();

update public.groups set region = public.region_for_city(country, city) where region is null and city is not null;
update public.posts set region = public.region_for_city(country, city) where region is null and city is not null;
update public.home_places set region = public.region_for_city(country, city) where region is null and city is not null;

-- ---------- Redaktionen är verifierad ----------
-- Skydden mot att verifiera sig själv släpper igenom databasen själv (ingen inloggad) och den låsta gruppen.
create or replace function public.guard_group_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_editor() or new.locked then return new; end if;
  if tg_op = 'INSERT' then new.verified_at := null; new.verified_by := null;
  else new.verified_at := old.verified_at; new.verified_by := old.verified_by; end if;
  return new;
end $$;

create or replace function public.guard_member_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Redaktionens medlemmar är alltid verifierade.
  if exists (select 1 from groups g where g.id = new.group_id and g.locked) then new.verified := true; return new; end if;
  if auth.uid() is null then return new; end if;
  if new.verified and (tg_op = 'INSERT' or not old.verified) and not public.is_admin(new.group_id) then
    new.verified := false; new.verified_by := null;
  end if;
  return new;
end $$;

update public.groups set verified_at = coalesce(verified_at, now()) where locked;
update public.group_members gm set verified = true from public.groups g where g.id = gm.group_id and g.locked;

-- 036: Omnämnanden. @[Namn](id) i ett inlägg eller en kommentar ger personen en notis.
-- Bara den som får se inlägget får notisen, och ett inlägg som redigeras ger ingen ny notis till samma person.
create or replace function public.notify_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_text text; v_post uuid; v_author uuid; v_what text; v_vis uuid[]; u uuid;
begin
  if tg_table_name = 'posts' then
    if tg_op = 'UPDATE' and new.caption is not distinct from old.caption then return new; end if;
    v_text := new.caption; v_post := new.id; v_author := new.author_id; v_vis := new.visible_to; v_what := 'nämnde dig i ett inlägg';
  else
    v_text := new.body; v_post := new.post_id; v_author := new.author_id; v_what := 'nämnde dig i en kommentar';
    select visible_to into v_vis from posts where id = new.post_id;
  end if;
  for u in select distinct r[1]::uuid from regexp_matches(coalesce(v_text, ''), '@\[[^\]\n]{1,80}\]\(([0-9a-f-]{36})\)', 'g') as r loop
    continue when u = v_author or not exists (select 1 from profiles where id = u);
    continue when v_vis is not null and cardinality(v_vis) > 0
      and not exists (select 1 from group_members where user_id = u and group_id = any(v_vis))
      and not exists (select 1 from editors where user_id = u and accepted_at is not null);
    continue when tg_table_name = 'posts' and exists (select 1 from notifications where user_id = u and kind = 'mention' and post_id = v_post and body = v_what);
    insert into notifications (user_id, kind, actor_id, post_id, body) values (u, 'mention', v_author, v_post, v_what);
  end loop;
  return new;
end $$;
drop trigger if exists posts_mentions on public.posts;
create trigger posts_mentions after insert or update of caption on public.posts for each row execute function public.notify_mentions();
drop trigger if exists comments_mentions on public.comments;
create trigger comments_mentions after insert on public.comments for each row execute function public.notify_mentions();

-- 037: Projekt (förr höjdpunkter) kan ha en beskrivning.
alter table public.highlights add column if not exists description text;

-- 038: Reagera med en emoji på meddelanden – både mellan två personer och i samtal med flera eller hela grupper.
-- Bara de som ser meddelandet ser reaktionerna och kan reagera.
create table if not exists public.dm_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create table if not exists public.chat_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
alter table public.dm_reactions enable row level security;
alter table public.chat_reactions enable row level security;

create or replace function public.sees_dm(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from messages where id = m and auth.uid() in (from_id, to_id));
$$;
create or replace function public.sees_chat_message(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from chat_messages x where x.id = m and public.in_chat(x.chat_id));
$$;

drop policy if exists "reaktioner syns" on public.dm_reactions;
create policy "reaktioner syns" on public.dm_reactions for select to authenticated using (public.sees_dm(message_id));
drop policy if exists "reagera själv" on public.dm_reactions;
create policy "reagera själv" on public.dm_reactions for insert to authenticated with check (user_id = auth.uid() and public.sees_dm(message_id));
drop policy if exists "ta bort egen reaktion" on public.dm_reactions;
create policy "ta bort egen reaktion" on public.dm_reactions for delete to authenticated using (user_id = auth.uid());

drop policy if exists "reaktioner syns" on public.chat_reactions;
create policy "reaktioner syns" on public.chat_reactions for select to authenticated using (public.sees_chat_message(message_id));
drop policy if exists "reagera själv" on public.chat_reactions;
create policy "reagera själv" on public.chat_reactions for insert to authenticated with check (user_id = auth.uid() and public.sees_chat_message(message_id));
drop policy if exists "ta bort egen reaktion" on public.chat_reactions;
create policy "ta bort egen reaktion" on public.chat_reactions for delete to authenticated using (user_id = auth.uid());

-- 039: Hur långt ut ett inlägg når.
alter table public.posts add column if not exists reach text check (reach is null or reach in ('district', 'city', 'region', 'country'));

-- 040: Redaktionen kan också verifiera medlemmar i en grupp (inte bara gruppens admins).
-- Sjöbergens plats rättas: Otterklintsvägen ligger i Sanna/Sjöbergen (414 47), inte i Hagen (426 71).
create or replace function public.set_member_verified(p_group uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare gname text;
begin
  if not (public.is_admin(p_group) or public.is_editor()) then raise exception 'Bara gruppens admins och Redaktionen kan verifiera medlemmar.'; end if;
  select name into gname from groups where id = p_group;
  update group_members set verified = p_on, verified_by = case when p_on then auth.uid() end where group_id = p_group and user_id = p_user;
  if not found then raise exception 'Personen är inte med i gruppen.'; end if;
  if p_on and p_user <> auth.uid() then
    insert into notifications (user_id, kind, actor_id, group_id, body) values (p_user, 'admin', auth.uid(), p_group, 'verifierade dig som medlem i ' || gname);
  end if;
end $$;

create or replace function public.guard_member_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from groups g where g.id = new.group_id and g.locked) then new.verified := true; return new; end if;
  if auth.uid() is null then return new; end if;
  if new.verified and (tg_op = 'INSERT' or not old.verified) and not (public.is_admin(new.group_id) or public.is_editor()) then
    new.verified := false; new.verified_by := null;
  end if;
  return new;
end $$;

-- 041: Beskrivning på profilen, och ett enklare sätt för finansiering och resurser.
-- * profiles.bio: en kort text om en själv.
-- * posts.stance: 'behovs' (något behövs), 'finns' (något finns att få/låna) eller 'tips' (bara finansiering).
-- * posts.amount och posts.deadline: valfritt belopp och sista dag – resten sköts i kommentarerna.
-- * De gamla finansieringsinläggen (med ansökningar och utbetalningar i appen) tas bort.
alter table public.profiles add column if not exists bio text check (bio is null or char_length(bio) <= 600);
alter table public.posts add column if not exists stance text;
alter table public.posts add column if not exists amount numeric check (amount is null or amount >= 0);
alter table public.posts add column if not exists deadline date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'posts_stance_check') then
    alter table public.posts add constraint posts_stance_check check (stance is null or stance in ('behovs', 'finns', 'tips'));
  end if;
end $$;
