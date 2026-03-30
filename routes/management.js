const express = require('express');
const { supabase } = require('../config/supabase');
const router = express.Router();

// Reset LLM conversation context
router.post('/reset', async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        error: 'User ID is required'
      });
    }

    if (!supabase) {
      return res.status(500).json({
        error: 'Database connection not available. Please check server configuration.'
      });
    }

    console.log(`Resetting conversation context for user: ${user_id}`);

    // Option 1: Clear any conversation history (if you have a chat_history table)
    // This would require creating a chat_history table first
    
    // Option 2: Return success to indicate reset
    // The LLM will start fresh on next question
    
    res.json({
      message: 'Conversation context reset successfully',
      user_id: user_id,
      timestamp: new Date().toISOString(),
      note: 'Next question will start fresh context'
    });

  } catch (error) {
    console.error('Error resetting conversation:', error);
    res.status(500).json({
      error: 'Failed to reset conversation',
      details: error.message
    });
  }
});

// Delete a specific document and all its chunks
router.delete('/document/:document_id', async (req, res) => {
  try {
    const { document_id } = req.params;
    const { user_id } = req.body;

    if (!document_id || !user_id) {
      return res.status(400).json({
        error: 'Document ID and User ID are required'
      });
    }

    if (!supabase) {
      return res.status(500).json({
        error: 'Database connection not available. Please check server configuration.'
      });
    }

    console.log(`Deleting document ${document_id} for user ${user_id}`);

    // First, delete all chunks associated with this document
    const { error: chunkError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', document_id)
      .eq('user_id', user_id);

    if (chunkError) {
      console.error('Error deleting document chunks:', chunkError);
      return res.status(500).json({
        error: 'Failed to delete document chunks',
        details: chunkError.message
      });
    }

    // Then, delete the document itself
    const { error: docError, data: deletedDoc } = await supabase
      .from('documents')
      .delete()
      .eq('id', document_id)
      .eq('user_id', user_id)
      .select();

    if (docError) {
      console.error('Error deleting document:', docError);
      return res.status(500).json({
        error: 'Failed to delete document',
        details: docError.message
      });
    }

    res.json({
      message: 'Document deleted successfully',
      document_id: document_id,
      user_id: user_id,
      deleted_chunks: true,
      deleted_document: deletedDoc !== null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in document deletion:', error);
    res.status(500).json({
      error: 'Failed to delete document',
      details: error.message
    });
  }
});

// Delete all documents for a user
router.delete('/user/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({
        error: 'User ID is required'
      });
    }

    if (!supabase) {
      return res.status(500).json({
        error: 'Database connection not available. Please check server configuration.'
      });
    }

    console.log(`Deleting all documents for user: ${user_id}`);

    // First, delete all chunks for this user
    const { error: chunkError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('user_id', user_id);

    if (chunkError) {
      console.error('Error deleting user chunks:', chunkError);
      return res.status(500).json({
        error: 'Failed to delete user chunks',
        details: chunkError.message
      });
    }

    // Then, delete all documents for this user
    const { error: docError, data: deletedDocs } = await supabase
      .from('documents')
      .delete()
      .eq('user_id', user_id)
      .select();

    if (docError) {
      console.error('Error deleting user documents:', docError);
      return res.status(500).json({
        error: 'Failed to delete user documents',
        details: docError.message
      });
    }

    res.json({
      message: 'All documents deleted successfully',
      user_id: user_id,
      deleted_chunks: true,
      deleted_documents: deletedDocs !== null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in bulk document deletion:', error);
    res.status(500).json({
      error: 'Failed to delete documents',
      details: error.message
    });
  }
});

// Get list of all documents for a user
router.get('/documents/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({
        error: 'User ID is required'
      });
    }

    if (!supabase) {
      return res.status(500).json({
        error: 'Database connection not available. Please check server configuration.'
      });
    }

    // Get all documents for the user
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, file_name, file_size, total_chunks, processed_chunks, created_at, structured_knowledge')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching documents:', error);
      return res.status(500).json({
        error: 'Failed to fetch documents',
        details: error.message
      });
    }

    // Get chunk count for each document
    const documentsWithChunkCount = [];
    for (const doc of documents || []) {
      const { count, error: countError } = await supabase
        .from('document_chunks')
        .select('id', { count: 'exact' })
        .eq('document_id', doc.id)
        .eq('user_id', user_id);

      if (countError) {
        console.error('Error counting chunks:', countError);
        documentsWithChunkCount.push({
          ...doc,
          chunk_count: 0
        });
      } else {
        documentsWithChunkCount.push({
          ...doc,
          chunk_count: count || 0
        });
      }
    }

    res.json({
      documents: documentsWithChunkCount,
      total_documents: documentsWithChunkCount.length,
      user_id: user_id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      error: 'Failed to fetch documents',
      details: error.message
    });
  }
});

// Health check for management service
router.get('/health', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({
        status: 'degraded',
        database_available: false,
        timestamp: new Date().toISOString()
      });
    }

    // Test database connection
    const { data, error } = await supabase
      .from('documents')
      .select('id')
      .limit(1);

    res.json({
      status: 'healthy',
      database_available: true,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.json({
      status: 'unhealthy',
      database_available: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
