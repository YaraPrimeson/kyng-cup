alter table public.tournament_registrations
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_term text,
  add column if not exists utm_content text,
  add column if not exists landing_page text,
  add column if not exists referrer text;

alter table public.tournament_registrations
  add constraint tournament_registrations_utm_source_length check (utm_source is null or char_length(utm_source) <= 255),
  add constraint tournament_registrations_utm_medium_length check (utm_medium is null or char_length(utm_medium) <= 255),
  add constraint tournament_registrations_utm_campaign_length check (utm_campaign is null or char_length(utm_campaign) <= 255),
  add constraint tournament_registrations_utm_term_length check (utm_term is null or char_length(utm_term) <= 255),
  add constraint tournament_registrations_utm_content_length check (utm_content is null or char_length(utm_content) <= 255),
  add constraint tournament_registrations_landing_page_length check (landing_page is null or char_length(landing_page) <= 2048),
  add constraint tournament_registrations_referrer_length check (referrer is null or char_length(referrer) <= 2048);

grant insert (
  utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_page, referrer
) on public.tournament_registrations to anon, authenticated;
