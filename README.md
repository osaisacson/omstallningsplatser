# Omställningsplatser

En app för grupper som arbetar med småskaliga omställningar av vatten, avfall, energi, ekonomi med mera.
Inlägg hör till grupper. Inlägg kan vara vanliga inlägg (med ämnen), **lokaler** att låna eller hyra, eller
**finansiering** som andra grupper kan söka i kommentarerna.

- Ingen byggprocess – vanliga filer (HTML, CSS, JavaScript med [Preact](https://preactjs.com) + htm från CDN).
- Backend: [Supabase](https://supabase.com) (gratisnivån räcker). Utan Supabase körs appen i **demoläge** där allt sparas i webbläsaren.
- Allt i appen är på svenska.

## Kör lokalt (demoläge)

```bash
python3 -m http.server 5173
```

Öppna http://localhost:5173. Lägg till `?demo` i adressen för att prova demoläget även när Supabase är inkopplat. Skapa ett konto (det stannar i din webbläsare). Exempelgrupper och inlägg finns redan.
Knappen **Återställ** överst i flödet tömmer demodatan.

## Koppla in en riktig, gratis backend (Supabase) – ca 10 minuter

1. Skapa ett konto och ett nytt projekt på [supabase.com](https://supabase.com) (välj region EU, t.ex. Stockholm/Frankfurt).
2. Gå till **SQL Editor → New query**, klistra in hela [`supabase/setup.sql`](supabase/setup.sql) och tryck **Run**.
3. Vill du ha exempeldata: kör [`supabase/seed.sql`](supabase/seed.sql) på samma sätt.
4. Gå till **Project Settings → API**. Kopiera *Project URL* och *anon public key* till [`js/config.js`](js/config.js).
5. Enklast registrering: **Authentication → Sign In / Providers → Email** och stäng av *Confirm email*.
   (Låter du det vara på får nya användare ett bekräftelsemejl först.)
6. Har du en databas från en tidigare version? Kör filerna i [`supabase/migrations/`](supabase/migrations) i nummerordning.
7. Valfritt: aktivera tillägget `pg_cron` under **Database → Extensions** och kör [`supabase/cron.sql`](supabase/cron.sql)
   så kontrolleras inaktiva admins varje natt.

Anon-nyckeln är tänkt att synas i webbläsaren – vem som får göra vad styrs av reglerna (Row Level Security) i `setup.sql`.
Gratisnivån pausar projektet efter en vecka utan användning; det startas igen med ett klick i Supabase.

## Serverfunktioner (kalender och push)

Koden ligger i [`supabase/functions/`](supabase/functions). Skapa två Edge Functions i Supabase (Edge Functions → Deploy a new function → Via Editor) med namnen `kalender` och `push`, klistra in koden och stäng av **Verify JWT** för båda.
För push behövs ett nyckelpar (VAPID). Den publika nyckeln läggs i `js/config.js`; båda läggs i tabellen `app_settings`:

```sql
insert into public.app_settings (key, value) values
  ('vapid_public', '<publik nyckel>'), ('vapid_private', '<privat nyckel>'),
  ('vapid_subject', 'mailto:<er e-post>'),
  ('push_url', 'https://<projekt>.supabase.co/functions/v1/push'),
  ('push_secret', gen_random_uuid()::text);
```

Ett nyckelpar skapas t.ex. med `npx web-push generate-vapid-keys`. Lägg aldrig den privata nyckeln i koden.


### Mejl (via Gmail)

Mejlen i tabellen `email_outbox` (t.ex. till admins som inte loggat in på ett år) skickas av funktionen `mejl`
via omstallningsplatser@gmail.com. Skapa den som de andra (namn `mejl`, **Verify JWT** av) och gör sedan så här:

1. Slå på tvåstegsverifiering på Gmail-kontot och skapa ett **applösenord** på myaccount.google.com/apppasswords.
2. Supabase → **Edge Functions → Secrets**: lägg till `GMAIL_USER` = `omstallningsplatser@gmail.com` och `GMAIL_APP_PASSWORD` = applösenordet.
3. Samma applösenord kan användas för inloggningsmejlen: **Authentication → Emails → SMTP Settings**
   (host `smtp.gmail.com`, port `465`, användare = Gmail-adressen).

Nya mejl skickas direkt. Med `pg_cron` påslaget försöks misslyckade mejl igen varje timme (se `cron.sql`).

## Publicera

Det är bara statiska filer, så vilken gratis webbhost som helst fungerar: GitHub Pages, Netlify eller Cloudflare Pages.
Lägg upp hela mappen. I Supabase, lägg till adressen under **Authentication → URL Configuration → Site URL**.

## Hur det fungerar

| Funktion | Regel |
|---|---|
| Grupper | Alla kan gå med. Den som skapar en grupp blir admin och kan utse fler admins och ta bort medlemmar. |
| Höjdpunkter | Alla medlemmar kan skapa och redigera gruppens höjdpunkter. |
| Inlägg | Bara medlemmar kan posta i en grupp. Inlägg utan grupp går att göra men användaren knuffas mot grupper. Den som postat kan alltid redigera/ta bort; andra kan *be om* ändring eller borttagning (blir ett meddelande). Gruppadmins kan ta bort inlägg i sin grupp. |
| Aktivitet | Nytt inlägg eller ny kommentar flyttar gruppen först i raden högst upp. |
| Plats | Grupper anger land, region och stad. Överst i appen väljer man om flödet ska visa en stad, en region, ett land eller hela världen. Standard är staden där de flesta av ens grupper finns. |
| Flikar | **Flöde** (allt), **Finansiering** (med summan som går att söka just nu) **Lokaler** (skriv i fälten för användningsområde och kostnad för att filtrera) och **Minne**. Plustecknet vid varje flik skapar ett inlägg av den typen; plustecknet i menyn längst ner låter en välja typ. |
| Evenemang | Ett inlägg kan markeras som evenemang med datum, tid, plats (adress ur adresslista) och anmälan (Intresserad/Kommer). Kalendern (ikonen längst ner) visar kommande evenemang per stad/region/land och postnummer. "Lägg till i min kalender" ger en kalenderfil som uppdaterar händelsen om den läggs till igen. |
| Karta | Kartikonen bredvid platsen visar grupperna på OpenStreetMap, inzoomat på vald stad, region eller land. Adresser väljs ur en riktig adresslista (Photon/OpenStreetMap). |
| Notiser | På sin profil kan man slå på notiser (push) om nya meddelanden och ansökningar. Siffran på appikonen uppdateras även när appen är stängd. Kräver serverfunktionen `push` och nycklar i tabellen `app_settings` (se nedan). |
| Kalenderprenumeration | I kalendern finns en personlig länk som telefonens kalender hämtar regelbundet: evenemang man är intresserad av, kommer på eller lagt upp uppdateras automatiskt. Serverfunktionen `kalender`. |
| Minne | Längst ner till höger i varje inlägg finns en knapp för att spara det i långtidsminnet; siffran visar hur många som gjort det och man kan ta tillbaka sin röst. Fliken **Minne** visar de mest sparade först och går att söka på ämne. |
| Ämnen | Vanliga inlägg kan märkas med ämnen (Energi, Byggmetod, Off-grid …) så att andra hittar dem. Nya ämnen kan skapas. |
| Finansiering | Totalbelopp, *en mottagare* eller *delbelopp*, slutdatum (kan stängas manuellt). Man söker alltid för en grupp man är med i; ansökan visas som gruppens kommentar ("via" personen) med märket **Ansökt**, belopp och swishnummer (bankkonto över 5 000 kr). Utbetalningsuppgiften syns bara för sökande och givare. **Bevilja** → märket blir **Beviljad** och en rad dyker upp i *Att göra* (✓-ikonen uppe till höger). Bockas den av blir märket **Utbetald** och förloppsmätaren fylls. |
| Admin saknas | Lämnar sista admin blir den som varit med längst admin direkt. Har ingen admin loggat in på ett år läggs ett mejl till admins i tabellen `email_outbox`; efter 30 dagar utan reaktion tar den medlem som varit med längst över. |
| Kommentarer | Kan besvaras i trådar, som på Reddit. Den man svarar får en notis. |
| Meddelanden | Medvetet enkla, som tidigt internet. Ingen realtid – sidan hämtar nytt när man öppnar den. |

### Kvar att göra
- **Skicka mejlen** i `email_outbox`. Kräver en e-posttjänst (t.ex. Resend, gratisnivå) och en liten Supabase Edge Function som läser tabellen.
- Fler språk: all text ligger direkt i vyerna; nästa steg är att flytta ut den till en översättningsfil.

## Filer

```
index.html            startsida
css/app.css           all stil (ljust och mörkt läge)
js/config.js          appnamn + Supabase-nycklar
js/app.js             router och bottenmeny
js/views/*.js         skärmarna (flöde, grupper, personer, notiser/meddelanden)
js/ui.js              delade komponenter (inläggskort, karusell, finansieringsruta …)
js/api/supabase.js    riktig backend
js/api/local.js       demoläge i webbläsaren (samma funktioner)
js/seed.js            exempeldata (bilderna kommer från Unsplash, fri licens)
supabase/setup.sql    tabeller, regler och funktioner
supabase/seed.sql     exempeldata (skapas med: node tools/build-seed-sql.mjs)
supabase/reset.sql    tar bort allt (även data) så att setup.sql kan köras om
```

## Licens

[GNU AGPL-3.0](LICENSE). Du får använda, kopiera och ändra koden fritt. Om du kör en ändrad version som en tjänst
för andra måste du också dela med dig av dina ändringar under samma licens – så att förbättringar stannar i det gemensamma.
