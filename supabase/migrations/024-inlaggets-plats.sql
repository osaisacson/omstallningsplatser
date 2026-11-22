-- 024: Ett inlägg hör till sin grupps plats. Inlägg utan grupp får en egen plats som man anger när man skriver.
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

select count(*) filter (where is_event and event_postcode is null) as evenemang_utan_postnummer from public.posts;
