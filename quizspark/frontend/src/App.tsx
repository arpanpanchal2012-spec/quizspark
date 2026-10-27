import { useEffect, useState } from 'react';

type Quiz = { id: string; title: string; question_count?: number; questions?: {text:string; options:string[]; correct_index:number; time_limit:number}[] };
const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function App() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [pin, setPin] = useState('');
  const [nickname, setNickname] = useState('');
  const [message, setMessage] = useState('Pick a quiz, host a room, or jump into a game.');
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      const r = await fetch(`${API}/api/quizzes`);
      if (!r.ok) throw new Error('API unavailable');
      setQuizzes(await r.json());
    } catch { setMessage('API is not reachable yet. Start the backend or set VITE_API_BASE_URL.'); }
  }
  useEffect(() => { void load(); }, []);

  async function host(id: string) {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/rooms?quiz_id=${encodeURIComponent(id)}`, {method:'POST'});
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Could not create room');
      setPin(data.pin); setMessage(`Your game room is ready. Share PIN ${data.pin} with players.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setLoading(false); }
  }
  async function join() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/rooms/join`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin,nickname})});
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Could not join room');
      setMessage(`Welcome, ${data.nickname}! You joined room ${data.pin}. Live question play is the next build milestone.`);
    } catch(e) { setMessage(e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setLoading(false); }
  }
  return <main className="page">
    <nav className="nav"><div className="brand"><span className="brand-icon">✦</span> quiz<span>spark</span></div><span className="pill">PLAY • LEARN • SHINE</span></nav>
    <section className="hero">
      <div className="hero-copy"><div className="eyebrow">YOUR NEXT BIG GAME NIGHT</div><h1>Big brains.<br/><span>Bright energy.</span></h1><p>Turn curious minds into a room full of champions. Make a quiz, bring your people, and let the fun begin.</p><div className="hero-actions"><a className="button primary" href="#quizzes">Explore quizzes <span>↘</span></a><a className="button secondary" href="#join">Join a game</a></div><div className="proof"><span className="avatars"><b>⚡</b><b>🦊</b><b>🐸</b></span><span>One room. Everyone can shine.</span></div></div>
      <div className="character-stage"><div className="spark s1">✦</div><div className="spark s2">✧</div><div className="orb orb-one"></div><div className="orb orb-two"></div><div className="character">🦊</div><div className="character-label">Meet Zippy the Fox</div><div className="float-card score">+ 120 XP <span>↗</span></div><div className="float-card streak">🔥 3 answer streak</div><div className="confetti c1">✦</div><div className="confetti c2">✦</div></div>
    </section>
    <section className="join-card" id="join"><div><div className="eyebrow">READY, PLAYER ONE?</div><h2>Jump into the action</h2><p>Got a game PIN? Join your host in seconds.</p></div><div className="join-form"><input aria-label="Game PIN" placeholder="Enter game PIN" value={pin} onChange={e=>setPin(e.target.value)} maxLength={8}/><input aria-label="Nickname" placeholder="Your nickname" value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={24}/><button className="button dark" onClick={()=>void join()} disabled={loading || !pin.trim() || !nickname.trim()}>Join game →</button></div></section>
    <section className="quiz-section" id="quizzes"><div className="section-heading"><div><div className="eyebrow">PICK YOUR CHALLENGE</div><h2>Choose your brain boost</h2></div><span className="count">{quizzes.length} featured</span></div>
      <div className="quiz-grid">{quizzes.map((q,i)=><article className={`quiz-card card-${i%3}`} key={q.id}><div className="quiz-art">{['🚀','🧠','🌈'][i%3]}</div><div className="quiz-meta"><span>{q.question_count ?? 2} QUESTIONS</span><span>✦ QUICK PLAY</span></div><h3>{q.title}</h3><p>A little challenge, a lot of fun. Gather your crew and see who shines.</p><button className="button card-button" onClick={()=>void host(q.id)} disabled={loading}>Host this quiz <span>→</span></button></article>)}
      {!quizzes.length && <div className="empty">Loading the good stuff…</div>}</div>
    </section>
    <section className="feature-row"><div><span>🎯</span><b>Quick to join</b><p>One PIN gets everyone together.</p></div><div><span>⚡</span><b>Made for momentum</b><p>Fast rounds keep the room buzzing.</p></div><div><span>🏆</span><b>Celebrate progress</b><p>Every round is a chance to shine.</p></div></section>
    <footer><div className="brand"><span className="brand-icon">✦</span> quiz<span>spark</span></div><span>Original characters. Shared moments. Bright minds.</span></footer>
    <div className="toast" role="status">{message}</div>
  </main>
}
