<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Voice Pro

Voice recording, transcription, and transcript-aware chat. Gemini requests are made only by server-side API handlers; the browser bundle never receives the Gemini API key.

View your app in AI Studio: https://ai.studio/apps/735cfda4-4ba8-499b-b657-343ad7b6061a

## Security boundary

- `GEMINI_API_KEY` is read only in `api/_lib/gemini.js`.
- `/api/transcribe` and `/api/chat` require `VOICE_APP_ACCESS_TOKEN` through the `x-voice-access-token` header.
- The browser keeps that access token in session storage only and clears it after an authorization failure or when **Reset AI access** is selected.
- Audio is limited to 3 MB in the client and approximately 3 MB after server-side base64 validation.
- Do not deploy this as a public service until both secrets are configured and the hosted API routes have passed runtime QA.

This shared-token boundary is appropriate for a private personal deployment. A multi-user deployment should replace it with real identity, per-user authorization, rate limiting, and abuse monitoring.

## Run locally

Prerequisite: Node.js 20 or newer.


1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to the environment configuration used by your server runtime. Set a Gemini server key and a long random access token.

3. Start the frontend during development:

   ```bash
   npm run dev
   ```

The `api/` directory uses serverless-style request handlers. For a full local end-to-end run, use a host that serves those handlers and injects the two server environment variables. The Vite development server alone serves the UI but does not execute `/api/*`.

## Models

- Transcription: `gemini-3.6-flash` by default; override with `GEMINI_TRANSCRIPTION_MODEL`.
- Chat: `gemini-3.1-pro-preview` by default; override with `GEMINI_CHAT_MODEL`.

Review current Gemini model availability before production deployment.

## Quality gate

```bash
npm run check
```

This runs the security-boundary tests, TypeScript checks, production build, and production-dependency vulnerability audit. GitHub Actions runs the same gate for pull requests and pushes to `main`.
