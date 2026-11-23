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

-- Adressen till funktionen: samma som push-funktionen, fast mejl i stället för push.
insert into public.app_settings (key, value)
select 'mejl_url', regexp_replace(value, '/push$', '/mejl') from public.app_settings where key = 'push_url'
on conflict (key) do update set value = excluded.value;

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

-- Varje timme: försök igen med det som inte gick iväg (om pg_cron är påslaget).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('mejl-igen', '17 * * * *', 'select public.send_outbox()');
  end if;
end $$;

select (select value from public.app_settings where key = 'mejl_url') as mejl_url,
       (select count(*) from public.email_outbox where sent_at is null) as mejl_i_kon,
       exists (select 1 from pg_extension where extname = 'pg_cron') as pg_cron_pa,
       (select count(*) from pg_extension where extname = 'pg_net') as pg_net_pa;
