import { useCallback, useEffect, useState } from 'react';

type Quiz = { id: string; title: string; question_count: number };
type Player = { id: string; nickname: string; score: number };
type Question = { index: number; total: number; text: string; options: string[]; time_limit: number };
type Room = {
  pin: string;
  quiz_title: string;
  status: 'waiting' | 'playing' | 'finished';
  players: Player[];
  question: Question | null;
  question_index: number;
  question_count: number;
  leaderboard: { player_id: string; nickname: string; score: number }[];
  answers_received: number;
};

const API = (import.meta.env.VITE_API_BASE_URL || 'https://quizspark-api.onrender.com').replace(/\/$/, '');

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data as T;
}

export default function App() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [pin, setPin] = useState('');
  const [nickname, setNickname] = useState('');
  const [mode, setMode] = useState<'home' | 'host' | 'player'>('home');
  const [room, setRoom] = useState<Room | null>(null);
  const [hostToken, setHostToken] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [message, setMessage] = useState('Pick a quiz, host a room, or join a game.');
  const [loading, setLoading] = useState(false);
  const [answerBusy, setAnswerBusy] = useState(false);
  const [answerResult, setAnswerResult] = useState('');
  const [answeredQuestion, setAnsweredQuestion] = useState<number | null>(null);

  const loadQuizzes = useCallback(async () => {
    try {
      setQuizzes(await api<Quiz[]>('/api/quizzes'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load quizzes.');
    }
  }, []);

  useEffect(() => { void loadQuizzes(); }, [loadQuizzes]);

  const refreshRoom = useCallback(async () => {
    if (!pin || (mode !== 'host' && mode !== 'player')) return;
    try {
      const query = mode === 'host'
        ? `host_token=${encodeURIComponent(hostToken)}`
        : `player_id=${encodeURIComponent(playerId)}`;
      const data = await api<Room>(`/api/rooms/${encodeURIComponent(pin)}?${query}`);
      setRoom(data);
      if (data.status === 'finished') setMessage('Game complete! Check the final leaderboard.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not refresh the room.');
    }
  }, [pin, mode, hostToken, playerId]);

  useEffect(() => {
    if (mode !== 'host' && mode !== 'player') return;
    void refreshRoom();
    const timer = window.setInterval(() => { void refreshRoom(); }, 1800);
    return () => window.clearInterval(timer);
  }, [mode, refreshRoom]);

  async function hostQuiz(quizId: string) {
    setLoading(true);
    try {
      const data = await api<{ pin: string; host_token: string }>('/api/rooms?quiz_id=' + encodeURIComponent(quizId), { method: 'POST' });
      setPin(data.pin);
      setHostToken(data.host_token);
      setPlayerId('');
      setRoom(null);
      setMode('host');
      setMessage(`Room ${data.pin} created. Share the PIN with your players.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create room.');
    } finally { setLoading(false); }
  }

  async function joinGame() {
    setLoading(true);
    try {
      const data = await api<{ pin: string; player_id: string; nickname: string }>('/api/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ pin: pin.trim(), nickname: nickname.trim() }),
      });
      setPin(data.pin);
      setPlayerId(data.player_id);
      setHostToken('');
      setRoom(null);
      setAnswerResult('');
      setAnsweredQuestion(null);
      setMode('player');
      setMessage(`Welcome, ${data.nickname}! You're in the lobby.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not join room.');
    } finally { setLoading(false); }
  }

  async function startGame() {
    setLoading(true);
    try {
      const data = await api<Room>(`/api/rooms/${pin}/start`, {
        method: 'POST', body: JSON.stringify({ host_token: hostToken }),
      });
      setRoom(data);
      setAnswerResult('');
      setAnsweredQuestion(null);
      setMessage('Game started! Good luck, everyone.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start game.');
    } finally { setLoading(false); }
  }

  async function nextQuestion() {
    setLoading(true);
    try {
      const data = await api<Room>(`/api/rooms/${pin}/next`, {
        method: 'POST', body: JSON.stringify({ host_token: hostToken }),
      });
      setRoom(data);
      setAnswerResult('');
      setAnsweredQuestion(null);
      setMessage(data.status === 'finished' ? 'Final scores are ready!' : 'Next question is live.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not advance the game.');
    } finally { setLoading(false); }
  }

  async function submitAnswer(index: number) {
    if (!room || !room.question || answeredQuestion === room.question.index || answerBusy) return;
    setAnswerBusy(true);
    try {
      const result = await api<{ correct: boolean; points: number; score: number; message: string }>(
        `/api/rooms/${pin}/answer`,
        { method: 'POST', body: JSON.stringify({ player_id: playerId, answer_index: index }) },
      );
      setAnsweredQuestion(room.question.index);
      setAnswerResult(`${result.message} +${result.points} points. Your total: ${result.score}`);
      setMessage(result.message);
      await refreshRoom();
    } catch (error) {
      setAnswerResult(error instanceof Error ? error.message : 'Could not submit answer.');
    } finally { setAnswerBusy(false); }
  }

  function goHome() {
    setMode('home');
    setRoom(null);
    setHostToken('');
    setPlayerId('');
    setMessage('Pick a quiz, host a room, or join a game.');
  }

  return (
    <main className="page">
      <nav className="nav">
        <div className="brand"><span className="brand-icon">✦</span> quiz<span>spark</span></div>
        <span className="pill">PLAY • LEARN • SHINE</span>
      </nav>

      {mode === 'home' && <>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">YOUR NEXT BIG GAME NIGHT</div>
            <h1>Big brains.<br /><span>Bright energy.</span></h1>
            <p>Turn curious minds into a room full of champions. Make a quiz, bring your people, and let the fun begin.</p>
            <div className="hero-actions">
              <a className="button primary" href="#quizzes">Explore quizzes ↘</a>
              <a className="button secondary" href="#join">Join a game</a>
            </div>
            <div className="proof">⚡ 🦊 🐸 &nbsp; One room. Everyone can shine.</div>
          </div>
          <div className="character-stage">
            <div className="orb orb-one"></div><div className="orb orb-two"></div>
            <div className="character">🦊</div>
            <div className="character-label">Meet Zippy the Fox</div>
            <div className="float-card score">+ 120 XP ↗</div>
            <div className="float-card streak">🔥 3 answer streak</div>
          </div>
        </section>

        <section className="join-card" id="join">
          <div><div className="eyebrow">READY, PLAYER ONE?</div><h2>Jump into the action</h2><p>Enter the PIN your host shares with you.</p></div>
          <div className="join-form">
            <input aria-label="Game PIN" placeholder="Enter game PIN" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} maxLength={8} />
            <input aria-label="Nickname" placeholder="Your nickname" value={nickname} onChange={e => setNickname(e.target.value.slice(0, 24))} maxLength={24} />
            <button className="button dark" onClick={() => void joinGame()} disabled={loading || !pin.trim() || !nickname.trim()}>{loading ? 'Joining…' : 'Join game →'}</button>
          </div>
        </section>

        <section className="quiz-section" id="quizzes">
          <div className="section-heading"><div><div className="eyebrow">PICK YOUR CHALLENGE</div><h2>Choose your brain boost</h2></div><span className="count">{quizzes.length} quizzes</span></div>
          <div className="quiz-grid">
            {quizzes.map((q, i) => <article className={`quiz-card card-${i % 3}`} key={q.id}>
              <div className="quiz-art">{['🚀', '🧠', '🌈'][i % 3]}</div>
              <div className="quiz-meta"><span>{q.question_count} QUESTIONS</span><span>✦ QUICK PLAY</span></div>
              <h3>{q.title}</h3><p>A little challenge, a lot of fun. Gather your crew and see who shines.</p>
              <button className="button card-button" onClick={() => void hostQuiz(q.id)} disabled={loading}>{loading ? 'Creating…' : 'Host this quiz →'}</button>
            </article>)}
            {!quizzes.length && <div className="empty">Loading quizzes…</div>}
          </div>
        </section>
      </>}

      {mode !== 'home' && <section className="game-panel">
        <div className="eyebrow">{mode === 'host' ? 'HOST CONTROL ROOM' : 'YOU ARE IN THE GAME'}</div>
        <h1>{room?.quiz_title || 'Getting your room ready…'}</h1>
        <div className="room-pin">GAME PIN <strong>{pin}</strong></div>
        <p>Share this PIN with players so they can join from their own devices.</p>

        {room?.status === 'waiting' && <>
          <h2>Waiting for players</h2>
          <div className="player-list">
            {room.players.map(p => <div className="player-chip" key={p.id}>🟣 {p.nickname}</div>)}
            {!room.players.length && <p>No players yet. Open the website on another device and join with this PIN.</p>}
          </div>
          {mode === 'host' && <button className="button primary game-action" onClick={() => void startGame()} disabled={loading || room.players.length === 0}>{loading ? 'Starting…' : 'Start game →'}</button>}
          {mode === 'player' && <p>You're in! Wait for the host to start the quiz.</p>}
        </>}

        {room?.status === 'playing' && room.question && <>
          <div className="question-progress">QUESTION {room.question.index + 1} OF {room.question.total}</div>
          <h2 className="question-text">{room.question.text}</h2>
          {mode === 'player' && <>
            <div className="answer-grid">
              {room.question.options.map((option, i) => <button className="answer-option" key={option + i} onClick={() => void submitAnswer(i)} disabled={answeredQuestion === room.question!.index || answerBusy}>
                <span>{['A', 'B', 'C', 'D', 'E', 'F'][i]}</span>{option}
              </button>)}
            </div>
            {answerResult && <div className="answer-feedback" role="status">{answerResult}</div>}
            {answeredQuestion === room.question.index && <p>Answer received. Waiting for the host to continue.</p>}
          </>}
          {mode === 'host' && <>
            <p>Answers received: {room.answers_received} / {room.players.length}</p>
            <h3>Live scores</h3>
            <Leaderboard room={room} />
            <button className="button primary game-action" onClick={() => void nextQuestion()} disabled={loading}>{loading ? 'Loading…' : room.question.index + 1 === room.question.total ? 'Finish game 🏆' : 'Next question →'}</button>
          </>}
          {mode === 'player' && <div className="my-score">Your score: {room.leaderboard.find(p => p.player_id === playerId)?.score ?? 0}</div>}
        </>}

        {room?.status === 'finished' && <>
          <h2>🏆 Final leaderboard</h2>
          <Leaderboard room={room} />
          <p>Thanks for playing QuizSpark!</p>
          <button className="button primary game-action" onClick={goHome}>Back to home</button>
        </>}

        <button className="button secondary game-action" onClick={goHome}>Leave game / Home</button>
      </section>}

      <div className="toast" role="status">{message}</div>
      <footer><div className="brand"><span className="brand-icon">✦</span> quiz<span>spark</span></div><span>Bright minds. Big moments.</span></footer>
    </main>
  );
}

function Leaderboard({ room }: { room: Room }) {
  return <div className="leaderboard">
    {room.leaderboard.map((p, i) => <div className="leader-row" key={p.player_id}>
      <strong>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</strong>
      <span>{p.nickname}</span><b>{p.score} pts</b>
    </div>)}
    {!room.leaderboard.length && <p>No players yet.</p>}
  </div>;
}
