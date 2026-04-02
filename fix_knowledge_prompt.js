const fs = require('fs');

// Read the current file
let content = fs.readFileSync('routes/knowledge.js', 'utf8');

// Find and replace the complex prompt with a simple one
const oldPrompt = /const intelligentPrompt = `Purpose:[\s\S]*?FINAL RULE:[\s\S]*?`;/;
const newPrompt = `const simplePrompt = \`Structured Knowledge:
\${knowledgeJson}

Question: \${query}

Answer the question based ONLY on the structured knowledge above. If the answer is not in the knowledge, respond exactly: "Not found in memory".

Answer:\`;`;

// Replace the first occurrence
content = content.replace(oldPrompt, newPrompt);

// Also update the variable name in the axios call
content = content.replace('prompt: intelligentPrompt,', 'prompt: simplePrompt,');

// Write back to file
fs.writeFileSync('routes/knowledge.js', content);
console.log('Fixed knowledge prompt successfully');
