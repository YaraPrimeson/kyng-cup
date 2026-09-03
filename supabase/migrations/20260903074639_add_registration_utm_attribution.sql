alter table public.tournament_registrations
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_term text,
  add column if not exists utm_content text;

alter table public.tournament_registrations
  add constraint tournament_registrations_utm_source_length_check
    check (utm_source is null or char_length(utm_source) <= 200),
  add constraint tournament_registrations_utm_medium_length_check
    check (utm_medium is null or char_length(utm_medium) <= 200),
  add constraint tournament_registrations_utm_campaign_length_check
    check (utm_campaign is null or char_length(utm_campaign) <= 200),
  add constraint tournament_registrations_utm_term_length_check
    check (utm_term is null or char_length(utm_term) <= 200),
  add constraint tournament_registrations_utm_content_length_check
    check (utm_content is null or char_length(utm_content) <= 200);

grant insert (utm_source, utm_medium, utm_campaign, utm_term, utm_content)
  on public.tournament_registrations to anon, authenticated;
