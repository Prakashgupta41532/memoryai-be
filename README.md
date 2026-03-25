# Memory AI Backend

A Node.js + Express backend API for the Memory AI application with Supabase integration.

## Features

- RESTful API for memory management
- User profile management
- Supabase database integration
- CORS support for frontend integration
- Security middleware (Helmet)
- Request logging (Morgan)
- Environment configuration

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Supabase account and project

## Installation

1. Clone or navigate to the project directory:
```bash
cd backendmemroyai
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Configure your Supabase credentials in `.env`:
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

## Database Setup

Create the following tables in your Supabase database:

### users table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### memories table
```sql
CREATE TABLE memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Enable RLS (Row Level Security)
```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can view own memories" ON memories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own memories" ON memories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own memories" ON memories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own memories" ON memories FOR DELETE USING (auth.uid() = user_id);
```

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000` by default.

## API Endpoints

### Health Check
- `GET /` - Basic server info
- `GET /health` - Health check

### Users
- `GET /api/users/:id` - Get user profile
- `POST /api/users` - Create/update user profile
- `PUT /api/users/:id` - Update user profile
- `GET /api/users/:id/stats` - Get user memory statistics

### Memories
- `GET /api/memories` - Get all memories for a user (requires `user_id` query param)
- `GET /api/memories/:id` - Get specific memory (requires `user_id` query param)
- `POST /api/memories` - Create new memory
- `PUT /api/memories/:id` - Update memory
- `DELETE /api/memories/:id` - Delete memory (requires `user_id` query param)
- `GET /api/memories/search/:query` - Search memories (requires `user_id` query param)

## Example API Usage

### Create a Memory
```bash
curl -X POST http://localhost:3000/api/memories \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-uuid-here",
    "title": "My First Memory",
    "content": "This is the content of my memory",
    "tags": ["personal", "important"],
    "metadata": {"mood": "happy"}
  }'
```

### Get User Memories
```bash
curl "http://localhost:3000/api/memories?user_id=user-uuid-here"
```

### Search Memories
```bash
curl "http://localhost:3000/api/memories/search/important?user_id=user-uuid-here"
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 3000) |
| `NODE_ENV` | Environment (development/production) | No |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |

## Project Structure

```
backendmemroyai/
├── config/
│   └── supabase.js          # Supabase client configuration
├── routes/
│   ├── memories.js          # Memory-related routes
│   └── users.js             # User-related routes
├── .env.example             # Environment variables template
├── .gitignore               # Git ignore file
├── index.js                 # Main server file
├── package.json             # Dependencies and scripts
└── README.md                # This file
```

## Security Features

- **Helmet**: Sets various HTTP headers to protect against common web vulnerabilities
- **CORS**: Configurable cross-origin resource sharing
- **Request validation**: Input validation for all endpoints
- **Error handling**: Centralized error handling with proper HTTP status codes

## Development

The project uses nodemon for auto-restarting during development. Any changes to the code will automatically restart the server.

## License

ISC
