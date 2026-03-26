const express = require('express');
const { supabase, supabaseAdmin } = require('../config/supabase');
const bcrypt = require('bcryptjs');
const router = express.Router();

// Signup endpoint
router.post('/signup', async (req, res) => {
  try {
    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ 
        error: 'Full name, email, and password are required' 
      });
    }

    // Check if Supabase is available
    if (!supabase || !supabaseAdmin) {
      return res.status(500).json({ 
        error: 'Database connection not available. Please check server configuration.' 
      });
    }

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing user:', checkError);
      return res.status(500).json({ error: 'Failed to check existing user' });
    }

    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user with Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name
      }
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      return res.status(500).json({ error: 'Failed to create user account' });
    }

    // Create user profile in database
    const userData = {
      id: authData.user.id,
      email: email,
      name: full_name,
      password_hash: hashedPassword,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();

    if (profileError) {
      console.error('Error creating user profile:', profileError);
      // Clean up auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: 'Failed to create user profile' });
    }

    res.status(201).json({ 
      message: 'User created successfully',
      user: {
        id: profileData.id,
        email: profileData.email,
        name: profileData.name,
        created_at: profileData.created_at
      }
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }

    // Check if Supabase is available
    if (!supabase || !supabaseAdmin) {
      return res.status(500).json({ 
        error: 'Database connection not available. Please check server configuration.' 
      });
    }

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, name, password_hash')
      .eq('email', email)
      .single();

    if (userError) {
      if (userError.code === 'PGRST116') {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      console.error('Error fetching user:', userError);
      return res.status(500).json({ error: 'Failed to authenticate user' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Create session with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (authError) {
      console.error('Error creating session:', authError);
      return res.status(500).json({ error: 'Failed to create session' });
    }

    res.json({ 
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at
      }
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('Error fetching user:', error);
      return res.status(500).json({ error: 'Failed to fetch user' });
    }

    res.json({ user: data });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create or update user profile
router.post('/', async (req, res) => {
  try {
    const { id, email, name, avatar_url, metadata } = req.body;

    if (!id || !email) {
      return res.status(400).json({ 
        error: 'id and email are required' 
      });
    }

    const userData = {
      id,
      email,
      name: name || email.split('@')[0],
      avatar_url: avatar_url || null,
      metadata: metadata || {},
      updated_at: new Date().toISOString()
    };

    // Use upsert to create or update user
    const { data, error } = await supabase
      .from('users')
      .upsert([userData])
      .select()
      .single();

    if (error) {
      console.error('Error creating/updating user:', error);
      return res.status(500).json({ error: 'Failed to create/update user' });
    }

    res.status(201).json({ user: data });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, avatar_url, metadata } = req.body;

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) updateData.name = name;
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url;
    if (metadata !== undefined) updateData.metadata = metadata;

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('Error updating user:', error);
      return res.status(500).json({ error: 'Failed to update user' });
    }

    res.json({ user: data });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's memory statistics
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;

    // Get total memories count
    const { count: totalMemories, error: countError } = await supabase
      .from('memories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', id);

    if (countError) {
      console.error('Error counting memories:', countError);
      return res.status(500).json({ error: 'Failed to get memory statistics' });
    }

    // Get memories created in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count: recentMemories, error: recentError } = await supabase
      .from('memories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', id)
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (recentError) {
      console.error('Error counting recent memories:', recentError);
      return res.status(500).json({ error: 'Failed to get memory statistics' });
    }

    res.json({
      stats: {
        total_memories: totalMemories || 0,
        recent_memories: recentMemories || 0,
        join_date: new Date().toISOString() // This would come from user table in real implementation
      }
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
