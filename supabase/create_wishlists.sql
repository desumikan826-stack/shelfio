-- Create wishlists table for Shelfio
-- Run this in the Supabase SQL editor (Project -> SQL) or via psql

CREATE TABLE IF NOT EXISTS public.wishlists (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text,
  author text,
  image text,
  isbn text,
  publisher text,
  publish_date text,
  pages integer,
  price numeric,
  rating integer,
  created_at timestamptz DEFAULT now()
);

-- Recommended: add an index on user_id for faster per-user queries
CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON public.wishlists (user_id);

-- Optional: grant policies if using Row-Level Security (adjust as needed)
-- ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow logged-in users" ON public.wishlists
--   FOR ALL
--   USING (auth.uid() = user_id)
--   WITH CHECK (auth.uid() = user_id);
