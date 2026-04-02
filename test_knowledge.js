const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Simple test to check knowledge database
router.post('/check-knowledge', async (req, res) => {
  try {
    const { user_id } = req.body;
    
    console.log(`🔍 CHECKING KNOWLEDGE DB for user: ${user_id}`);
    
    // Get all knowledge entries
    const { data: knowledge, error } = await supabase
      .from('document_knowledge')
      .select('*')
      .eq('user_id', user_id)
      .order('extracted_at', { ascending: false });

    if (error) {
      console.error('Knowledge DB error:', error);
      return res.status(500).json({ error: 'Database query failed' });
    }
    
    console.log(`Found ${knowledge?.length || 0} knowledge entries`);
    
    // Show first few entries
    const entries = knowledge?.slice(0, 3).map(k => ({
      id: k.id,
      document_id: k.document_id,
      summary: k.summary?.substring(0, 100) + '...',
      decisions_count: k.decisions?.length || 0,
      concepts_count: k.concepts?.length || 0,
      created_at: k.extracted_at
    }));
    
    res.json({
      success: true,
      user_id,
      total_entries: knowledge?.length || 0,
      entries: entries || [],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Knowledge check error:', error);
    res.status(500).json({ error: 'Test failed', details: error.message });
  }
});

module.exports = router;
