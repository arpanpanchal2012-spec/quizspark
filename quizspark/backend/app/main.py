import os
import random
import string
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import socketio

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
app = FastAPI(title="QuizSpark API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in FRONTEND_ORIGIN.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*", logger=False, engineio_logger=False)
rooms: Dict[str, dict] = {}

class Question(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    options: List[str] = Field(min_length=2, max_length=6)
    correct_index: int = Field(ge=0)
    time_limit: int = Field(default=20, ge=5, le=120)

class QuizCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    questions: List[Question] = Field(min_length=1, max_length=100)

class JoinRoom(BaseModel):
    pin: str = Field(min_length=4, max_length=8)
    nickname: str = Field(min_length=1, max_length=24)

demo_quizzes = [{
    "id": "demo-1", "title": "Bright Minds: Starter Quiz",
    "questions": [
        {"text": "Which planet is known as the Red Planet?", "options": ["Venus", "Mars", "Jupiter", "Mercury"], "correct_index": 1, "time_limit": 20},
        {"text": "How many sides does a hexagon have?", "options": ["Five", "Six", "Seven", "Eight"], "correct_index": 1, "time_limit": 15},
    ]
}]

@app.get("/")
def root():
    return {"name": "QuizSpark API", "version": "0.1.0", "docs": "/docs"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/quizzes")
def list_quizzes():
    return [{"id": q["id"], "title": q["title"], "question_count": len(q["questions"])} for q in demo_quizzes]

@app.get("/api/quizzes/{quiz_id}")
def get_quiz(quiz_id: str):
    for quiz in demo_quizzes:
        if quiz["id"] == quiz_id:
            return quiz
    raise HTTPException(status_code=404, detail="Quiz not found")

@app.post("/api/quizzes", status_code=201)
def create_quiz(payload: QuizCreate):
    for q in payload.questions:
        if q.correct_index >= len(q.options):
            raise HTTPException(status_code=422, detail="correct_index must match an option")
    quiz = {"id": "quiz-" + "".join(random.choices(string.ascii_lowercase + string.digits, k=8)),
            "title": payload.title, "questions": [q.model_dump() for q in payload.questions]}
    demo_quizzes.append(quiz)
    return quiz

@app.post("/api/rooms", status_code=201)
def create_room(quiz_id: str):
    quiz = next((q for q in demo_quizzes if q["id"] == quiz_id), None)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    pin = "".join(random.choices(string.digits, k=6))
    while pin in rooms:
        pin = "".join(random.choices(string.digits, k=6))
    rooms[pin] = {"pin": pin, "quiz_id": quiz_id, "status": "waiting", "players": {}, "current_question": 0}
    return {"pin": pin, "quiz_id": quiz_id, "status": "waiting"}

@app.post("/api/rooms/join")
def join_room(payload: JoinRoom):
    room = rooms.get(payload.pin)
    if not room:
        raise HTTPException(status_code=404, detail="Game PIN not found")
    player_id = "p-" + "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    room["players"][player_id] = {"id": player_id, "nickname": payload.nickname, "score": 0}
    return {"player_id": player_id, "pin": payload.pin, "nickname": payload.nickname}

@sio.event
async def connect(sid, environ, auth=None):
    await sio.emit("connected", {"ok": True}, to=sid)

@sio.event
async def join_game(sid, data):
    pin = str(data.get("pin", ""))
    if pin not in rooms:
        await sio.emit("game_error", {"message": "Game PIN not found"}, to=sid)
        return
    await sio.enter_room(sid, pin)
    await sio.emit("room_update", {"pin": pin, "players": list(rooms[pin]["players"].values())}, room=pin)

@sio.event
async def start_game(sid, data):
    pin = str(data.get("pin", ""))
    room = rooms.get(pin)
    if not room:
        await sio.emit("game_error", {"message": "Game PIN not found"}, to=sid)
        return
    room["status"] = "playing"
    await sio.emit("game_started", {"pin": pin, "question_index": room["current_question"]}, room=pin)

@sio.event
async def submit_answer(sid, data):
    pin = str(data.get("pin", ""))
    room = rooms.get(pin)
    if not room:
        await sio.emit("game_error", {"message": "Game PIN not found"}, to=sid)
        return
    # Server-side answer validation/scoring is intentionally the next hardening step.
    await sio.emit("answer_received", {"ok": True}, to=sid)

socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
