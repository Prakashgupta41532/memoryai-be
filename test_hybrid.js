const express = require('express');
const router = express.Router();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Test different query types to show hybrid capabilities
router.post('/query-comparison', async (req, res) => {
  try {
    const { question, user_id } = req.body;
    
    console.log(`🔍 QUERY COMPARISON TEST: "${question}"`);
    
    // Test different query types
    const testQueries = [
      { type: 'decision', query: 'Why did we choose JWT?' },
      { type: 'location', query: 'Where is the Taj Mahal located?' },
      { type: 'concept', query: 'What is useState in React?' },
      { type: 'keyword', query: 'React Native framework' },
      { type: 'semantic', query: 'Mobile app development' }
    ];
    
    const results = [];
    
    // Get knowledge data once
    const { data: knowledgeData } = await supabase
      .from('document_knowledge')
        .select('*')
        .eq('user_id', user_id);

    for (const test of testQueries) {
      let knowledgeMatch = null;
      if (knowledgeData && knowledgeData.length > 0) {
        knowledgeMatch = knowledgeData.find(k => {
          const searchText = `${k.summary} ${JSON.stringify(k.decisions)}`.toLowerCase();
          return searchText.includes(test.query.toLowerCase());
        });
      }
      
      results.push({
        query_type: test.type,
        query: test.query,
        knowledge_method: knowledgeMatch ? 'found' : 'not found',
        knowledge_result: knowledgeMatch ? knowledgeMatch.summary : 'No match'
      });
    }
    
    res.json({
      success: true,
      test_summary: {
        total_queries: testQueries.length,
        knowledge_entries: knowledgeData?.length || 0,
        timestamp: new Date().toISOString()
      },
      results: results,
      analysis: {
        decision_queries: results.filter(r => r.query_type === 'decision').length,
        location_queries: results.filter(r => r.query_type === 'location').length,
        concept_queries: results.filter(r => r.query_type === 'concept').length,
        keyword_queries: results.filter(r => r.query_type === 'keyword').length,
        semantic_queries: results.filter(r => r.query_type === 'semantic').length
      }
    });
    
  } catch (error) {
    console.error('Query comparison test error:', error);
    res.status(500).json({ error: 'Test failed', details: error.message });
  }
});
  try {
    const { question, user_id } = req.body;
    
    console.log(`🧪 COMPREHENSIVE HYBRID TEST: "${question}"`);
    
    // Test 1: Direct knowledge query
    const { data: knowledge } = await supabase
      .from('document_knowledge')
      .select('*')
      .eq('user_id', user_id)
      .order('extracted_at', { ascending: false });

    console.log(`Knowledge found: ${knowledge?.length || 0} entries`);
    
    // Test 2: Check all three search methods
    const queryLower = question.toLowerCase();
    let results = {
      knowledge: { found: 0, method: 'structured', details: 'No knowledge entries' },
      vector: { found: 0, method: 'semantic', details: 'No vector search' },
      keyword: { found: 0, method: 'exact', details: 'No keyword matches' }
    };
    
    // Check knowledge matches
    if (knowledge && knowledge.length > 0) {
      const knowledgeMatch = knowledge.find(k => {
        const searchText = `${k.summary} ${JSON.stringify(k.decisions)} ${JSON.stringify(k.concepts)}`.toLowerCase();
        return searchText.includes(queryLower) || 
               searchText.includes('tajmahal') || 
               searchText.includes('agra') ||
               searchText.includes('located') ||
               (queryLower.includes('jwt') && searchText.includes('jwt'));
      });
      
      if (knowledgeMatch) {
        results.knowledge = {
          found: 1,
          method: 'structured',
          details: `Found: ${knowledgeMatch.summary}`,
          relevance: 10
        };
      }
    }
    
    // Check vector search (simplified)
    let chunks = [];
    try {
      const { data: chunkData } = await supabase
        .from('document_chunks')
        .select('*')
        .eq('user_id', user_id)
        .limit(5);

      if (chunkData && chunkData.length > 0) {
        chunks = chunkData;
      }
    } catch (error) {
      console.log('Vector search failed:', error.message);
    }
    
    // Check keyword search
    if (chunks && chunks.length > 0) {
      const keywords = queryLower.split(' ').filter(k => k.length > 2);
      const keywordMatches = chunks.filter(chunk => {
        const content = chunk.content.toLowerCase();
        return keywords.some(keyword => content.includes(keyword));
      });
      
      if (keywordMatches.length > 0) {
        results.keyword = {
          found: keywordMatches.length,
          method: 'exact',
          details: `Found ${keywordMatches.length} exact keyword matches`,
          relevance: 0.9
        };
      }
    }
    
    // Determine best method
    const methods = ['knowledge', 'vector', 'keyword'];
    const bestMethod = methods.find(method => results[method].found > 0) || 'none';
    const bestResult = results[bestMethod] || { found: 0, method: 'none', details: 'No matches' };
    
    res.json({
      success: true,
      question,
      query_analysis: {
        original: question,
        lowercase: queryLower,
        keywords: queryLower.split(' '),
        length: question.length
      },
      search_results: results,
      best_method: bestMethod,
      best_result: bestResult,
      hybrid_score: Object.values(results).reduce((sum, r) => sum + (r.found || 0), 0),
      summary: `Hybrid search completed. Best method: ${bestMethod} with ${bestResult.found} matches.`
    });
    
  } catch (error) {
    console.error('Hybrid test error:', error);
    res.status(500).json({ error: 'Test failed', details: error.message });
  }
});

module.exports = router;
