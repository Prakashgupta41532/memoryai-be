const express = require('express');
const { supabase } = require('../config/supabase');
const router = express.Router();

// Get all memories for a user
router.get('/', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching memories:', error);
      return res.status(500).json({ error: 'Failed to fetch memories' });
    }

    res.json({ memories: data });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific memory by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('id', id)
      .eq('user_id', user_id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Memory not found' });
      }
      console.error('Error fetching memory:', error);
      return res.status(500).json({ error: 'Failed to fetch memory' });
    }

    res.json({ memory: data });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new memory
router.post('/', async (req, res) => {
  try {
    const { user_id, title, content, tags, metadata } = req.body;

    if (!user_id || !title || !content) {
      return res.status(400).json({ 
        error: 'user_id, title, and content are required' 
      });
    }

    const newMemory = {
      user_id,
      title,
      content,
      tags: tags || [],
      metadata: metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('memories')
      .insert([newMemory])
      .select()
      .single();

    if (error) {
      console.error('Error creating memory:', error);
      return res.status(500).json({ error: 'Failed to create memory' });
    }

    res.status(201).json({ memory: data });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a memory
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, title, content, tags, metadata } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (tags !== undefined) updateData.tags = tags;
    if (metadata !== undefined) updateData.metadata = metadata;

    const { data, error } = await supabase
      .from('memories')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user_id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Memory not found' });
      }
      console.error('Error updating memory:', error);
      return res.status(500).json({ error: 'Failed to update memory' });
    }

    res.json({ memory: data });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a memory
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const { error } = await supabase
      .from('memories')
      .delete()
      .eq('id', id)
      .eq('user_id', user_id);

    if (error) {
      console.error('Error deleting memory:', error);
      return res.status(500).json({ error: 'Failed to delete memory' });
    }

    res.json({ message: 'Memory deleted successfully' });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search memories
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', user_id)
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error searching memories:', error);
      return res.status(500).json({ error: 'Failed to search memories' });
    }

    res.json({ memories: data });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
