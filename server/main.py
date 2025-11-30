import os
import json
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlalchemy import (
    create_engine,
    Column,
    String,
    Boolean,
    Text,
    ForeignKey,
    Index,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship


# =========================
#   НАСТРОЙКА БАЗЫ
# =========================

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


# =========================
#   МОДЕЛИ ORM
# =========================

class UserORM(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(String, nullable=False)

    tasks = relationship("TaskORM", back_populates="user")


class SessionORM(Base):
    __tablename__ = "sessions"

    token = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    user = relationship("UserORM")


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

    # привязка к пользователю
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    user = relationship("UserORM", back_populates="tasks")


Index("ix_tasks_user_id_createdAt", TaskORM.user_id, TaskORM.createdAt)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =========================
#   МОДЕЛИ ДЛЯ API
# =========================

class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    created_at: str

    class Config:
        orm_mode = True


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class AuthToken(BaseModel):
    token: str
    user: UserPublic


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


def hash_password(password: str) -> str:
    """
    Простейший хэш. В продакшн так не делаем, но для личного планера ок.
    """
    import hashlib

    salt = os.getenv("PASSWORD_SALT", "retro-planner-salt")
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    return hash_password(password) == password_hash


def create_session(db: Session, user_id: str) -> str:
    token = uuid.uuid4().hex
    session = SessionORM(token=token, user_id=user_id)
    db.add(session)
    db.commit()
    return token


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> UserORM:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Не авторизовано")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Не авторизовано")

    session = db.query(SessionORM).filter(SessionORM.token == token).first()
    if not session:
        raise HTTPException(status_code=401, detail="Токен недействителен")

    user = db.query(UserORM).filter(UserORM.id == session.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Пользователь не найден")

    return user


# Путь до старого файла с задачами (если он есть)
TASKS_FILE = Path(__file__).parent / "tasks.json"


def migrate_from_file_if_needed():
    """
    Разовая миграция из tasks.json в SQLite и создание демо-пользователя.
    Если tasks.db уже есть – ничего не делаем.
    """
    if os.path.exists("tasks.db"):
        return

    if not TASKS_FILE.exists():
        return

    print("⏳ Мигрируем задачи из tasks.json в SQLite...")

    with open(TASKS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, list):
        tasks_data = data
    elif isinstance(data, dict):
        tasks_data = data.get("tasks") or []
    else:
        tasks_data = []

    from datetime import datetime

    with SessionLocal() as db:
        # создаём демо-пользователя, чтобы старые задачи не потерялись
        demo_user = UserORM(
            id=generate_id(),
            email="demo@local",
            name="Demo user",
            password_hash=hash_password("demo"),
            created_at=datetime.utcnow().isoformat(),
        )
        db.add(demo_user)
        db.commit()
        db.refresh(demo_user)

        for t in tasks_data:
            task = TaskORM(
                id=t.get("id") or generate_id(),
                text=t.get("text", ""),
                title=t.get("title") or make_title(t.get("text", "")),
                category=t.get("category") or "work",
                project=t.get("project") or "",
                date=t.get("date"),
                done=t.get("done", False),
                createdAt=t.get("createdAt")
                or t.get("created_at")
                or datetime.utcnow().isoformat(),
                user_id=demo_user.id,
            )
            db.add(task)
        db.commit()

    print("✅ Миграция завершена. Логин для старых задач: demo@local / demo")


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


@app.on_event("startup")
def on_startup():
    # создаём таблицы в БД, если их ещё нет
    Base.metadata.create_all(bind=engine)

    # мигрируем из tasks.json в SQLite (если нужно)
    migrate_from_file_if_needed()


# =========================
#   ЭНДПОИНТЫ AUTH
# =========================

from datetime import datetime


@app.post("/auth/register", response_model=AuthToken)
def register_user(payload: UserCreate, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()

    existing = db.query(UserORM).filter(UserORM.email == email).first()
    if existing:
        raise HTTPException(
            status_code=400, detail="Пользователь с таким email уже существует"
        )

    user = UserORM(
        id=generate_id(),
        email=email,
        name=payload.name.strip() or email,
        password_hash=hash_password(payload.password),
        created_at=datetime.utcnow().isoformat(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_session(db, user.id)
    return AuthToken(token=token, user=user)


@app.post("/auth/login", response_model=AuthToken)
def login_user(payload: UserLogin, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.query(UserORM).filter(UserORM.email == email).first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Неверный email или пароль")

    token = create_session(db, user.id)
    return AuthToken(token=token, user=user)


@app.post("/auth/logout", status_code=204)
def logout_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        # тихо игнорируем
        return
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return
    db.query(SessionORM).filter(SessionORM.token == token).delete()
    db.commit()
    return


# =======================
#   ЭНДПОИНТЫ /TASKS
# =======================

@app.get("/tasks", response_model=List[Task])
def get_tasks(
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tasks = (
        db.query(TaskORM)
        .filter(TaskORM.user_id == current_user.id)
        .order_by(TaskORM.createdAt)
        .all()
    )
    return tasks


@app.post("/tasks", response_model=Task)
def create_task(
    payload: TaskCreate,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Текст задачи не может быть пустым")

    task = TaskORM(
        id=generate_id(),
        text=text,
        title=make_title(text),
        category=payload.category or "work",
        project=payload.project or "",
        date=payload.date,
        done=False,
        createdAt=datetime.utcnow().isoformat(),
        user_id=current_user.id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@app.patch("/tasks/{task_id}", response_model=Task)
def update_task(
    task_id: str,
    patch: TaskPatch,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task: TaskORM = (
        db.query(TaskORM)
        .filter(TaskORM.id == task_id, TaskORM.user_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    if patch.text is not None:
        task.text = patch.text
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
def delete_task(
    task_id: str,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task: TaskORM = (
        db.query(TaskORM)
        .filter(TaskORM.id == task_id, TaskORM.user_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    db.delete(task)
    db.commit()
    return


# Статика: index.html, main.js, style.css лежат в ./static
app.mount("/", StaticFiles(directory="static", html=True), name="static")
