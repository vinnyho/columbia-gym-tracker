CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  hours_label TEXT NOT NULL,
  timezone TEXT NOT NULL,
  source_url TEXT
);

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL REFERENCES facilities(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  note TEXT NOT NULL,
  calendar_url TEXT
);

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  activity TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS equipment (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL REFERENCES facilities(id),
  name TEXT NOT NULL,
  floor INTEGER NOT NULL,
  zone TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'limited', 'broken')),
  summary TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('equipment', 'space')),
  target_id TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reports ADD COLUMN IF NOT EXISTS photo_url TEXT;

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_votes (
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  value TEXT NOT NULL CHECK (value IN ('confirm', 'dispute')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, author_name)
);

CREATE OR REPLACE FUNCTION public.hook_require_columbia_email(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  email TEXT;
BEGIN
  email := lower(event->'user'->>'email');

  IF email LIKE '%@columbia.edu' THEN
    RETURN '{}'::JSONB;
  END IF;

  RETURN jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'Use a Columbia email address to sign up.',
      'http_code', 403
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hook_require_columbia_email TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.hook_require_columbia_email FROM authenticated, anon, public;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-photos',
  'report-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'report_photos_public_read'
  ) THEN
    CREATE POLICY report_photos_public_read
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'report-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'report_photos_authenticated_upload'
  ) THEN
    CREATE POLICY report_photos_authenticated_upload
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'report-photos');
  END IF;
END;
$$;
