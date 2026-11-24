-- 036: Omnämnanden. @[Namn](id) i ett inlägg eller en kommentar ger personen en notis.
-- Bara den som får se inlägget får notisen, och ett inlägg som redigeras ger ingen ny notis till samma person.
create or replace function public.notify_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_text text; v_post uuid; v_author uuid; v_what text; v_vis uuid[]; u uuid;
begin
  if tg_table_name = 'posts' then
    if tg_op = 'UPDATE' and new.caption is not distinct from old.caption then return new; end if;
    v_text := new.caption; v_post := new.id; v_author := new.author_id; v_vis := new.visible_to; v_what := 'nämnde dig i ett inlägg';
  else
    v_text := new.body; v_post := new.post_id; v_author := new.author_id; v_what := 'nämnde dig i en kommentar';
    select visible_to into v_vis from posts where id = new.post_id;
  end if;
  for u in select distinct r[1]::uuid from regexp_matches(coalesce(v_text, ''), '@\[[^\]\n]{1,80}\]\(([0-9a-f-]{36})\)', 'g') as r loop
    continue when u = v_author or not exists (select 1 from profiles where id = u);
    continue when v_vis is not null and cardinality(v_vis) > 0
      and not exists (select 1 from group_members where user_id = u and group_id = any(v_vis))
      and not exists (select 1 from editors where user_id = u and accepted_at is not null);
    continue when tg_table_name = 'posts' and exists (select 1 from notifications where user_id = u and kind = 'mention' and post_id = v_post and body = v_what);
    insert into notifications (user_id, kind, actor_id, post_id, body) values (u, 'mention', v_author, v_post, v_what);
  end loop;
  return new;
end $$;
drop trigger if exists posts_mentions on public.posts;
create trigger posts_mentions after insert or update of caption on public.posts for each row execute function public.notify_mentions();
drop trigger if exists comments_mentions on public.comments;
create trigger comments_mentions after insert on public.comments for each row execute function public.notify_mentions();

select count(*) as triggers from pg_trigger where tgname in ('posts_mentions', 'comments_mentions');
