-- 030: "Nytt sen sist" följer kontot, inte webbläsaren.
-- Ett besök börjar när man öppnar appen efter mer än 30 minuter borta. Då sparas när man senast var aktiv
-- som prev_visit_at, och det är det som räknas som "sist" (nya inlägg och uppdateringar av appen sen dess).
alter table public.profiles add column if not exists visit_started_at timestamptz;
alter table public.profiles add column if not exists prev_visit_at timestamptz;

create or replace function public.begin_visit() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare p profiles; fresh boolean;
begin
  select * into p from profiles where id = auth.uid();
  if p.id is null then return null; end if;
  fresh := p.visit_started_at is null or p.last_seen_at < now() - interval '30 minutes';
  update profiles set
    prev_visit_at = case when fresh then p.last_seen_at else prev_visit_at end,
    visit_started_at = case when fresh then now() else visit_started_at end,
    last_seen_at = now()
  where id = auth.uid()
  returning prev_visit_at into p.prev_visit_at;
  return p.prev_visit_at;
end $$;

select count(*) as profiler from public.profiles;
