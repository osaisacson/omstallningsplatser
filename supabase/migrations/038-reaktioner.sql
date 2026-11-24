-- 038: Reagera med en emoji på meddelanden – både mellan två personer och i samtal med flera eller hela grupper.
-- Bara de som ser meddelandet ser reaktionerna och kan reagera.
create table if not exists public.dm_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create table if not exists public.chat_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
alter table public.dm_reactions enable row level security;
alter table public.chat_reactions enable row level security;

create or replace function public.sees_dm(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from messages where id = m and auth.uid() in (from_id, to_id));
$$;
create or replace function public.sees_chat_message(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from chat_messages x where x.id = m and public.in_chat(x.chat_id));
$$;

drop policy if exists "reaktioner syns" on public.dm_reactions;
create policy "reaktioner syns" on public.dm_reactions for select to authenticated using (public.sees_dm(message_id));
drop policy if exists "reagera själv" on public.dm_reactions;
create policy "reagera själv" on public.dm_reactions for insert to authenticated with check (user_id = auth.uid() and public.sees_dm(message_id));
drop policy if exists "ta bort egen reaktion" on public.dm_reactions;
create policy "ta bort egen reaktion" on public.dm_reactions for delete to authenticated using (user_id = auth.uid());

drop policy if exists "reaktioner syns" on public.chat_reactions;
create policy "reaktioner syns" on public.chat_reactions for select to authenticated using (public.sees_chat_message(message_id));
drop policy if exists "reagera själv" on public.chat_reactions;
create policy "reagera själv" on public.chat_reactions for insert to authenticated with check (user_id = auth.uid() and public.sees_chat_message(message_id));
drop policy if exists "ta bort egen reaktion" on public.chat_reactions;
create policy "ta bort egen reaktion" on public.chat_reactions for delete to authenticated using (user_id = auth.uid());

select (select count(*) from public.dm_reactions) as dm, (select count(*) from public.chat_reactions) as samtal;
