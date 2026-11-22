-- 020: Alla platser där det finns något i appen – grupper, evenemang och personer – på alla nivåer.
-- Platsväljaren visar bara dessa. Bara platserna lämnas ut, aldrig vem som finns där.
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
select count(*) as platser from public.content_places();
