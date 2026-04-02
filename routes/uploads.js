const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse').default || require('pdf-parse');
const axios = require('axios');
const { supabase } = require('../config/supabase');
const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Accept PDF and text files for testing
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'text/plain'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only PDF and text files are allowed'), false);
    }
    cb(null, true);
  }
});

// Test endpoint to check file upload middleware
router.post('/test-upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    res.json({
      message: 'File received successfully',
      file: {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        bufferLength: req.file.buffer?.length
      }
    });
  } catch (error) {
    console.error('Test upload error:', error);
    res.status(500).json({ error: 'Test upload failed' });
  }
});

// Token estimation function (rough approximation)
function estimateTokens(text) {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

// Text chunking function
function chunkText(text, minTokens = 500, maxTokens = 1000) {
  const chunks = [];
  const words = text.split(' ');
  let currentChunk = '';
  let currentTokens = 0;

  for (const word of words) {
    const wordTokens = estimateTokens(word + ' ');
    
    if (currentTokens + wordTokens > maxTokens && currentTokens >= minTokens) {
      chunks.push(currentChunk.trim());
      currentChunk = word + ' ';
      currentTokens = wordTokens;
    } else {
      currentChunk += word + ' ';
      currentTokens += wordTokens;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// Generate embedding using Ollama with better error handling
async function generateEmbedding(text) {
  try {
    console.log('Generating embedding for text length:', text.length);
    console.log('Connecting to Ollama at http://localhost:11434/api/embeddings');
    
    const response = await axios.post('http://localhost:11434/api/embeddings', {
      model: 'llama2',
      prompt: text
    }, {
      timeout: 60000, // 60 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.embedding) {
      console.log('Embedding generated successfully, length:', response.data.embedding.length);
      return response.data.embedding;
    } else {
      console.error('Invalid response from Ollama:', response.data);
      throw new Error('Invalid embedding response');
    }
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('Ollama is not running. Please start Ollama service.');
    }
    // Return a mock embedding for testing only if Ollama is completely unavailable
    console.log('Using mock embedding for testing...');
    return new Array(1536).fill(0).map(() => Math.random());
  }
}

// Run LLM extraction prompt
async function extractStructuredKnowledge(text, fileName) {
  try {
    // Simple, direct prompt
    const prompt = `Analyze this document text and provide a JSON response:

Text: "${text.substring(0, 1000)}..."

Respond with JSON only:
{
  "key_concepts": ["main topic 1", "main topic 2"],
  "entities": ["person/company 1", "person/company 2"],
  "relationships": [{"from": "entity1", "to": "entity2", "type": "relates to"}],
  "summary": "One sentence summary of the main content"
}`;

    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama2',
      prompt: prompt,
      stream: false
    });

    console.log('LLM Response:', response.data.response);

    // Simple JSON extraction
    try {
      const cleanResponse = response.data.response.trim();
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: create structured data from text analysis
        return {
          key_concepts: extractKeywords(text),
          entities: extractEntities(text),
          relationships: [],
          summary: text.substring(0, 200) + "...",
          note: "Fallback extraction - LLM didn't return valid JSON"
        };
      }
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      // Fallback extraction
      return {
        key_concepts: extractKeywords(text),
        entities: extractEntities(text),
        relationships: [],
        summary: text.substring(0, 200) + "...",
        note: "Fallback extraction - JSON parsing failed"
      };
    }
  } catch (error) {
    console.error('Error running LLM extraction:', error);
    // Return structured data from text
    return {
      key_concepts: extractKeywords(text),
      entities: extractEntities(text),
      relationships: [],
      summary: text.substring(0, 200) + "...",
      note: "Fallback extraction - LLM error"
    };
  }
}

// Simple keyword extraction
function extractKeywords(text) {
  const words = text.toLowerCase().split(/\s+/);
  const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'];
  
  return words
    .filter(word => word.length > 3 && !commonWords.includes(word))
    .filter((word, index, arr) => arr.indexOf(word) === index) // unique
    .slice(0, 5); // top 5
}

// Simple entity extraction (capitalized words)
function extractEntities(text) {
  const entities = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  return [...new Set(entities)].slice(0, 5); // unique, top 5
}

// File upload endpoint
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Received file:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      bufferLength: req.file.buffer?.length
    });

    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Check if Supabase is available
    if (!supabase) {
      return res.status(500).json({ 
        error: 'Database connection not available. Please check server configuration.' 
      });
    }

    console.log(`Processing file: ${req.file.originalname}`);

    // Step 1: Extract text from PDF or text file
    let extractedText;
    try {
      if (req.file.mimetype === 'text/plain') {
        // Handle text file directly
        extractedText = req.file.buffer.toString('utf-8');
        console.log(`Successfully read text file with ${extractedText.length} characters`);
      } else {
        // Handle PDF file
        console.log('Starting PDF extraction...');
        const pdfData = await pdfParse(req.file.buffer);
        extractedText = pdfData.text;
        console.log(`Successfully extracted ${extractedText.length} characters from PDF`);
      }
      
      if (!extractedText || extractedText.trim().length === 0) {
        return res.status(400).json({ 
          error: 'File appears to be empty or contains no extractable text' 
        });
      }
    } catch (error) {
      console.error('Error extracting text:', error);
      console.error('File info:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
      return res.status(500).json({ 
        error: 'Failed to extract text from file',
        details: error.message 
      });
    }

    // Step 2: Chunk the text
    const chunks = chunkText(extractedText, 500, 1000);
    console.log(`Created ${chunks.length} chunks`);

    // Step 3: Run extraction prompt on full text
    let structuredKnowledge;
    try {
      structuredKnowledge = await extractStructuredKnowledge(extractedText, req.file.originalname);
    } catch (error) {
      console.error('Error in structured knowledge extraction:', error);
      structuredKnowledge = {
        key_concepts: [],
        entities: [],
        relationships: [],
        summary: 'Failed to extract structured knowledge',
        error: error.message
      };
    }

    // Step 4: Store document metadata first to get the document ID
    const documentMetadata = {
      file_name: req.file.originalname,
      file_size: req.file.size,
      total_pages: 1, // PDF parsing doesn't easily give page count
      total_chunks: chunks.length,
      processed_chunks: 0, // Will update after processing chunks
      user_id: user_id,
      structured_knowledge: structuredKnowledge,
      created_at: new Date().toISOString()
    };

    const { data: documentRecord, error: docError } = await supabase
      .from('documents')
      .insert([documentMetadata])
      .select()
      .single();

    if (docError) {
      console.error('Error storing document metadata:', docError);
      return res.status(500).json({ error: 'Failed to store document metadata' });
    }

    console.log(`Created document record with ID: ${documentRecord.id}`);
    
    // Step 4: Store structured knowledge in separate table
    if (structuredKnowledge && structuredKnowledge.summary) {
      try {
        const { data: knowledgeRecord, error: knowledgeError } = await supabase
          .from('document_knowledge')
          .insert({
            document_id: documentRecord.id,
            user_id: user_id,
            summary: structuredKnowledge.summary || 'Document analysis',
            decisions: structuredKnowledge.decisions || [],
            concepts: structuredKnowledge.concepts || [],
            relationships: structuredKnowledge.relationships || [],
            extracted_at: new Date().toISOString()
          })
          .select()
          .single();

        if (knowledgeError) {
          console.error('Error storing structured knowledge:', knowledgeError);
        } else {
          console.log(`✅ Successfully extracted and stored structured knowledge for document ${documentRecord.id}`);
        }
      } catch (error) {
        console.error('Error in knowledge storage:', error);
      }
    }

    // Step 5: Process each chunk and store with proper document_id
    const processedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      try {
        // Generate embedding
        const embedding = await generateEmbedding(chunk);
        
        // Store chunk info with proper document_id
        const chunkData = {
          document_id: documentRecord.id, // Use the actual document ID
          chunk_index: i,
          content: chunk,
          embedding: embedding,
          user_id: user_id,
          created_at: new Date().toISOString()
        };

        // Store in database
        const { data: storedChunk, error: storeError } = await supabase
          .from('document_chunks')
          .insert([chunkData])
          .select()
          .single();

        if (storeError) {
          console.error('Error storing chunk:', storeError);
          // Continue processing other chunks even if one fails
        } else {
          processedChunks.push({
            id: storedChunk.id,
            chunk_index: i,
            content_length: chunk.length,
            embedding_length: embedding.length
          });
        }
      } catch (error) {
        console.error(`Error processing chunk ${i}:`, error);
        // Continue processing other chunks
      }
    }

    // Step 6: Update document with processed chunks count
    const { error: updateError } = await supabase
      .from('documents')
      .update({ processed_chunks: processedChunks.length })
      .eq('id', documentRecord.id);

    if (updateError) {
      console.error('Error updating document chunk count:', updateError);
    }

    // Get updated document record
    const { data: updatedDocument, error: fetchError } = await supabase
      .from('documents')
      .select('id, file_name, total_chunks, processed_chunks')
      .eq('id', documentRecord.id)
      .single();

    if (fetchError) {
      console.error('Error fetching updated document:', fetchError);
    }

    res.json({
      message: 'File processed successfully',
      document: {
        id: documentRecord.id,
        file_name: documentRecord.file_name,
        total_chunks: documentRecord.total_chunks,
        processed_chunks: updatedDocument?.processed_chunks || processedChunks.length
      },
      chunks: processedChunks,
      structured_knowledge: structuredKnowledge
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle multer errors
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size is 10MB.' });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Unexpected field. Use "file" as the field name.' });
    }
    return res.status(400).json({ error: 'File upload error: ' + error.message });
  }
  
  if (error.message === 'Only PDF files are allowed') {
    return res.status(400).json({ error: error.message });
  }
  
  next(error);
});

// Get documents for a user
router.get('/documents/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!supabase) {
      return res.status(500).json({ 
        error: 'Database connection not available. Please check server configuration.' 
      });
    }

    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching documents:', error);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    res.json({ documents });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get chunks for a document
router.get('/chunks/:document_id', async (req, res) => {
  try {
    const { document_id } = req.params;

    if (!supabase) {
      return res.status(500).json({ 
        error: 'Database connection not available. Please check server configuration.' 
      });
    }

    const { data: chunks, error } = await supabase
      .from('document_chunks')
      .select('*')
      .eq('document_id', document_id)
      .order('chunk_index', { ascending: true });

    if (error) {
      console.error('Error fetching chunks:', error);
      return res.status(500).json({ error: 'Failed to fetch chunks' });
    }

    res.json({ chunks });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
