from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
from pathlib import Path
import json
import uuid
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
TASKS_FILE = BASE_DIR / "tasks.json"

app = FastAPI(title="Retro Planner API + Frontend")

# ---------- CORS (по факту почти не нужен, но пусть будет) ----------
origins = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Статика и главная страница ----------

# /static/* -> отдаем файлы (css, js и т.д.)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", response_class=FileResponse)
async def serve_index():
    """Главная страница планера."""
    return FileResponse(STATIC_DIR / "index.html")


# ---------- Работа с файлом задач ----------

def load_tasks_from_file() -> List[dict]:
    if not TASKS_FILE.exists():
        return []
    try:
        raw = TASKS_FILE.read_text(encoding="utf-8").strip()
        if not raw:
            return []
        return json.loads(raw)
    except Exception:
        # если tasks.json битый, не валим приложение
        return []


def save_tasks_to_file(tasks: List[dict]) -> None:
    TASKS_FILE.write_text(
        json.dumps(tasks, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ---------- Модели ----------

class Task(BaseModel):
    id: str
    text: str
    title: str
    category: str           # "work" | "personal"
    project: str            # "" или название проекта
    date: Optional[str]     # "YYYY-MM-DD" или None
    done: bool
    createdAt: str


class TaskCreate(BaseModel):
    text: str
    category: str
    project: Optional[str] = ""
    date: Optional[str] = None


class TaskPatch(BaseModel):
    text: Optional[str] = None
    category: Optional[str] = None
    project: Optional[str] = None
    date: Optional[str] = None
    done: Optional[bool] = None


# ---------- CRUD ----------

@app.get("/tasks", response_model=List[Task])
def get_tasks():
    return load_tasks_from_file()


@app.post("/tasks", response_model=Task)
def create_task(payload: TaskCreate):
    tasks = load_tasks_from_file()

    clean_text = payload.text.strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text is required")

    words = clean_text.split()
    title = " ".join(words[:5])

    task = {
        "id": str(uuid.uuid4()),
        "text": clean_text,
        "title": title,
        "category": payload.category,
        "project": payload.project or "",
        "date": payload.date or None,
        "done": False,
        "createdAt": datetime.utcnow().isoformat(),
    }

    tasks.insert(0, task)
    save_tasks_to_file(tasks)

    return task


@app.patch("/tasks/{task_id}", response_model=Task)
def update_task(task_id: str, patch: TaskPatch):
    tasks = load_tasks_from_file()
    for t in tasks:
        if t["id"] == task_id:
            if patch.text is not None:
                t["text"] = patch.text
                words = patch.text.strip().split()
                if words:
                    t["title"] = " ".join(words[:5])
            if patch.category is not None:
                t["category"] = patch.category
            if patch.project is not None:
                t["project"] = patch.project
            if patch.date is not None:
                t["date"] = patch.date
            if patch.done is not None:
                t["done"] = patch.done

            save_tasks_to_file(tasks)
            return t

    raise HTTPException(status_code=404, detail="Task not found")


@app.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: str):
    tasks = load_tasks_from_file()
    new_tasks = [t for t in tasks if t["id"] != task_id]
    if len(new_tasks) == len(tasks):
        raise HTTPException(status_code=404, detail="Task not found")
    save_tasks_to_file(new_tasks)
    return
