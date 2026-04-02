#!/bin/bash

# Simple API Testing Script
echo "🚀 Starting Simple API Testing"
echo "================================"

# Configuration
BASE_URL="http://localhost:3000"
USER_ID="bcc4711b-ae68-4ce5-a0e9-038777deb135"

# Step 1: Clean up existing data
echo "🧹 Cleaning up existing data..."
curl -s -X DELETE "$BASE_URL/api/management/user/$USER_ID" | jq .

# Step 2: Upload test document
echo "📄 Uploading test document..."
DOCUMENT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/uploads/upload" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test_document.txt" \
  -F "user_id=$USER_ID")

echo "Upload Response:"
echo "$DOCUMENT_RESPONSE" | jq .

# Extract document ID
DOCUMENT_ID=$(echo "$DOCUMENT_RESPONSE" | jq -r '.document.id // empty')

if [ -z "$DOCUMENT_ID" ] || [ "$DOCUMENT_ID" = "null" ]; then
  echo "❌ Failed to upload document"
  exit 1
fi

echo "✅ Document uploaded with ID: $DOCUMENT_ID"

# Step 3: Extract knowledge
echo "🧠 Extracting structured knowledge..."
KNOWLEDGE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/knowledge/extract-knowledge/$DOCUMENT_ID" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\": \"$USER_ID\"}")

echo "Knowledge Extraction Response:"
echo "$KNOWLEDGE_RESPONSE" | jq .

# Step 4: Test /ask API
echo ""
echo "🤖 Testing /ask API (Strict Document-Based)"
echo "=========================================="

ASK_QUESTIONS=(
  "What architecture was implemented?"
  "Why was Kong chosen as API gateway?"
  "What databases are used?"
  "Where is the system deployed?"
  "How long did migration take?"
)

for question in "${ASK_QUESTIONS[@]}"; do
  echo ""
  echo "Q: $question"
  ASK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/ask/ask" \
    -H "Content-Type: application/json" \
    -d "{\"question\": \"$question\", \"user_id\": \"$USER_ID\"}")
  
  echo "A: $(echo "$ASK_RESPONSE" | jq -r '.answer')"
  echo "Confidence: $(echo "$ASK_RESPONSE" | jq -r '.confidence // "N/A"')"
  echo "Sources: $(echo "$ASK_RESPONSE" | jq -r '.sources | length')"
done

# Step 5: Test /ask-knowledge API
echo ""
echo "🎯 Testing /ask-knowledge API (Intelligent Knowledge System)"
echo "============================================================"

KNOWLEDGE_QUESTIONS=(
  "What decisions were made about API gateway?"
  "What components are in the system?"
  "What technologies are used?"
  "What were the results after migration?"
  "What challenges were faced?"
)

for question in "${KNOWLEDGE_QUESTIONS[@]}"; do
  echo ""
  echo "Q: $question"
  KNOWLEDGE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/knowledge/ask-knowledge" \
    -H "Content-Type: application/json" \
    -d "{\"question\": \"$question\", \"user_id\": \"$USER_ID\"}")
  
  echo "A: $(echo "$KNOWLEDGE_RESPONSE" | jq -r '.answer')"
  echo "Source: $(echo "$KNOWLEDGE_RESPONSE" | jq -r '.source // "N/A"')"
  echo "Confidence: $(echo "$KNOWLEDGE_RESPONSE" | jq -r '.confidence // "N/A"')"
  echo "Strategy: $(echo "$KNOWLEDGE_RESPONSE" | jq -r '.search_strategy // "N/A"')"
done

echo ""
echo "🏁 Testing completed!"
echo "===================="
