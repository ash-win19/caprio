# Caprio Deployment Guide

## Production Architecture

- **Frontend**: Deployed on Vercel at https://trycaprio.vercel.app (from `/frontend`)
- **Backend (Go)**: Deployed separately (likely Render/Railway) 
- **Mastra Server**: Node.js service for AI agents (this repo root)

## Deploying Mastra Server

The Mastra server provides the general conversation agent used by the chat feature.

### Option 1: Vercel (Recommended for this repo)

1. Create a new Vercel project for the Mastra server (separate from frontend)
2. Link it to this repo root (not `/frontend`)
3. Set the root directory to `/` (repo root)
4. Add environment variables in Vercel dashboard:
   - `GOOGLE_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` (required)

Deploy command:
```bash
vercel --prod
```

The Mastra server will be available at your Vercel URL (e.g., `https://caprio-mastra.vercel.app`)

### Option 2: Mastra Platform

Use Mastra's hosted platform:

```bash
# Login to Mastra platform
npx mastra login

# Deploy to production
npx mastra deploy --env production --yes
```

This will provide a stable URL for your Mastra server.

### Option 3: Docker + Railway/Render

Create a `Dockerfile` for the Mastra server:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
CMD ["npm", "start"]
EXPOSE 4111
```

Deploy to Railway/Render and set environment variables.

## Backend Configuration

Once the Mastra server is deployed, configure the Go backend:

1. Set `MASTRA_URL` environment variable to your Mastra server URL
   - Example: `MASTRA_URL=https://caprio-mastra.vercel.app`
   - For Railway: `MASTRA_URL=https://your-app.railway.app`
   
2. Ensure `GOOGLE_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` is set on the Mastra server

## Environment Variables

### Mastra Server (Node.js)
- `GOOGLE_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` - Required for Google Gemini

### Go Backend
- `MASTRA_URL` - URL of deployed Mastra server (default: `http://localhost:4111`)
- All other existing env vars (database, Auth0, etc.)

### Frontend
- `VITE_API_BASE_URL` - URL of Go backend API

## Testing the Setup

1. Start Mastra locally: `npm run dev` (runs on port 4111)
2. Start Go backend: `cd backend && go run cmd/api/main.go`
3. Start frontend: `cd frontend && npm run dev`
4. Visit http://localhost:5173 and test the chat

The chat should now return conversational responses instead of "Sorry, something went wrong."
