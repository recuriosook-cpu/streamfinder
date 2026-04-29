-- Run this in Supabase Dashboard → SQL Editor BEFORE running populate-lists.js
-- It adds a temporary policy that lets the anon key insert into list_items.

CREATE POLICY "temp_seed_anon_insert" ON list_items
  FOR INSERT TO anon
  WITH CHECK (true);

-- After the script finishes, run this to remove it:
-- DROP POLICY "temp_seed_anon_insert" ON list_items;
