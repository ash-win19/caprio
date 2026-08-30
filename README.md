# caprio
AI-powered daily task reprioritization app with voice input and category progress tracking.

## Mastra

The repository root contains the Mastra service used to define and manage Caprio agents. The React application remains in `frontend/`, and the Go API remains in `backend/`.

To run Mastra Studio locally:

1. Copy `.env.example` to `.env` and set `GOOGLE_GENERATIVE_AI_API_KEY`.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open `http://localhost:4111`.

The Mastra platform deploys `src/mastra` from the repository root. In its GitHub setup screen, mark this repository as a monorepo and use `main` for both the server and Studio branches.
