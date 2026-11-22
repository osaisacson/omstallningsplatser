-- 026: Exempeldatan (från seed.sql) tas bort ur den riktiga appen.
-- Exempelpersoner har id som börjar på a0000000-0000-4000-8000-, exempelgrupper b0000000-0000-4000-8000-.
-- Inläggen tas bort först (med bilder, kommentarer, ansökningar och röster), sedan grupperna och personerna.
delete from public.posts where author_id::text like 'a0000000-0000-4000-8000-%' or group_id::text like 'b0000000-0000-4000-8000-%';
delete from public.groups where id::text like 'b0000000-0000-4000-8000-%';
delete from public.profiles where id::text like 'a0000000-0000-4000-8000-%';
select (select count(*) from public.profiles where id::text like 'a0000000-0000-4000-8000-%') as personer_kvar,
       (select count(*) from public.groups where id::text like 'b0000000-0000-4000-8000-%') as grupper_kvar,
       (select count(*) from public.posts) as inlagg_totalt,
       (select count(*) from public.groups) as grupper_totalt;
