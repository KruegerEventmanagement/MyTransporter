ALTER TABLE public.user_documents
  ADD COLUMN IF NOT EXISTS ai_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_document_class text,
  ADD COLUMN IF NOT EXISTS ai_extracted_name text,
  ADD COLUMN IF NOT EXISTS ai_reason text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;