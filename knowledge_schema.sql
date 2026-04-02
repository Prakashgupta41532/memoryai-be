-- Knowledge extraction system schema

-- Table for structured knowledge from documents
CREATE TABLE IF NOT EXISTS document_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  summary TEXT,
  decisions JSONB DEFAULT '[]'::jsonb,
  concepts JSONB DEFAULT '[]'::jsonb,
  relationships JSONB DEFAULT '[]'::jsonb,
  extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_knowledge_user_id ON document_knowledge(user_id);
CREATE INDEX IF NOT EXISTS idx_document_knowledge_document_id ON document_knowledge(document_id);
CREATE INDEX IF NOT EXISTS idx_document_knowledge_extracted_at ON document_knowledge(extracted_at);

-- GIN index for JSONB searches
CREATE INDEX IF NOT EXISTS idx_document_knowledge_decisions ON document_knowledge USING GIN(decisions);
CREATE INDEX IF NOT EXISTS idx_document_knowledge_concepts ON document_knowledge USING GIN(concepts);

-- Add user_id to existing documents table if not exists
ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add user_id to existing document_chunks table if not exists  
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Update existing records to have user_id (for migration)
UPDATE documents SET user_id = 'bcc4711b-ae68-4ce5-a0e9-038777deb135' WHERE user_id IS NULL;
UPDATE document_chunks SET user_id = 'bcc4711b-ae68-4ce5-a0e9-038777deb135' WHERE user_id IS NULL;
