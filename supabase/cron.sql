-- Valfritt: kör admin-kontrollen varje natt kl 03.
-- Aktivera först tillägget pg_cron: Supabase → Database → Extensions → pg_cron.
select cron.schedule('admin-succession', '0 3 * * *', $$select public.admin_succession()$$);
-- Mejl som inte gick iväg försöks igen varje timme.
select cron.schedule('mejl-igen', '17 * * * *', $$select public.send_outbox()$$);
