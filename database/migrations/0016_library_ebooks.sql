-- Real digital-resource ("eBook") records for the Library module -- this
-- concept genuinely did not exist anywhere in the schema before (confirmed
-- against the live DB and against mobile's own faculty-library-api.ts,
-- which says so explicitly). Modeled on library_book's own shape.
--
-- No file is ever stored by this app: an eBook here is a real, official
-- external link (publisher site, NCERT/state-board portal, etc.) -- opening
-- one just navigates the reader straight to resource_url, exactly how a
-- real school library's own "eResources" list works. No Storage bucket, no
-- upload, no signed URL.
--
-- Purely additive: one new table, no existing row touched. NOT executed
-- automatically -- run this against Supabase yourself.

CREATE TABLE library_ebook (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text,
  publisher text,
  edition text,
  language text,
  description text,
  category_id uuid REFERENCES library_category(id),
  cover_image_url text,
  resource_url text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status = ANY (ARRAY['ACTIVE', 'WITHDRAWN'])),
  created_by uuid REFERENCES person(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_library_ebook_title ON library_ebook (title);
CREATE INDEX idx_library_ebook_category ON library_ebook (category_id);
CREATE INDEX idx_library_ebook_status ON library_ebook (status);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- (set_updated_at already exists live, used by other tables' own triggers --
-- CREATE OR REPLACE here is a safe no-op if so, and self-contained if this
-- migration somehow runs against an environment that doesn't have it yet.)

CREATE TRIGGER trg_library_ebook_updated BEFORE UPDATE ON library_ebook
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE library_ebook IS
  'Digital library resources students and parents can open through the portal -- each row is a real external link (resource_url), never a file this app stores itself.';
