import { createClient } from "@supabase/supabase-js";

// Publishable browser credentials. Database writes are protected by Supabase RLS.
export const supabase = createClient(
  "https://omkytvxgjhdjfglnarfe.supabase.co",
  "sb_publishable_UWUPO6sWX6KD3BtwMetz2A_0LKuI4b7",
);
