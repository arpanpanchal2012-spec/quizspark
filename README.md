# QuizSpark — live quiz platform starter

A Kahoot-inspired original quiz platform starter using React + Vite + TypeScript, FastAPI + Socket.IO, and Supabase Postgres/Auth. It includes a working local demo flow, database schema, health endpoints, realtime room events, and automated tests. It is a foundation to expand feature-by-feature, not a claim that every advanced production feature is already implemented. The current API stores demo quizzes and rooms in process memory; the Supabase schema is included but application-level persistence/auth wiring is a subsequent implementation step. Do not use this starter as a public production service until scoring, authorization, persistence, and abuse protections are completed.

## Project layout
- `frontend/` React web UI and installable PWA shell
- `backend/` FastAPI API + Socket.IO realtime server
- `supabase/schema.sql` database tables, indexes, and RLS policies
- `render.yaml` Render Blueprint (backend and static frontend)
- `.env.example` environment variable template
- `tests/` backend API tests

## Local setup
Prerequisites: Node.js 20+, Python 3.11+.

1. Copy `.env.example` to `.env` and fill values when using Supabase. Local demo can run without Supabase.
2. Backend:
   ```bash
   cd backend
   python -m venv .venv
   # Linux/macOS:
   source .venv/bin/activate
   # Windows PowerShell:
   # .venv\\Scripts\\Activate.ps1
   pip install -r requirements.txt
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
3. Frontend in another terminal:
   ```bash
   cd frontend
   npm install
   npm run dev -- --host 0.0.0.0
   ```
4. Open the Vite URL shown in the terminal. Backend health: `http://localhost:8000/health`.

## Tests
```bash
cd backend
pip install -r requirements.txt
pytest -q
```
Frontend:
```bash
cd frontend
npm install
npm run build
```

## Supabase setup
1. Create a project at https://supabase.com/dashboard.
2. Open SQL Editor and run `supabase/schema.sql`.
3. In Project Settings → API, copy the Project URL and anon/publishable key to frontend environment variables.
4. Add the URL and anon key to Render environment variables. Never put the `service_role` key in the frontend or commit it to Git.
5. For production, configure Supabase Auth redirect URLs to your deployed Render frontend URL.

## Render deployment
1. Push this project to a GitHub repository.
2. In Render, choose **New → Blueprint**, connect the repository, and confirm `render.yaml`.
3. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` on the backend service if using Supabase features.
4. Set `VITE_API_BASE_URL` on the static site to the deployed backend URL (e.g. `https://quizspark-api.onrender.com`), then redeploy the static site.
5. In backend environment variables, set `FRONTEND_ORIGIN` to the deployed static-site URL.
6. Verify `/health`, open the website, create a demo quiz, and join a room.

Free-tier caveats: free web services may sleep, cold-start, or have limited resources; a sleeping backend is not ideal for a live hosted quiz. Use the lowest-cost paid instance if reliable live events become important.

## Android
The web app is responsive and includes a manifest, icons, and a basic service worker for PWA installation/offline shell caching. To package it as an Android app after deployment:
```bash
cd frontend
npm install
npm run build
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init QuizSpark com.example.quizspark --web-dir dist
npx cap add android
npx cap sync android
npx cap open android
```
This requires Android Studio/Android SDK on a computer for a normal signed APK build. The PWA can be installed directly from Chrome on Android without an APK.

## Feature roadmap
1. Quiz authoring + question validation (starter UI)
2. Room creation and join-by-PIN with Socket.IO
3. Timed answer submission, scoring, and leaderboard
4. Authenticated quiz ownership, saved quizzes, public discovery
5. Image/media uploads, quiz imports, moderation and reports
6. Analytics, classroom controls, accessibility, rate limits, abuse prevention
7. Android packaging, E2E browser tests, load testing, monitoring

Security notes: the included RLS policies are a starting point. Before public launch, add robust ownership checks, server-side scoring, room authorization, rate limits, input validation, and tests for malicious clients.
