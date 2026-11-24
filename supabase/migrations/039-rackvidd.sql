-- 039: Hur långt ut ett inlägg når. Utan värde syns det där det hör hemma (gruppens stadsdel eller stad) och uppåt.
-- Med t.ex. 'region' syns det också i alla städer och stadsdelar i regionen, och med 'country' i hela landet.
alter table public.posts add column if not exists reach text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'posts_reach_check') then
    alter table public.posts add constraint posts_reach_check check (reach is null or reach in ('district', 'city', 'region', 'country'));
  end if;
end $$;
select count(*) as inlagg from public.posts;
