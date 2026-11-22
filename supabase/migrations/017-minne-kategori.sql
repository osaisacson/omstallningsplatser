-- 017: När man sparar ett inlägg i Minne väljer man en kategori (eller skapar en ny).
alter table public.memory_votes add column if not exists theme text check (theme is null or length(trim(theme)) between 1 and 40);
select 'klart' as resultat;
