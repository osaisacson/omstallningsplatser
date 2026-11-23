-- 031: Vem ser inlägget? Som standard alla. Den som postar kan välja att bara vissa grupper ser det
-- (visible_to = gruppernas id). Författaren och Redaktionen ser alltid inlägget.
alter table public.posts add column if not exists visible_to uuid[];

create or replace function public.can_see_post(p_visible uuid[], p_author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_visible is null or cardinality(p_visible) = 0 or p_author = auth.uid() or public.is_editor()
    or exists (select 1 from group_members where user_id = auth.uid() and group_id = any(p_visible));
$$;

drop policy if exists "inlägg syns" on public.posts;
create policy "inlägg syns" on public.posts for select to authenticated using (public.can_see_post(visible_to, author_id));

-- Bilder och kommentarer följer inlägget.
drop policy if exists "bilder syns" on public.post_slides;
create policy "bilder syns" on public.post_slides for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "kommentarer syns" on public.comments;
create policy "kommentarer syns" on public.comments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

select count(*) filter (where visible_to is not null) as begransade, count(*) as inlagg from public.posts;
