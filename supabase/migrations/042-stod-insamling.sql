-- 042: "Pengar behövs" fungerar som en enkel insamling (som Kickstarter).
-- * Den som lägger upp anger mål (amount), sista dag (deadline) och vart pengarna ska swishas (swish, swish_name).
-- * Andra lovar ett belopp (pledges). Ingen betalar förrän insamlingen genomförs.
-- * När sista dagen passerat: nått målet → genomförs direkt. Annars får den som lagt upp välja:
--   samla in ändå, förläng eller avbryt (decide_pledges).
-- * När den genomförs får alla som lovat en punkt i checklistan: swisha X kr till Y för Z. De bockar av när de betalat.
-- Hur mycket var och en lovat syns bara för personen själv och den som lagt upp. Alla ser summan och antalet.

alter table public.posts add column if not exists swish text check (swish is null or char_length(swish) <= 40);
alter table public.posts add column if not exists swish_name text check (swish_name is null or char_length(swish_name) <= 80);
alter table public.posts add column if not exists pledge_state text check (pledge_state is null or pledge_state in ('collect', 'cancelled'));
alter table public.posts add column if not exists pledged_total numeric not null default 0;
alter table public.posts add column if not exists pledgers int not null default 0;
alter table public.posts add column if not exists deadline_noticed date;

-- Summan, antalet och beslutet ändras bara av funktionerna nedan – inte genom att redigera inlägget.
create or replace function public.guard_post_pledges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('app.pledges', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    new.pledged_total := 0; new.pledgers := 0; new.pledge_state := null; new.deadline_noticed := null;
  else
    new.pledged_total := old.pledged_total; new.pledgers := old.pledgers; new.pledge_state := old.pledge_state; new.deadline_noticed := old.deadline_noticed;
  end if;
  return new;
end $$;
drop trigger if exists posts_guard_pledges on public.posts;
create trigger posts_guard_pledges before insert or update on public.posts for each row execute function public.guard_post_pledges();

create table if not exists public.pledges (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null check (amount > 0 and amount <= 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  primary key (post_id, user_id)
);
alter table public.pledges enable row level security;

-- Insamlingen tar emot löften: pengar behövs, inte avgjord, och sista dagen har inte passerat.
create or replace function public.pledge_open(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts where id = p and kind = 'finansiering' and stance = 'behovs'
    and pledge_state is null and (deadline is null or deadline >= (now() at time zone 'Europe/Stockholm')::date));
$$;
create or replace function public.is_post_author(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts where id = p and author_id = auth.uid());
$$;

drop policy if exists "egna löften och den som samlar in" on public.pledges;
create policy "egna löften och den som samlar in" on public.pledges for select to authenticated
  using (user_id = auth.uid() or public.is_post_author(post_id));
drop policy if exists "lova själv" on public.pledges;
create policy "lova själv" on public.pledges for insert to authenticated
  with check (user_id = auth.uid() and paid_at is null and public.pledge_open(post_id) and not public.is_post_author(post_id));
drop policy if exists "ändra eget löfte" on public.pledges;
create policy "ändra eget löfte" on public.pledges for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "ta tillbaka eget löfte" on public.pledges;
create policy "ta tillbaka eget löfte" on public.pledges for delete to authenticated
  using (user_id = auth.uid() and public.pledge_open(post_id));

-- Beloppet går bara att ändra medan insamlingen pågår; när den genomförs går bara "betalt" att bocka i.
create or replace function public.guard_pledge() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.amount is distinct from old.amount then
    if not public.pledge_open(new.post_id) then raise exception 'Insamlingen tar inte emot ändringar längre.'; end if;
    new.updated_at := now();
  end if;
  if new.paid_at is distinct from old.paid_at
     and not exists (select 1 from posts where id = new.post_id and pledge_state = 'collect') then
    raise exception 'Insamlingen är inte genomförd än – betala först när den är det.';
  end if;
  return new;
end $$;
drop trigger if exists pledges_guard on public.pledges;
create trigger pledges_guard before update on public.pledges for each row execute function public.guard_pledge();

-- Summa och antal på inlägget, plus en notis till den som samlar in.
create or replace function public.sum_pledges() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_post uuid := coalesce(new.post_id, old.post_id); v_author uuid;
begin
  perform set_config('app.pledges', '1', true);
  update posts set pledged_total = coalesce((select sum(amount) from pledges where post_id = v_post), 0),
    pledgers = (select count(*) from pledges where post_id = v_post) where id = v_post returning author_id into v_author;
  if tg_op = 'INSERT' and v_author is not null and v_author <> new.user_id then
    insert into notifications (user_id, kind, actor_id, post_id, body)
    values (v_author, 'pledge', new.user_id, v_post, 'stöttar din insamling med ' || to_char(new.amount, 'FM999G999G999') || ' kr');
  end if;
  return null;
end $$;
drop trigger if exists pledges_sum on public.pledges;
create trigger pledges_sum after insert or update of amount or delete on public.pledges for each row execute function public.sum_pledges();

-- Genomför: alla som lovat får en notis och en punkt i checklistan.
create or replace function public.collect_pledges(p uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v posts%rowtype;
begin
  perform set_config('app.pledges', '1', true);
  update posts set pledge_state = 'collect' where id = p and pledge_state is null returning * into v;
  if v.id is null then return; end if;
  insert into notifications (user_id, kind, actor_id, post_id, body)
  select user_id, 'pledge', v.author_id, p, 'Insamlingen genomförs – swisha ' || to_char(amount, 'FM999G999G999') || ' kr. Du hittar uppgifterna i checklistan.'
  from pledges where post_id = p;
end $$;
revoke execute on function public.collect_pledges(uuid) from public, anon, authenticated;

-- Den som lagt upp bestämmer vad som händer efter sista dagen: 'collect' (samla in ändå), 'extend' (ny sista dag) eller 'cancel'.
create or replace function public.decide_pledges(p_post uuid, p_decision text, p_deadline date default null) returns void
language plpgsql security definer set search_path = public as $$
declare v posts%rowtype;
begin
  select * into v from posts where id = p_post;
  if v.id is null or v.author_id <> auth.uid() then raise exception 'Bara den som lagt upp insamlingen kan bestämma.'; end if;
  if v.pledge_state is not null then raise exception 'Insamlingen är redan avgjord.'; end if;
  perform set_config('app.pledges', '1', true);
  if p_decision = 'collect' then
    if v.pledgers = 0 then raise exception 'Ingen har lovat något än.'; end if;
    perform public.collect_pledges(p_post);
  elsif p_decision = 'extend' then
    if p_deadline is null or p_deadline < (now() at time zone 'Europe/Stockholm')::date then raise exception 'Välj en ny sista dag, idag eller senare.'; end if;
    update posts set deadline = p_deadline, deadline_noticed = null where id = p_post;
    insert into notifications (user_id, kind, actor_id, post_id, body)
    select user_id, 'pledge', v.author_id, p_post, 'förlängde insamlingen till ' || to_char(p_deadline, 'YYYY-MM-DD') || ' – ditt löfte står kvar'
    from pledges where post_id = p_post;
  elsif p_decision = 'cancel' then
    update posts set pledge_state = 'cancelled' where id = p_post;
    insert into notifications (user_id, kind, actor_id, post_id, body)
    select user_id, 'pledge', v.author_id, p_post, 'avbröt insamlingen – du behöver inte betala något'
    from pledges where post_id = p_post;
  else raise exception 'Okänt beslut.'; end if;
end $$;
grant execute on function public.decide_pledges(uuid, text, date) to authenticated;

-- Varje timme: insamlingar vars sista dag passerat. Nått målet → genomförs. Annars en notis (en gång) om att välja nästa steg.
create or replace function public.settle_pledges() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; today date := (now() at time zone 'Europe/Stockholm')::date;
begin
  perform set_config('app.pledges', '1', true);
  for r in select * from posts where kind = 'finansiering' and stance = 'behovs' and pledge_state is null
           and deadline is not null and deadline < today loop
    if r.amount is not null and r.pledged_total >= r.amount then
      perform public.collect_pledges(r.id); n := n + 1;
    elsif r.deadline_noticed is distinct from r.deadline then
      update posts set deadline_noticed = r.deadline where id = r.id;
      insert into notifications (user_id, kind, post_id, body)
      values (r.author_id, 'pledge', r.id, 'Tiden för din insamling är ute: ' || to_char(r.pledged_total, 'FM999G999G999') || ' kr av '
        || coalesce(to_char(r.amount, 'FM999G999G999'), '?') || ' kr. Välj om ni samlar in ändå, förlänger eller avbryter.');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.settle_pledges() from public, anon;
grant execute on function public.settle_pledges() to authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('insamlingar', '7 * * * *', 'select public.settle_pledges()');
  end if;
end $$;

select (select count(*) from public.pledges) as loften,
       (select count(*) from cron.job where jobname = 'insamlingar') as cron_jobb;
