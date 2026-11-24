-- 033: De hämtade grupperna från byggemenskaper.se som ingen använt tas bort.
-- Kvar blir de som har medlemmar eller inlägg (Tinyhusbåten Anna och Egnahem för Alla).
delete from public.groups g
where g.imported_from = 'byggemenskaper.se'
  and not g.locked
  and not exists (select 1 from public.group_members m where m.group_id = g.id)
  and not exists (select 1 from public.posts p where p.group_id = g.id);

select (select count(*) from public.groups where imported_from = 'byggemenskaper.se') as hamtade_kvar,
       (select string_agg(name, ', ') from public.groups where imported_from = 'byggemenskaper.se') as vilka,
       (select count(*) from public.groups) as grupper_totalt;
