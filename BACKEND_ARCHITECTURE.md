# Backend Service Architecture

## Quick Start Commands

```bash
# Create backend directory structure
mkdir -p backend/src/{auth,transcription,documents,summarization,websocket,audit}
mkdir -p backend/database/{migrations,models}
mkdir -p backend/docker

# Initialize backend package.json
cd backend
npm init -y

# Install core dependencies
npm install express cors helmet morgan compression
npm install jsonwebtoken bcryptjs
npm install ws socket.io
npm install pg pg-hstore
npm install aws-sdk
npm install multer
npm install openai
npm install dotenv

# Install dev dependencies
npm install -D @types/node @types/express @types/jsonwebtoken @types/bcryptjs @types/ws @types/pg @types/multer
npm install -D nodemon ts-node typescript
npm install -D jest @types/jest supertest @types/supertest
```

## Environment Configuration

Create `backend/.env`:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dao_copilot
POSTGRES_USER=dao_user
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=dao_copilot

# Authentication
JWT_SECRET=your-super-secure-jwt-secret-key
JWT_EXPIRE=24h
REFRESH_TOKEN_EXPIRE=7d

# External APIs
OPENAI_API_KEY=your-openai-api-key
GOOGLE_CLOUD_STT_KEY=your-google-stt-key
ASSEMBLYAI_API_KEY=your-assemblyai-key

# Cloud Storage
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
S3_BUCKET_NAME=dao-copilot-documents

# OAuth Integrations
ZOOM_CLIENT_ID=your-zoom-client-id
ZOOM_CLIENT_SECRET=your-zoom-client-secret
TEAMS_CLIENT_ID=your-teams-client-id
TEAMS_CLIENT_SECRET=your-teams-client-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Security
ENCRYPTION_KEY=your-32-character-encryption-key
CORS_ORIGIN=http://localhost:5173
```

## Database Schema (PostgreSQL)

```sql
-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    preferences JSONB DEFAULT '{}'
);

-- OAuth integrations
CREATE TABLE oauth_integrations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL, -- 'zoom', 'teams', 'google'
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Meetings
CREATE TABLE meetings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(50),
    platform_meeting_id VARCHAR(255),
    title VARCHAR(500),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    transcript_id INTEGER,
    summary_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transcripts
CREATE TABLE transcripts (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
    content TEXT,
    speakers JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge base
CREATE TABLE knowledge_bases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Documents
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    knowledge_base_id INTEGER REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255),
    s3_key VARCHAR(500),
    file_size INTEGER,
    content_type VARCHAR(100),
    extracted_text TEXT,
    embedding_vector vector(1536), -- For OpenAI embeddings
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notes (encrypted)
CREATE TABLE notes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
    encrypted_content TEXT,
    iv VARCHAR(255), -- Initialization vector for encryption
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Summaries
CREATE TABLE summaries (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
    content TEXT,
    key_decisions JSONB,
    action_items JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id INTEGER,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_oauth_user_platform ON oauth_integrations(user_id, platform);
CREATE INDEX idx_meetings_user_id ON meetings(user_id);
CREATE INDEX idx_documents_user_kb ON documents(user_id, knowledge_base_id);
CREATE INDEX idx_notes_user_meeting ON notes(user_id, meeting_id);
CREATE INDEX idx_audit_logs_user_action ON audit_logs(user_id, action);
```

## Docker Configuration

Create `backend/docker/docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: dao-copilot-db
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: dao-copilot-redis
    ports:
      - '6379:6379'
    restart: unless-stopped

  backend:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    container_name: dao-copilot-backend
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
    ports:
      - '3001:3001'
    depends_on:
      - postgres
      - redis
    volumes:
      - ../src:/app/src
    restart: unless-stopped

volumes:
  postgres_data:
```

## API Endpoints Structure

```
/api/v1/
├── auth/
│   ├── POST /register
│   ├── POST /login
│   ├── POST /refresh
│   ├── POST /logout
│   └── GET /profile
├── oauth/
│   ├── GET /zoom/authorize
│   ├── POST /zoom/callback
│   ├── GET /teams/authorize
│   ├── POST /teams/callback
│   └── GET /integrations
├── meetings/
│   ├── GET /
│   ├── POST /
│   ├── GET /:id
│   ├── PUT /:id
│   └── DELETE /:id
├── transcription/
│   ├── POST /start
│   ├── POST /stop
│   ├── GET /:meetingId
│   └── WebSocket /stream
├── documents/
│   ├── POST /upload
│   ├── GET /
│   ├── GET /:id
│   ├── DELETE /:id
│   └── POST /search
├── notes/
│   ├── GET /:meetingId
│   ├── POST /:meetingId
│   ├── PUT /:meetingId
│   └── GET /:meetingId/export
├── summaries/
│   ├── POST /:meetingId/generate
│   ├── GET /:meetingId
│   └── PUT /:meetingId
└── settings/
    ├── GET /
    ├── PUT /
    └── GET /audit-logs
```

## Security Implementation

### Authentication Middleware

```javascript
// middleware/auth.js
const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({error: 'Access token required'});
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({error: 'Invalid or expired token'});
    }
    req.user = user;
    next();
  });
};
```

### Rate Limiting

```javascript
// middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const createRateLimiter = (windowMs, max) => {
  return rateLimit({
    windowMs,
    max,
    message: 'Too many requests from this IP',
    standardHeaders: true,
    legacyHeaders: false,
  });
};

module.exports = {
  authLimiter: createRateLimiter(15 * 60 * 1000, 5), // 5 requests per 15 minutes
  apiLimiter: createRateLimiter(15 * 60 * 1000, 100), // 100 requests per 15 minutes
  uploadLimiter: createRateLimiter(60 * 60 * 1000, 10), // 10 uploads per hour
};
```

## Frontend Integration Points

### WebSocket Connection

```typescript
// frontend/src/services/websocket.ts
class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(token: string) {
    this.ws = new WebSocket(
      `ws://localhost:3001/api/v1/transcription/stream?token=${token}`,
    );

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleTranscriptionData(data);
    };

    this.ws.onclose = () => {
      this.handleReconnect();
    };
  }

  sendAudioChunk(audioData: ArrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
    }
  }
}
```

### Audio Capture Service

```typescript
// frontend/src/services/audio.ts
class AudioCaptureService {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;

  async startCapture(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.sendToTranscription(event.data);
        }
      };

      this.mediaRecorder.start(1000); // Send chunks every second
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      throw error;
    }
  }
}
```

This architecture provides a solid foundation for implementing all the features outlined in your tasks while maintaining security, privacy, and scalability.
