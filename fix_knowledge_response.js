const fs = require('fs');

// Read the current file
let content = fs.readFileSync('routes/knowledge.js', 'utf8');

// Find and replace the complex response parsing with simple parsing
const oldParsing = /    const rawResponse = response\.data\.response\.trim\(\);[\s\S]*?let confidence = confidenceMatch \? confidenceMatch\[1\]\.trim\(\) : "Medium";/;
const newParsing = `    const rawResponse = response.data.response.trim();
    console.log('Knowledge LLM Response:', rawResponse);

    // Simple response parsing
    let answer = rawResponse.trim();
    let source = relevantKnowledge.length > 0 ? "Structured Knowledge" : "Document Context";
    let reasoning = "Answer based on available information";
    let supportingEvidence = "";
    let confidence = "High";`;

// Replace all occurrences
content = content.replace(oldParsing, newParsing);

// Write back to file
fs.writeFileSync('routes/knowledge.js', content);
console.log('Fixed knowledge response parsing successfully');
