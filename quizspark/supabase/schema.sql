-- QuizSpark starter schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'Player',
  avatar_key text not null default 'zippy',
  created_at timestamptz not null default now()
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  visibility text not null default 'private' check (visibility in ('private','unlisted','public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  position integer not null check (position >= 0),
  prompt text not null check (char_length(prompt) between 1 and 500),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  correct_index integer not null check (correct_index >= 0),
  time_limit_seconds integer not null default 20 check (time_limit_seconds between 5 and 120),
  points integer not null default 1000 check (points between 0 and 10000),
  unique (quiz_id, position)
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  pin text not null unique check (pin ~ '^[0-9]{6}$'),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  host_id uuid references auth.users(id) on delete set null,
  status text not null default 'waiting' check (status in ('waiting','playing','finished')),
  current_question integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  score integer not null default 0,
  joined_at timestamptz not null default now()
);

create table if not exists public.answer_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null references public.game_players(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_index integer not null check (selected_index >= 0),
  is_correct boolean not null,
  points_awarded integer not null default 0,
  answered_at timestamptz not null default now(),
  unique (player_id, question_id)
);

create index if not exists questions_quiz_position_idx on public.questions(quiz_id, position);
create index if not exists game_players_session_score_idx on public.game_players(session_id, score desc);
create index if not exists answer_events_session_idx on public.answer_events(session_id);

alter table public.profiles enable row level security;
alter table public.quizzes enable row level security;
alter table public.questions enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_players enable row level security;
alter table public.answer_events enable row level security;

-- Users can see/edit their own profile. Public quiz discovery is read-only.
create policy "profile owner reads" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profile owner inserts" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profile owner updates" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "quiz owner manages" on public.quizzes for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "public quizzes readable" on public.quizzes for select to anon, authenticated
  using (visibility = 'public');

create policy "questions owner manages" on public.questions for all to authenticated
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = auth.uid()))
  with check (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = auth.uid()));
create policy "public quiz questions readable" on public.questions for select to anon, authenticated
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and q.visibility = 'public'));

-- Live-session writes should go through a trusted backend, not anon client writes.
create policy "players readable for live sessions" on public.game_players for select to authenticated using (true);
-- Deliberately no client write policies for sessions/answers/players. Add authenticated server-side operations before launch.
