# Caprio frontend

The frontend requires these variables at build time:

```dotenv
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your-auth0-client-id
```

Set both variables in `.env.local` for local development and in the Vercel project settings for deployments. The app stops during startup when either variable is missing.
