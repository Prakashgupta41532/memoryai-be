const fs = require('fs');

// Read the file
let content = fs.readFileSync('routes/knowledge.js', 'utf8');

// Fix 1: Replace the complex prompt with simple prompt (first occurrence)
content = content.replace(
  /const intelligentPrompt = `Purpose:[\s\S]*?FINAL RULE:[\s\S]*?`;/,
  `const simplePrompt = \`Structured Knowledge:
\${knowledgeJson}

Question: \${query}

Answer the question based ONLY on the structured knowledge above. If the answer is not in the knowledge, respond exactly: "Not found in memory".

Answer:\`;`
);

// Fix 2: Update the variable name in the axios call (first occurrence)
content = content.replace(
  /prompt: intelligentPrompt,/,
  'prompt: simplePrompt,'
);

// Fix 3: Simplify response parsing (first occurrence)
content = content.replace(
  /    const rawResponse = response\.data\.response\.trim\(\);[\s\S]*?let confidence = confidenceMatch \? confidenceMatch\[1\]\.trim\(\) : "Medium";/,
  `    const rawResponse = response.data.response.trim();
    console.log('Knowledge LLM Response:', rawResponse);

    // Simple response parsing
    let answer = rawResponse.trim();
    let source = "Structured Knowledge";
    let reasoning = "Answer based on extracted structured knowledge";
    let supportingEvidence = "";
    let confidence = "High";`
);

// Fix 4: Replace the complex prompt with simple prompt (second occurrence)
content = content.replace(
  /const intelligentPrompt = `Purpose:[\s\S]*?FINAL RULE:[\s\S]*?`;/,
  `const simplePrompt = \`Structured Knowledge:
\${knowledgeJson}

Question: \${query}

Answer the question based ONLY on the structured knowledge above. If the answer is not in the knowledge, respond exactly: "Not found in memory".

Answer:\`;`
);

// Fix 5: Update the variable name in the axios call (second occurrence)
content = content.replace(
  /prompt: intelligentPrompt,/,
  'prompt: simplePrompt,'
);

// Fix 6: Simplify response parsing (second occurrence)
content = content.replace(
  /    const rawResponse = response\.data\.response\.trim\(\);[\s\S]*?let confidence = confidenceMatch \? confidenceMatch\[1\]\.trim\(\) : "Medium";/,
  `    const rawResponse = response.data.response.trim();
    console.log('Knowledge LLM Response:', rawResponse);

    // Simple response parsing
    let answer = rawResponse.trim();
    let source = "Document Context";
    let reasoning = "Answer based on document chunks";
    let supportingEvidence = "";
    let confidence = "Medium";`
);

// Write the fixed content back
fs.writeFileSync('routes/knowledge.js', content);
console.log('Applied simple knowledge fix successfully');
