-- 019: Vilka länder som finns i appen: från grupper, evenemang med egen plats och användarnas platser.
-- Bara landets namn lämnas ut (ingen kan se vem som bor var). Finns bara ett land börjar appen där.
create or replace function public.available_countries() returns table (country text)
language sql stable security definer set search_path = public as $$
  select distinct btrim(c) from (
    select country as c from groups
    union select event_country from posts where is_event
    union select country from home_places
  ) x where coalesce(btrim(c), '') <> '' order by 1;
$$;
grant execute on function public.available_countries() to authenticated;
select * from public.available_countries();
