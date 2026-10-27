import os
import random
import string
import time
import secrets
from typing import Dict, List

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import socketio

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "*")
app = FastAPI(title="QuizSpark API", version="0.2.0")

origins = [x.strip() for x in FRONTEND_ORIGIN.split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=bool(origins and "*" not in origins),
    allow_methods=["*"],
    allow_headers=["*"],
)

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

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


class RoomAction(BaseModel):
    host_token: str


class AnswerSubmission(BaseModel):
    player_id: str
    answer_index: int = Field(ge=0, le=5)


demo_quizzes = [{
    "id": "demo-1",
    "title": "Bright Minds: Starter Quiz",
    "questions": [
        {
            "text": "Which planet is known as the Red Planet?",
            "options": ["Venus", "Mars", "Jupiter", "Mercury"],
            "correct_index": 1,
            "time_limit": 20,
        },
        {
            "text": "How many sides does a hexagon have?",
            "options": ["Five", "Six", "Seven", "Eight"],
            "correct_index": 1,
            "time_limit": 15,
        },
    ],
}]


def find_quiz(quiz_id: str):
    return next((q for q in demo_quizzes if q["id"] == quiz_id), None)


def require_host(pin: str, token: str):
    room = rooms.get(pin)
    if not room:
        raise HTTPException(status_code=404, detail="Game PIN not found")
    if not secrets.compare_digest(room["host_token"], token or ""):
        raise HTTPException(status_code=403, detail="Only the host can do that")
    return room


def public_question(room):
    quiz = find_quiz(room["quiz_id"])
    if not quiz or room["status"] != "playing":
        return None
    index = room["current_question"]
    if index >= len(quiz["questions"]):
        return None
    q = quiz["questions"][index]
    return {
        "index": index,
        "total": len(quiz["questions"]),
        "text": q["text"],
        "options": q["options"],
        "time_limit": q["time_limit"],
    }


def leaderboard(room):
    return sorted(
        [
            {
                "player_id": p["id"],
                "nickname": p["nickname"],
                "score": p["score"],
                "answered": p["answered"],
            }
            for p in room["players"].values()
        ],
        key=lambda p: (-p["score"], p["nickname"].lower()),
    )


def room_snapshot(room):
    quiz = find_quiz(room["quiz_id"])
    question = public_question(room)
    return {
        "pin": room["pin"],
        "quiz_id": room["quiz_id"],
        "quiz_title": quiz["title"] if quiz else "Quiz",
        "status": room["status"],
        "players": [
            {"id": p["id"], "nickname": p["nickname"], "score": p["score"]}
            for p in room["players"].values()
        ],
        "question": question,
        "question_index": room["current_question"],
        "question_count": len(quiz["questions"]) if quiz else 0,
        "leaderboard": leaderboard(room),
        "answers_received": sum(
            1 for p in room["players"].values()
            if p.get("last_answer_question") == room["current_question"]
        ),
    }


@app.get("/")
def root():
    return {"name": "QuizSpark API", "version": "0.2.0", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/quizzes")
def list_quizzes():
    return [
        {"id": q["id"], "title": q["title"], "question_count": len(q["questions"])}
        for q in demo_quizzes
    ]


@app.get("/api/quizzes/{quiz_id}")
def get_quiz(quiz_id: str):
    quiz = find_quiz(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return {
        "id": quiz["id"],
        "title": quiz["title"],
        "question_count": len(quiz["questions"]),
        "questions": [
            {
                "text": q["text"],
                "options": q["options"],
                "time_limit": q["time_limit"],
            }
            for q in quiz["questions"]
        ],
    }


@app.post("/api/quizzes", status_code=201)
def create_quiz(payload: QuizCreate):
    for q in payload.questions:
        if q.correct_index >= len(q.options):
            raise HTTPException(
                status_code=422,
                detail="correct_index must match an option",
            )
    quiz = {
        "id": "quiz-" + "".join(random.choices(string.ascii_lowercase + string.digits, k=8)),
        "title": payload.title.strip(),
        "questions": [q.model_dump() for q in payload.questions],
    }
    demo_quizzes.append(quiz)
    return {
        "id": quiz["id"],
        "title": quiz["title"],
        "question_count": len(quiz["questions"]),
    }


@app.post("/api/rooms", status_code=201)
def create_room(quiz_id: str):
    quiz = find_quiz(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    pin = "".join(random.choices(string.digits, k=6))
    while pin in rooms:
        pin = "".join(random.choices(string.digits, k=6))

    host_token = secrets.token_urlsafe(24)
    rooms[pin] = {
        "pin": pin,
        "quiz_id": quiz_id,
        "host_token": host_token,
        "status": "waiting",
        "players": {},
        "current_question": 0,
        "question_started_at": None,
    }
    return {
        "pin": pin,
        "quiz_id": quiz_id,
        "host_token": host_token,
        "status": "waiting",
    }


@app.post("/api/rooms/join")
async def join_room(payload: JoinRoom):
    pin = payload.pin.strip()
    nickname = payload.nickname.strip()
    room = rooms.get(pin)
    if not room:
        raise HTTPException(status_code=404, detail="Game PIN not found. Ask the host to create a room.")
    if room["status"] != "waiting":
        raise HTTPException(status_code=409, detail="This game has already started.")
    if not nickname:
        raise HTTPException(status_code=422, detail="Enter a nickname.")
    if any(p["nickname"].casefold() == nickname.casefold() for p in room["players"].values()):
        raise HTTPException(status_code=409, detail="That nickname is already in use in this room.")

    player_id = "p-" + secrets.token_urlsafe(12)
    room["players"][player_id] = {
        "id": player_id,
        "nickname": nickname,
        "score": 0,
        "answers": {},
        "answered": False,
        "last_answer_question": None,
    }
    await sio.emit("room_update", room_snapshot(room), room=pin)
    return {"player_id": player_id, "pin": pin, "nickname": nickname}


@app.get("/api/rooms/{pin}")
def get_room(pin: str, player_id: str = "", host_token: str = ""):
    room = rooms.get(pin)
    if not room:
        raise HTTPException(status_code=404, detail="Game PIN not found")
    if host_token:
        require_host(pin, host_token)
    elif player_id not in room["players"]:
        raise HTTPException(status_code=403, detail="Join this room to view the game.")
    return room_snapshot(room)


@app.post("/api/rooms/{pin}/start")
async def start_game(pin: str, payload: RoomAction):
    room = require_host(pin, payload.host_token)
    if room["status"] != "waiting":
        raise HTTPException(status_code=409, detail="This game has already started.")
    if not room["players"]:
        raise HTTPException(status_code=409, detail="Wait for at least one player to join.")
    room["status"] = "playing"
    room["current_question"] = 0
    room["question_started_at"] = time.time()
    for player in room["players"].values():
        player["answered"] = False
        player["last_answer_question"] = None
    snapshot = room_snapshot(room)
    await sio.emit("game_update", snapshot, room=pin)
    return snapshot


@app.post("/api/rooms/{pin}/answer")
async def submit_answer(pin: str, payload: AnswerSubmission):
    room = rooms.get(pin)
    if not room:
        raise HTTPException(status_code=404, detail="Game PIN not found")
    if room["status"] != "playing":
        raise HTTPException(status_code=409, detail="The game is not accepting answers.")
    player = room["players"].get(payload.player_id)
    if not player:
        raise HTTPException(status_code=403, detail="Player is not in this room.")

    quiz = find_quiz(room["quiz_id"])
    q_index = room["current_question"]
    if not quiz or q_index >= len(quiz["questions"]):
        raise HTTPException(status_code=409, detail="No active question.")
    if player.get("last_answer_question") == q_index:
        raise HTTPException(status_code=409, detail="You already answered this question.")

    q = quiz["questions"][q_index]
    if payload.answer_index >= len(q["options"]):
        raise HTTPException(status_code=422, detail="Choose one of the available answers.")

    elapsed = max(0, time.time() - (room["question_started_at"] or time.time()))
    correct = payload.answer_index == q["correct_index"]
    points = max(100, int(1000 * (1 - min(elapsed, q["time_limit"]) / q["time_limit"]))) if correct else 0

    player["score"] += points
    player["answers"][str(q_index)] = {
        "answer_index": payload.answer_index,
        "correct": correct,
        "points": points,
    }
    player["answered"] = True
    player["last_answer_question"] = q_index

    snapshot = room_snapshot(room)
    await sio.emit("game_update", snapshot, room=pin)
    return {
        "correct": correct,
        "points": points,
        "score": player["score"],
        "message": "Correct! Great job!" if correct else "Not quite. Keep going!",
    }


@app.post("/api/rooms/{pin}/next")
async def next_question(pin: str, payload: RoomAction):
    room = require_host(pin, payload.host_token)
    if room["status"] != "playing":
        raise HTTPException(status_code=409, detail="The game is not in progress.")

    quiz = find_quiz(room["quiz_id"])
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found.")

    if room["current_question"] + 1 >= len(quiz["questions"]):
        room["status"] = "finished"
        room["question_started_at"] = None
    else:
        room["current_question"] += 1
        room["question_started_at"] = time.time()
        for player in room["players"].values():
            player["answered"] = False

    snapshot = room_snapshot(room)
    await sio.emit("game_update", snapshot, room=pin)
    return snapshot


@sio.event
async def connect(sid, environ, auth=None):
    await sio.emit("connected", {"ok": True}, to=sid)


@sio.event
async def join_game(sid, data):
    pin = str(data.get("pin", "")).strip()
    if pin not in rooms:
        await sio.emit("game_error", {"message": "Game PIN not found"}, to=sid)
        return
    await sio.enter_room(sid, pin)
    await sio.emit("room_update", room_snapshot(rooms[pin]), room=pin)


socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
