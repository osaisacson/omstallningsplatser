-- 028: Grupper, inlägg och platser som har region eller stad men saknar land hör till Sverige
-- (t.ex. Tempo Nordvärmland hamnade under "Andra länder" i platsväljaren).
update public.groups set country = 'Sverige' where coalesce(btrim(country), '') = '' and (region is not null or city is not null);
update public.posts set country = 'Sverige' where group_id is null and coalesce(btrim(country), '') = '' and (region is not null or city is not null);
update public.home_places set country = 'Sverige' where coalesce(btrim(country), '') = '' and (region is not null or city is not null);
select (select count(*) from public.groups where coalesce(btrim(country), '') = '' and region is not null) as grupper_utan_land;
