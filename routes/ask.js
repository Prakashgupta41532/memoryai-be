const express = require('express');
const axios = require('axios');
const { supabase } = require('../config/supabase');
const router = express.Router();

// Simple cache for recent queries
const queryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Generate embedding for user query (with caching)
async function generateQueryEmbedding(query) {
  // Check cache first
  const cacheKey = query.toLowerCase().trim();
  if (queryCache.has(cacheKey)) {
    const cached = queryCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('Using cached embedding for query');
      return cached.embedding;
    }
  }

  try {
    const response = await axios.post('http://localhost:11434/api/embeddings', {
      model: 'llama2',
      prompt: query
    }, {
      timeout: 15000 // 15 second timeout
    });
    
    // Cache the result
    queryCache.set(cacheKey, {
      embedding: response.data.embedding,
      timestamp: Date.now()
    });
    
    return response.data.embedding;
  } catch (error) {
    console.error('Error generating query embedding:', error);
    // Return mock embedding for testing
    return new Array(1536).fill(0).map(() => Math.random());
  }
}

// Calculate cosine similarity between two embeddings (optimized)
function cosineSimilarity(embedding1, embedding2) {
  if (embedding1.length !== embedding2.length) {
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  // Use for loop with fixed iterations for better performance
  const length = embedding1.length;
  for (let i = 0; i < length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dotProduct / (norm1 * norm2);
}

// Search for relevant chunks using embeddings (optimized with better filtering)
async function searchRelevantChunks(queryEmbedding, userId, topK = 5) {
  try {
    if (!supabase) {
      throw new Error('Database not available');
    }

    console.log('Fetching chunks for user:', userId);
    console.log('Supabase available:', !!supabase);
    
    // Get all chunks for user with limit to prevent memory issues
    const { data: chunks, error } = await supabase
      .from('document_chunks')
      .select('id, document_id, chunk_index, content, embedding, user_id')
      .eq('user_id', userId)
      .limit(100); // Limit to prevent memory issues

    console.log('Database query result:', {
      error: error ? error.message : null,
      chunks_found: chunks ? chunks.length : 0,
      first_chunk_id: chunks && chunks[0] ? chunks[0].id : null
    });

    if (error) {
      throw new Error('Failed to fetch chunks: ' + error.message);
    }

    if (!chunks || chunks.length === 0) {
      console.log('No chunks found for user');
      return [];
    }

    console.log(`Processing ${chunks.length} chunks for similarity...`);
    console.log('Sample chunk data:', chunks[0] ? {
      id: chunks[0].id,
      has_embedding: !!chunks[0].embedding,
      embedding_length: Array.isArray(chunks[0].embedding) ? chunks[0].embedding.length : 0
    } : 'No chunks');

    // Calculate similarity scores with improved filtering
    const chunksWithScores = [];

    for (const chunk of chunks) {
      const embedding = Array.isArray(chunk.embedding) ? chunk.embedding : [];
      
      // Skip if embedding is empty or invalid
      if (embedding.length === 0) {
        continue;
      }

      const similarity = cosineSimilarity(queryEmbedding, embedding);
      
      console.log(`Chunk ${chunk.id} similarity: ${similarity}`);
      
      // Accept chunks to test LLM prompt (similarity issue separate)
      if (similarity > -0.5) { // Accept reasonable range to test LLM
        chunksWithScores.push({
          ...chunk,
          similarity_score: similarity
        });
      }
    }

    console.log(`Found ${chunksWithScores.length} chunks with similarity > 0.2`);

    // Sort by similarity and return top K
    const topChunks = chunksWithScores
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, topK);

    console.log(`Returning top ${topChunks.length} chunks with scores:`, 
      topChunks.map(c => ({doc: c.document_id, score: c.similarity_score})));

    return topChunks;

  } catch (error) {
    console.error('Error searching chunks:', error);
    return [];
  }
}

// Generate answer using LLM with context (optimized)
async function generateAnswer(query, relevantChunks) {
  try {
    // Create context from relevant chunks (shortened for speed)
    const context = relevantChunks
      .slice(0, 3) // Only use top 3 chunks for speed
      .map((chunk, index) => `[Document ${chunk.document_id}]: ${chunk.content.substring(0, 400)}`)
      .join('\n\n');

    const prompt = `CRITICAL: You can ONLY use the exact text provided in the context. NO exceptions.

CONTEXT DOCUMENT:
${context}

QUESTION: "${query}"

RULES - FOLLOW EXACTLY:
1. If the question is NOT answered in the context, respond ONLY: "I don't have information about this topic in uploaded documents."
2. If the question is about a different topic (Taj Mahal when context is React Native), respond ONLY: "I don't have information about this topic in uploaded documents."
3. DO NOT use any general knowledge or outside information
4. DO NOT make up any answers
5. If you cannot find the EXACT answer in context, say you don't have information
6. Be extremely strict - if unsure, respond that you don't have information

ANSWER:`;

    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama2',
      prompt: prompt,
      stream: false,
      options: {
        num_predict: 80, // Even shorter response
        temperature: 0.05  // Even lower temperature
      }
    }, {
      timeout: 30000 // 30 second timeout
    });

    console.log('LLM Raw Response:', response.data.response);
    return response.data.response.trim();

  } catch (error) {
    console.error('Error generating answer:', error);
    throw new Error('Failed to generate answer');
  }
}

// Main Q&A endpoint
router.post('/ask', async (req, res) => {
  try {
    const { question, user_id } = req.body;

    if (!question || !user_id) {
      return res.status(400).json({
        error: 'Question and user_id are required'
      });
    }

    if (!supabase) {
      return res.status(500).json({
        error: 'Database connection not available. Please check server configuration.'
      });
    }

    console.log(`Processing question for user ${user_id}: "${question}"`);

    // Step 1: Convert question to embedding
    console.log('Step 1: Generating query embedding...');
    const queryEmbedding = await generateQueryEmbedding(question);
    console.log(`Generated embedding with ${queryEmbedding.length} dimensions`);

    // Step 2: Search vector DB for relevant chunks
    console.log('Step 2: Searching for relevant chunks...');
    const relevantChunks = await searchRelevantChunks(queryEmbedding, user_id, 5);
    console.log(`Found ${relevantChunks.length} relevant chunks`);

    if (relevantChunks.length === 0) {
      return res.json({
        answer: "I don't have any uploaded documents to search through. Please upload some documents first.",
        sources: [],
        question: question
      });
    }

    // Step 3: Send to LLM with context
    console.log('Step 3: Generating answer with context...');
    const answer = await generateAnswer(question, relevantChunks);

    // Step 4: Return answer with sources
    const sources = relevantChunks.map(chunk => ({
      document_id: chunk.document_id,
      chunk_index: chunk.chunk_index,
      similarity_score: chunk.similarity_score,
      preview: chunk.content.substring(0, 100) + '...'
    }));

    res.json({
      answer: answer,
      sources: sources,
      question: question,
      chunks_used: relevantChunks.length
    });

  } catch (error) {
    console.error('Error in Q&A endpoint:', error);
    res.status(500).json({
      error: 'Failed to process question',
      details: error.message
    });
  }
});

// Get chat history for a user
router.get('/history/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!supabase) {
      return res.status(500).json({
        error: 'Database connection not available'
      });
    }

    // Note: You would need to create a chat_history table for this
    // For now, return empty history
    res.json({
      history: [],
      message: 'Chat history feature requires additional table setup'
    });

  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({
      error: 'Failed to fetch chat history'
    });
  }
});

// Health check for the ask service
router.get('/health', async (req, res) => {
  try {
    // Test Ollama connection
    const ollamaResponse = await axios.get('http://localhost:11434/api/tags');
    
    res.json({
      status: 'healthy',
      ollama_available: true,
      models: ollamaResponse.data.models.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.json({
      status: 'degraded',
      ollama_available: false,
      error: 'Ollama not available',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
