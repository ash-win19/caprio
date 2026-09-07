# Caprio

Caprio turns a conversation about today's work and constraints into a realistic daily plan that the user reviews before saving. See [the daily workflow](docs/daily-workflow.md) for the page map, state transitions, and agent boundary.

## Mastra

The repository root contains the Mastra service used to define and manage Caprio agents. The React application remains in `frontend/`, and the Go API remains in `backend/`.

To run Mastra Studio locally:

1. Copy `.env.example` to `.env` and set `GOOGLE_GENERATIVE_AI_API_KEY`.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open `http://localhost:4111`.

The Mastra platform deploys `src/mastra` from the repository root. In its GitHub setup screen, mark this repository as a monorepo and use `main` for both the server and Studio branches.
