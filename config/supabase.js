const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  console.error('Missing Supabase configuration. Please check your environment variables.');
  console.error('Required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
  // Don't throw error in serverless, instead create a mock client
  module.exports = {
    supabase: null,
    supabaseAdmin: null
  };
} else {
  // Create Supabase client with anon key (for client-side operations)
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Create Supabase admin client with service role key (for server-side operations)
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  module.exports = {
    supabase,
    supabaseAdmin
  };
}
