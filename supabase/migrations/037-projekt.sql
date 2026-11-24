-- 037: Höjdpunkter heter nu Projekt och kan ha en beskrivning (med länkar).
alter table public.highlights add column if not exists description text;
select count(*) as projekt from public.highlights;
