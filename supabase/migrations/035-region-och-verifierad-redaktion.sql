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

select (select count(*) from public.groups where region is null and city is not null) as grupper_utan_region,
       (select string_agg(name || ': ' || coalesce(region, '?'), ', ') from public.groups where name in ('Redaktionen', 'Redaktion', 'Team Lärande Omställningsplatser Göteborg')) as rattade,
       (select verified_at is not null from public.groups where locked limit 1) as redaktion_verifierad,
       (select bool_and(gm.verified) from public.group_members gm join public.groups g on g.id = gm.group_id where g.locked) as alla_medlemmar_verifierade;
