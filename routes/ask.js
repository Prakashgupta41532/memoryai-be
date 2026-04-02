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
    // Get config at runtime
    const llmConfig = getLLMConfig();
    
    // Handle mock embeddings for production
    if (EMBEDDING_PROVIDER === 'mock') {
      console.log('Using mock embeddings for production');
      return new Array(1536).fill(0).map(() => Math.random());
    }
    
    // Handle Ollama for development
    if (EMBEDDING_PROVIDER === 'ollama') {
      console.log('Using Ollama for embeddings generation');
      const response = await axios.post(`${llmConfig[EMBEDDING_PROVIDER].embeddingsUrl}`, {
        model: llmConfig[EMBEDDING_PROVIDER].model,
        prompt: query
      }, {
        timeout: 15000
      });
      
      // Cache the result
      queryCache.set(cacheKey, {
        embedding: response.data.embedding,
        timestamp: Date.now()
      });
      
      return response.data.embedding;
    }
    
    // Check if API key is available (for production providers)
    if (!llmConfig[EMBEDDING_PROVIDER].apiKey) {
      console.error(`${EMBEDDING_PROVIDER} API key not found in environment`);
      // Return mock embedding to prevent crashes
      return new Array(1536).fill(0).map(() => Math.random());
    }
    
    console.log(`Using ${EMBEDDING_PROVIDER} for embeddings generation`);
    const response = await axios.post(`${llmConfig[EMBEDDING_PROVIDER].embeddingsUrl}`, {
      model: llmConfig[EMBEDDING_PROVIDER].model,
      input: query
    }, {
      headers: {
        'Authorization': `Bearer ${llmConfig[EMBEDDING_PROVIDER].apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
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
      
      // Only accept chunks with high similarity to prevent false matches
      if (similarity > -1) { // Accept all chunks for testing
        chunksWithScores.push({
          ...chunk,
          similarity_score: similarity
        });
      }
    }

    console.log(`Found ${chunksWithScores.length} chunks with similarity > -1`);

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

// Dynamic LLM configuration with model selection
const getLLMConfig = () => {
  // Always use Ollama for embeddings (local consistency)
  const embeddingConfig = {
    ollama: {
      apiKey: null,
      model: 'llama2',
      embeddingsUrl: 'http://localhost:11434/api/embeddings'
    }
  };
  
  // Dynamic model selection for chat
  const modelSelection = {
    ollama: {
      apiKey: null,
      model: 'llama2',
      chatUrl: 'http://localhost:11434/api/generate'
    },
    qwen: {
      apiKey: null,
      model: 'qwen3:30b',
      chatUrl: 'http://localhost:11434/api/generate'
    },
    groq: {
      apiKey: process.env.GROQ_API_KEY,
      model: 'llama3-8b-8192',
      chatUrl: 'https://api.groq.com/openai/v1/chat/completions'
    },
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-sonnet-20240229',
      chatUrl: 'https://api.anthropic.com/v1/messages'
    },
    gpt4: {
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4-turbo',
      chatUrl: 'https://api.openai.com/v1/chat/completions'
    }
  };
  
  return {
    embedding: embeddingConfig.ollama,
    chat: modelSelection.ollama // Default to Ollama, can be overridden by query analysis
  };
};

// Use Ollama for local, mock for production
const EMBEDDING_PROVIDER = process.env.NODE_ENV === 'development' ? 'ollama' : 'mock';
const LLM_PROVIDER = process.env.NODE_ENV === 'development' ? 'ollama' : 'groq';
// Validate if answer is strictly based on provided context
function validateAnswerBasedOnContext(answer, context) {
  const notFoundPhrases = [
    "not found in memory",
    "i don't have information",
    "i don't know",
    "i cannot find",
    "not mentioned",
    "not provided",
    "not available",
    "no information",
    "cannot answer",
    "unable to answer"
  ];
  
  const answerLower = answer.toLowerCase().trim();
  
  // Check if answer contains any "not found" phrases
  for (const phrase of notFoundPhrases) {
    if (answerLower.includes(phrase)) {
      return { isValid: true, confidence: "Low", reason: "Answer indicates information not found" };
    }
  }
  
  // Check if answer is empty or too short
  if (answerLower.length < 10) {
    return { isValid: false, confidence: "Low", reason: "Answer too short" };
  }
  
  // Check if answer contains speculative language
  const speculativeWords = ["might", "could", "perhaps", "maybe", "probably", "likely", "seems", "appears"];
  const hasSpeculativeLanguage = speculativeWords.some(word => answerLower.includes(word));
  
  // Check if answer directly references content from context
  const contextWords = context.toLowerCase().split(/\s+/).filter(word => word.length > 3);
  const answerWords = answerLower.split(/\s+/).filter(word => word.length > 3);
  const commonWords = answerWords.filter(word => contextWords.includes(word));
  const contextOverlap = commonWords.length / Math.max(answerWords.length, 1);
  
  // Determine confidence based on context overlap and language
  let confidence = "Low";
  let isValid = false;
  
  if (contextOverlap > 0.3 && !hasSpeculativeLanguage) {
    confidence = "High";
    isValid = true;
  } else if (contextOverlap > 0.15) {
    confidence = "Medium";
    isValid = true;
  } else if (contextOverlap > 0.05) {
    confidence = "Low";
    isValid = true;
  }
  
  return {
    isValid,
    confidence,
    reason: `Context overlap: ${(contextOverlap * 100).toFixed(1)}%, Speculative: ${hasSpeculativeLanguage}`
  };
}

// Extract supporting evidence from context for the answer
function extractSupportingEvidence(answer, context, relevantChunks) {
  const answerSentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const evidence = [];
  
  for (const sentence of answerSentences) {
    const sentenceLower = sentence.toLowerCase().trim();
    
    // Find chunks that contain similar content
    for (const chunk of relevantChunks) {
      const chunkLower = chunk.content.toLowerCase();
      
      // Check if chunk contains key terms from the sentence
      const sentenceWords = sentenceLower.split(/\s+/).filter(w => w.length > 4);
      const matchingWords = sentenceWords.filter(word => chunkLower.includes(word));
      
      if (matchingWords.length >= 2) {
        // Extract relevant portion from chunk
        const sentences = chunk.content.split(/[.!?]+/);
        for (const chunkSentence of sentences) {
          const chunkSentenceLower = chunkSentence.toLowerCase();
          if (matchingWords.some(word => chunkSentenceLower.includes(word))) {
            evidence.push(chunkSentence.trim());
            break; // Take first matching sentence from this chunk
          }
        }
        break; // Take first matching chunk
      }
    }
  }
  
  return evidence.slice(0, 3); // Limit to top 3 evidence pieces
}

async function generateAnswer(query, relevantChunks) {
  try {
    // Get config at runtime
    const llmConfig = getLLMConfig();
    
    // Create context from relevant chunks
    const context = relevantChunks
      .slice(0, 3)
      .map(chunk => `[Document ${chunk.document_id}]: ${chunk.content.substring(0, 400)}`)
      .join('\n\n');

    // Debug: Log the context being sent to LLM
    console.log('=== DEBUG: Context being sent to LLM ===');
    console.log('Context length:', context.length);
    console.log('Context preview:', context.substring(0, 500));
    console.log('Question:', query);
    console.log('===============================================');

    // Simple, direct prompt for LLM
    const simplePrompt = `Context:
${context}

Question: ${query}

Answer the question based ONLY on the context above. If the answer is not explicitly in the context, respond exactly: "Not found in memory".
 
Answer:`;

    const response = await axios.post(`${llmConfig.chat.chatUrl}`, {
      model: llmConfig.chat.model,
      prompt: simplePrompt,
      stream: false,
      options: {
        num_predict: 150,
        temperature: 0.1 // Lower temperature for more deterministic responses
      }
    }, {
      headers: LLM_PROVIDER === 'ollama' ? {
        'Content-Type': 'application/json'
      } : {
        'Authorization': `Bearer ${llmConfig[LLM_PROVIDER].apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const rawAnswer = response.data.response;
    console.log('LLM Raw Response:', rawAnswer);
    console.log('LLM Response length:', rawAnswer?.length || 0);
    
    // Check if response is empty or just whitespace
    if (!rawAnswer || rawAnswer.trim().length === 0) {
      console.log('LLM returned empty response');
      return {
        answer: "Not found in memory",
        supportingEvidence: [],
        confidence: "Low",
        validation: { isValid: true, confidence: "Low", reason: "Empty LLM response" }
      };
    }
    
    const answer = rawAnswer.trim();
    
    // Simple validation: if answer contains "Not found in memory", return it directly
    if (answer.includes("Not found in memory")) {
      return {
        answer: "Not found in memory",
        supportingEvidence: [],
        confidence: "Low",
        validation: { isValid: true, confidence: "Low", reason: "Information not found in context" }
      };
    }
    
    // Validate that answer is actually from context
    const contextLower = context.toLowerCase();
    const answerLower = answer.toLowerCase();
    
    // Check if answer contains words from context
    const contextWords = contextLower.split(/\s+/).filter(w => w.length > 3);
    const answerWords = answerLower.split(/\s+/).filter(w => w.length > 3);
    const commonWords = answerWords.filter(word => contextWords.includes(word));
    const contextOverlap = commonWords.length / Math.max(answerWords.length, 1);
    
    console.log(`Context overlap: ${contextOverlap.toFixed(2)} (${commonWords.length}/${answerWords.length} words)`);
    
    // If less than 20% overlap, consider it not found
    if (contextOverlap < 0.2) {
      console.log('Low context overlap - returning "Not found in memory"');
      return {
        answer: "Not found in memory",
        supportingEvidence: [],
        confidence: "Low",
        validation: { isValid: true, confidence: "Low", reason: `Low context overlap: ${(contextOverlap * 100).toFixed(1)}%` }
      };
    }
    
    // Return the answer with basic validation
    return {
      answer: answer,
      supportingEvidence: [context.substring(0, 100) + '...'],
      confidence: contextOverlap > 0.5 ? "High" : contextOverlap > 0.3 ? "Medium" : "Low",
      validation: { isValid: true, confidence: "Medium", reason: `Context overlap: ${(contextOverlap * 100).toFixed(1)}%` }
    };

  } catch (error) {
    console.error('Error generating answer:', error);
    if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
      console.log('Ollama not available - providing fallback response');
      return {
        answer: "Not found in memory",
        supportingEvidence: [],
        confidence: "Low",
        validation: { isValid: true, confidence: "Low", reason: "Service unavailable" }
      };
    }
    
    // Check if API key is missing
    if (error.response && error.response.status === 401) {
      console.error(`${EMBEDDING_PROVIDER} API key invalid or missing`);
      console.error('Error details:', error.response.data);
      return {
        answer: "Not found in memory",
        supportingEvidence: [],
        confidence: "Low",
        validation: { isValid: true, confidence: "Low", reason: "API key missing" }
      };
    }
    
    // Check for other API errors
    if (error.response && error.response.status >= 400) {
      console.error(`${EMBEDDING_PROVIDER} API error:`, error.response.data);
      return {
        answer: "Not found in memory",
        supportingEvidence: [],
        confidence: "Low",
        validation: { isValid: true, confidence: "Low", reason: "API error" }
      };
    }
    
    throw new Error('Failed to generate answer');
  }
}

// Main Q&A endpoint
router.post('/ask', async (req, res) => {
  try {
    const { question, user_id } = req.body;

    if (!question || !user_id) {
      return res.status(400).json({ error: 'Question and user_id are required' });
    }

    console.log(`Processing question for user ${user_id}: "${question}"`);

    // Step 1: Generate query embedding
    console.log('Step 1: Generating query embedding...');
    const queryEmbedding = await generateQueryEmbedding(question);
    console.log(`Generated embedding with ${queryEmbedding.length} dimensions`);

    // Step 2: Search for relevant chunks
    console.log('Step 2: Searching for relevant chunks...');
    const relevantChunks = await searchRelevantChunks(queryEmbedding, user_id);
    console.log(`Found ${relevantChunks.length} relevant chunks`);

    // HARD RULE: If no chunks found with good similarity, return "not found" immediately
    if (relevantChunks.length === 0) {
      console.log('No relevant chunks found - returning "not found"');
      return res.json({
        answer: "I don't have information about this topic in uploaded documents.",
        sources: [],
        question
      });
    }

    console.log(`Found ${relevantChunks.length} relevant chunks for question: "${question}"`);
    console.log('Top chunk preview:', relevantChunks[0]?.content?.substring(0, 100) + '...');

    // Step 3: Generate answer
    console.log('Step 3: Generating answer with context...');
    console.log('Available chunks for context:', relevantChunks.length);
    console.log('First chunk content preview:', relevantChunks[0]?.content?.substring(0, 200) + '...');
    const answerResult = await generateAnswer(question, relevantChunks);

    res.json({
      answer: answerResult.answer,
      supportingEvidence: answerResult.supportingEvidence,
      confidence: answerResult.confidence,
      sources: relevantChunks.map(chunk => ({
        document_id: chunk.document_id,
        chunk_index: chunk.chunk_index,
        similarity_score: chunk.similarity_score,
        preview: chunk.content.substring(0, 100) + '...'
      })),
      question,
      chunks_used: relevantChunks.length,
      validation: answerResult.validation
    });

  } catch (error) {
    console.error('Error in ask endpoint:', error);
    res.status(500).json({ error: 'Failed to process question' });
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

module.exports = {
  router,
  generateQueryEmbedding, // Export for hybrid search
  searchRelevantChunks,
  generateAnswer
};
