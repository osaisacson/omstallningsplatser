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
