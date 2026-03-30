-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table
CREATE TABLE public.documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  total_pages INTEGER DEFAULT 1,
  total_chunks INTEGER NOT NULL,
  processed_chunks INTEGER NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id),
  structured_knowledge JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document chunks table
CREATE TABLE public.document_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id TEXT NOT NULL, -- Using TEXT to reference file name
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding JSONB, -- Adjust size based on your embedding model
  -- Alternative: embedding JSONB, -- Use this if vector is not available
  user_id UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_documents_user_id ON public.documents(user_id);
CREATE INDEX idx_documents_created_at ON public.documents(created_at);
CREATE INDEX idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX idx_document_chunks_user_id ON public.document_chunks(user_id);
-- Note: Vector indexes not available for JSONB embeddings
-- For similarity search, you'll need to handle this in application code

-- Enable Row Level Security
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for documents
CREATE POLICY "Users can view own documents" ON public.documents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own documents" ON public.documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents" ON public.documents
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents" ON public.documents
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for document chunks
CREATE POLICY "Users can view own chunks" ON public.document_chunks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own chunks" ON public.document_chunks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chunks" ON public.document_chunks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chunks" ON public.document_chunks
  FOR DELETE USING (auth.uid() = user_id);

-- For now, disable RLS to allow the server to work
ALTER TABLE public.documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks DISABLE ROW LEVEL SECURITY;
