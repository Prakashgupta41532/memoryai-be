const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function debugKnowledge() {
  try {
    const { data: knowledge, error } = await supabase
      .from('document_knowledge')
      .select('*')
      .eq('user_id', 'bcc4711b-ae68-4ce5-a0e9-038777deb135')
      .limit(1);

    if (error) {
      console.error('Error fetching knowledge:', error);
      return;
    }

    if (knowledge && knowledge.length > 0) {
      const k = knowledge[0];
      console.log('Knowledge structure:');
      console.log('ID:', k.id);
      console.log('Summary:', k.summary);
      console.log('Decisions:', k.decisions);
      console.log('Decisions type:', typeof k.decisions);
      console.log('Decisions length:', k.decisions?.length);
      
      // Test JSON formatting
      const knowledgeJson = JSON.stringify({
        summary: k.summary,
        decisions: k.decisions || []
      }, null, 2);
      
      console.log('Knowledge JSON length:', knowledgeJson.length);
      console.log('Knowledge JSON preview:', knowledgeJson.substring(0, 200) + '...');
    }
  } catch (error) {
    console.error('Debug error:', error);
  }
}

debugKnowledge();
