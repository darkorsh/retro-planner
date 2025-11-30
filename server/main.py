import os
import json
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import (
    create_engine,
    Column,
    String,
    Boolean,
    Text,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# =========================
#   НАСТРОЙКА БАЗЫ
# =========================

# Если DATABASE_URL не задана -> локально используем SQLite файл tasks.db
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    # Render / PostgreSQL
    connect_args = {}
else:
    # Локальный fallback: SQLite
    DATABASE_URL = "sqlite:///./tasks.db"
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class TaskORM(Base):
    __tablename__ = "tasks"

    # id остаётся строкой, как и раньше
    id = Column(String, primary_key=True, index=True)
    text = Column(Text, nullable=False)
    title = Column(String, nullable=False)
    category = Column(String, nullable=False)
    project = Column(String, nullable=False, default="")
    # дату храним как строку "YYYY-MM-DD" или None
    date = Column(String, nullable=True)
    done = Column(Boolean, nullable=False, default=False)
    # createdAt тоже как строку ISO
    createdAt = Column(String, nullable=False)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =========================
#   МОДЕЛИ ДЛЯ API
# =========================


class Task(BaseModel):
    id: str
    text: str
    title: str
    category: str
    project: str
    date: Optional[str] = None  # "YYYY-MM-DD" или None
    done: bool
    createdAt: str

    class Config:
        orm_mode = True


class TaskCreate(BaseModel):
    text: str
    category: str
    project: str
    date: Optional[str] = None


class TaskPatch(BaseModel):
    text: Optional[str] = None
    category: Optional[str] = None
    project: Optional[str] = None
    date: Optional[str] = None
    done: Optional[bool] = None


# =========================
#   УТИЛИТЫ
# =========================


def generate_id() -> str:
    return str(uuid.uuid4())


def make_title(text: str) -> str:
    # Берём первые 5 слов описания
    words = text.strip().split()
    return " ".join(words[:5]) if words else "Без названия"


# Путь до старого файла с задачами (если он есть)
TASKS_FILE = Path(__file__).parent / "tasks.json"


def migrate_from_file_if_needed():
    # если база уже есть — мигрировать не нужно
    if os.path.exists("tasks.db"):
        return

    if not os.path.exists("tasks.json"):
        return

    print("⏳ Мигрируем задачи из tasks.json в SQLite...")

    with open("tasks.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    # data может быть либо словарём {"tasks": [...]}, либо просто списком [...]
    if isinstance(data, list):
        tasks = data
    elif isinstance(data, dict):
        tasks = data.get("tasks") or []
    else:
        tasks = []

    # дальше оставь как было — вставка задач в БД
    with SessionLocal() as db:
        for t in tasks:
            task = TaskModel(
                id=t.get("id"),
                text=t.get("text", ""),
                title=t.get("title", ""),
                category=t.get("category") or "work",
                project=t.get("project") or "",
                date=t.get("date"),
                done=t.get("done", False),
                created_at=t.get("createdAt") or t.get("created_at"),
            )
            db.add(task)
        db.commit()

    print("✅ Миграция завершена.")


# =========================
#   FASTAPI ПРИЛОЖЕНИЕ
# =========================

app = FastAPI()

# CORS — оставим максимально открытым, планер свой
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Статика: index.html, main.js, style.css лежат в server/static
app.mount("/", StaticFiles(directory="static", html=True), name="static")


@app.on_event("startup")
def on_startup():
    migrate_from_file_if_needed()


# =========================
#   ЭНДПОИНТЫ /TASKS
# =========================


@app.get("/tasks", response_model=List[Task])
def get_tasks(db: Session = Depends(get_db)):
    tasks = db.query(TaskORM).order_by(TaskORM.createdAt).all()
    return tasks


@app.post("/tasks", response_model=Task)
def create_task(payload: TaskCreate, db: Session = Depends(get_db)):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Текст задачи не может быть пустым")

    from datetime import datetime

    task = TaskORM(
        id=generate_id(),
        text=text,
        title=make_title(text),
        category=payload.category or "work",
        project=payload.project or "",
        date=payload.date,
        done=False,
        createdAt=datetime.utcnow().isoformat(),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@app.patch("/tasks/{task_id}", response_model=Task)
def update_task(task_id: str, patch: TaskPatch, db: Session = Depends(get_db)):
    task: TaskORM = db.query(TaskORM).filter(TaskORM.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    if patch.text is not None:
        task.text = patch.text
        # если меняем текст, имеет смысл обновить и title,
        # если ты хочешь — можно убрать это поведение
        task.title = make_title(patch.text)

    if patch.category is not None:
        task.category = patch.category

    if patch.project is not None:
        task.project = patch.project

    if patch.date is not None:
        task.date = patch.date

    if patch.done is not None:
        task.done = patch.done

    db.commit()
    db.refresh(task)
    return task


@app.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: str, db: Session = Depends(get_db)):
    task: TaskORM = db.query(TaskORM).filter(TaskORM.id == task_id).first()
    if not task:
        # фронту всё равно — 204 или 404, но 404 честнее
        raise HTTPException(status_code=404, detail="Задача не найдена")

    db.delete(task)
    db.commit()
    return
