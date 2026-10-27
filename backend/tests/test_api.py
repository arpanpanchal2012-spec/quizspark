from fastapi.testclient import TestClient
from app.main import app, demo_quizzes

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_list_quizzes_contains_demo():
    response = client.get("/api/quizzes")
    assert response.status_code == 200
    assert any(q["id"] == "demo-1" for q in response.json())

def test_get_missing_quiz_is_404():
    assert client.get("/api/quizzes/not-a-real-quiz").status_code == 404

def test_create_quiz_and_validate_answer_index():
    response = client.post("/api/quizzes", json={
        "title": "Test quiz",
        "questions": [{"text": "2+2?", "options": ["3", "4"], "correct_index": 1, "time_limit": 10}]
    })
    assert response.status_code == 201
    assert response.json()["title"] == "Test quiz"

def test_invalid_answer_index_rejected():
    response = client.post("/api/quizzes", json={
        "title": "Bad quiz",
        "questions": [{"text": "2+2?", "options": ["3", "4"], "correct_index": 9, "time_limit": 10}]
    })
    assert response.status_code == 422
