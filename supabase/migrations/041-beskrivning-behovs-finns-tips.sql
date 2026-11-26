-- 041: Beskrivning på profilen, och ett enklare sätt för finansiering och resurser.
-- * profiles.bio: en kort text om en själv.
-- * posts.stance: 'behovs' (något behövs), 'finns' (något finns att få/låna) eller 'tips' (bara finansiering).
-- * posts.amount och posts.deadline: valfritt belopp och sista dag – resten sköts i kommentarerna.
-- * De gamla finansieringsinläggen (med ansökningar och utbetalningar i appen) tas bort.
alter table public.profiles add column if not exists bio text check (bio is null or char_length(bio) <= 600);
alter table public.posts add column if not exists stance text;
alter table public.posts add column if not exists amount numeric check (amount is null or amount >= 0);
alter table public.posts add column if not exists deadline date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'posts_stance_check') then
    alter table public.posts add constraint posts_stance_check check (stance is null or stance in ('behovs', 'finns', 'tips'));
  end if;
end $$;
update public.posts set stance = 'finns' where kind = 'lokal' and stance is null;

delete from public.posts where kind = 'finansiering' or fin_total is not null;

select (select count(*) from public.posts where kind = 'finansiering' or fin_total is not null) as finansiering_kvar,
       (select count(*) from public.posts where kind = 'lokal') as resurser;
