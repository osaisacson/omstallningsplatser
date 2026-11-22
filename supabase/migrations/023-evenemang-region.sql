-- 023: Evenemang vars adress saknar region (eller land) får det från gruppen om det är samma stad,
-- annars från en annan grupp i samma stad. Annars hamnar de inte på regionnivå.
update public.posts p set event_region = g.region
from public.groups g
where p.is_event and p.event_region is null and p.group_id = g.id and g.region is not null
  and (p.event_city is null or lower(p.event_city) = lower(g.city));
update public.posts p set event_region = (select g.region from public.groups g where lower(g.city) = lower(p.event_city) and g.region is not null limit 1)
where p.is_event and p.event_region is null and p.event_city is not null;
update public.posts p set event_country = g.country
from public.groups g where p.is_event and p.event_country is null and p.group_id = g.id;
select count(*) filter (where is_event and event_city is not null and event_region is null) as saknar_region from public.posts;
