const axios = require('axios');

async function testLLMWithKnowledge() {
  try {
    const knowledgeJson = JSON.stringify({
      summary: "Migration from monolithic to microservices architecture with Kong API Gateway, Docker, Kubernetes, and gRPC",
      decisions: [
        {
          risk: "Vendor dependency and licensing costs",
          impact: "Reduced development time by 3 months",
          reason: "Built-in rate limiting, authentication, and monitoring",
          decision: "Used Kong API Gateway instead of building custom gateway"
        }
      ]
    }, null, 2);

    const query = "What decisions were made about API Gateway?";
    
    const simplePrompt = `Structured Knowledge:
${knowledgeJson}

Question: ${query}

Answer the question based ONLY on the structured knowledge above. If the answer is not in the knowledge, respond exactly: "Not found in memory".

Answer:`;

    console.log('Sending prompt to LLM...');
    console.log('Prompt length:', simplePrompt.length);
    console.log('Prompt preview:', simplePrompt.substring(0, 300) + '...');

    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama2',
      prompt: simplePrompt,
      stream: false,
      options: {
        num_predict: 200,
        temperature: 0.1
      }
    }, {
      timeout: 30000
    });

    const rawResponse = response.data.response.trim();
    console.log('LLM Response:', rawResponse);
    console.log('Response length:', rawResponse.length);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testLLMWithKnowledge();
