-- 040: Redaktionen kan också verifiera medlemmar i en grupp (inte bara gruppens admins).
-- Sjöbergens plats rättas: Otterklintsvägen ligger i Sanna/Sjöbergen (414 47), inte i Hagen (426 71).
create or replace function public.set_member_verified(p_group uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare gname text;
begin
  if not (public.is_admin(p_group) or public.is_editor()) then raise exception 'Bara gruppens admins och Redaktionen kan verifiera medlemmar.'; end if;
  select name into gname from groups where id = p_group;
  update group_members set verified = p_on, verified_by = case when p_on then auth.uid() end where group_id = p_group and user_id = p_user;
  if not found then raise exception 'Personen är inte med i gruppen.'; end if;
  if p_on and p_user <> auth.uid() then
    insert into notifications (user_id, kind, actor_id, group_id, body) values (p_user, 'admin', auth.uid(), p_group, 'verifierade dig som medlem i ' || gname);
  end if;
end $$;

create or replace function public.guard_member_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from groups g where g.id = new.group_id and g.locked) then new.verified := true; return new; end if;
  if auth.uid() is null then return new; end if;
  if new.verified and (tg_op = 'INSERT' or not old.verified) and not (public.is_admin(new.group_id) or public.is_editor()) then
    new.verified := false; new.verified_by := null;
  end if;
  return new;
end $$;

update public.groups set postcode = '414 47', address = 'Otterklintsvägen, 414 47 Göteborg', lat = 57.68523, lng = 11.90017
where name = 'Sjöbergen' and postcode = '426 71';
update public.posts p set event_postcode = '414 47'
from public.groups g where p.group_id = g.id and g.name = 'Sjöbergen' and p.event_postcode = '426 71';

select (select postcode || ' ' || lat || ',' || lng from public.groups where name = 'Sjöbergen') as sjobergen,
       (select count(*) from public.posts p join public.groups g on g.id = p.group_id where g.name = 'Sjöbergen' and p.event_postcode = '414 47') as evenemang_rattade;
