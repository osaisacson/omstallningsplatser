-- Tar bort ALLT som setup.sql skapat (inklusive all data!) så att setup.sql kan köras igen.
-- Användarkonton i auth.users ligger kvar; ta bort dem under Authentication → Users om du vill.
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.chat_messages, public.chat_members, public.chats, public.comment_likes, public.post_likes, public.admin_requests, public.memory_themes, public.feedback_comments, public.feedback_votes, public.feedback, public.editor_log, public.reports, public.editors,
  public.email_outbox, public.messages, public.notifications, public.payouts, public.comments,
  public.post_slides, public.posts, public.categories, public.highlights, public.group_members, public.groups, public.home_places, public.profiles cascade;
drop function if exists public.group_places(), public.is_editor(), public.need_editor(), public.on_report(), public.set_report_done(uuid, boolean),
  public.set_editor(uuid, boolean), public.editor_delete(text, uuid), public.revert_log(uuid), public.delete_my_account(), public.set_feedback_status(uuid, text), public.sync_editor_group(), public.add_member(uuid, uuid), public.rename_memory_theme(text, text), public.set_post_theme(uuid, text), public.available_countries(), public.content_places(), public.set_post_themes(uuid, text[]),
  public.accept_editor(boolean), public.request_admin(uuid, text), public.decide_admin_request(uuid, boolean), public.accept_admin_role(uuid), public.begin_visit(), public.can_see_post(uuid[], uuid), public.claim_outbox(int), public.send_outbox(), public.on_outbox(),
  public.on_post_like(), public.guard_group_verified(), public.set_group_verified(uuid, boolean), public.guard_member_verified(), public.set_member_verified(uuid, uuid, boolean),
  public.in_chat(uuid), public.create_chat(text, uuid[]), public.add_chat_members(uuid, uuid[]), public.group_chat(uuid), public.mark_chat_read(uuid), public.set_chat_muted(uuid, boolean),
  public.chats_for(uuid), public.my_chats(), public.chat_unread_for(uuid), public.my_chat_unread(), public.on_chat_message();
drop function if exists public.is_member(uuid), public.is_admin(uuid), public.handle_new_user(), public.on_group_created(),
  public.on_post_created(), public.on_comment_created(), public.ensure_group_admin(), public.on_admin_granted(), public.touch(),
  public.apply_for_funding(uuid, text, numeric, text), public.decide_application(uuid, text), public.mark_paid(uuid),
  public.admin_succession() cascade;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
           and (coalesce(qual, '') like '%media%' or coalesce(with_check, '') like '%media%') loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;
