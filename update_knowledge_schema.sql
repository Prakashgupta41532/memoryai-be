-- Update knowledge schema to add new fields

-- Add new columns to document_knowledge table
ALTER TABLE document_knowledge 
ADD COLUMN IF NOT EXISTS components JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS technologies JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS key_points JSONB DEFAULT '[]'::jsonb;

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS idx_document_knowledge_components ON document_knowledge USING GIN(components);
CREATE INDEX IF NOT EXISTS idx_document_knowledge_technologies ON document_knowledge USING GIN(technologies);
CREATE INDEX IF NOT EXISTS idx_document_knowledge_key_points ON document_knowledge USING GIN(key_points);

-- Remove old concepts and relationships columns if they exist
ALTER TABLE document_knowledge DROP COLUMN IF EXISTS concepts;
ALTER TABLE document_knowledge DROP COLUMN IF EXISTS relationships;

-- Remove old indexes
DROP INDEX IF EXISTS idx_document_knowledge_concepts;
DROP INDEX IF EXISTS idx_document_knowledge_relationships;
