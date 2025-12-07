// ===============================
//  RETRO PLANNER CORE + AUTH
// ===============================

// ---------- DOM-ссылки ----------

// Экран захвата
const descEl = document.getElementById("taskDescription");
const categoryWorkEl = document.getElementById("category-work");
const categoryPersonalEl = document.getElementById("category-personal");
const projectSelectEl = document.getElementById("projectSelect");
const dateInputEl = document.getElementById("taskDate");
const saveBtnEl = document.getElementById("saveTaskBtn");

// Проекты (хедер)
const newProjectNameEl = document.getElementById("new-project-name");
const addProjectBtnEl = document.getElementById("add-project-btn");

// Модалка задачи
const taskModalEl = document.getElementById("taskModal");
const taskModalTitleEl = document.getElementById("taskModalTitle");
const taskModalMetaEl = document.getElementById("taskModalMeta");
const taskModalTextareaEl = document.getElementById("taskModalTextarea");
const taskModalCloseEl = document.getElementById("taskModalClose");
const taskModalCancelBtnEl = document.getElementById("taskModalCancelBtn");
const taskModalSaveBtnEl = document.getElementById("taskModalSaveBtn");
const taskModalDeleteBtnEl = document.getElementById("taskModalDeleteBtn");
const taskModalProjectSelectEl = document.getElementById("taskModalProjectSelect");
const taskModalDateEl = document.getElementById("taskModalDate");

// Auth / user
const userPanelEl = document.getElementById("userPanel");
const authModalEl = document.getElementById("authModal");
const authModalCloseEl = document.getElementById("authModalClose");
const authCancelBtnEl = document.getElementById("authCancelBtn");
const authSubmitBtnEl = document.getElementById("authSubmitBtn");
const authNameEl = document.getElementById("authName");
const authEmailEl = document.getElementById("authEmail");
const authPasswordEl = document.getElementById("authPassword");
const authErrorEl = document.getElementById("authError");
const authTabs = document.querySelectorAll(".auth-tab");
const authModalTitleEl = document.getElementById("authModalTitle");
const authModalSubtitleEl = document.getElementById("authModalSubtitle");

// Контейнеры списков
const streamListEl = document.getElementById("streamList");
const todayListEl = document.getElementById("todayList");
const projectsListEl = document.getElementById("projectsList");

// Доп. элементы
const todayDateEl = document.getElementById("today-date");
const todayEmptyEl = document.getElementById("today-empty");
const streamEmptyEl = document.getElementById("stream-empty");
const projectsEmptyEl = document.getElementById("projects-empty");
const todayFilterDateEl = document.getElementById("todayFilterDate");
let todayFilterDate = null; // null => используем "сегодня"

// Выполненные
const doneListEl = document.getElementById("doneList");
const doneEmptyEl = document.getElementById("done-empty");

// Навигация
const navButtons = document.querySelectorAll("[data-screen]");

// Фильтры Потока
const streamFilterChips = document.querySelectorAll("#screen-stream .chip");

// ---------- Состояние ----------

let state = {
  tasks: [],
  // "ручные" проекты: созданные через + ПРОЕКТ
  projects: []
};

let currentModalTaskId = null;
let streamFilter = "all"; // all | work | personal

// authState: токен + публичные данные пользователя
let authState = {
  token: null,
  user: null,
  mode: "login" // login | register
};


// =======================
//          API
// =======================

// один сервер и локально, и на Render
const API_BASE = "";

// вспомогательная функция: заголовки с токеном
function authHeaders() {
  if (!authState.token) return {};
  return {
    Authorization: "Bearer " + authState.token
  };
}

// универсальная обёртка над fetch
async function apiFetch(url, options = {}) {
  const opts = {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...authHeaders()
    }
  };

  const res = await fetch(url, opts);

  if (res.status === 401) {
    setAuth(null, null);
    throw new Error("UNAUTHORIZED");
  }

  return res;
}


async function apiLoadTasks() {
  try {
    const res = await apiFetch(`${API_BASE}/tasks`);
    if (!res.ok) {
      console.error("Не удалось загрузить задачи", res.status);
      return;
    }
    const data = await res.json();
    state.tasks = data;
    renderAll();
  } catch (e) {
    console.error("Ошибка при загрузке задач", e);
  }
}

async function apiCreateTask(payload) {
  try {
    const res = await apiFetch(`${API_BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.error("Не удалось создать задачу", res.status);
      return;
    }
    const task = await res.json();
    state.tasks.unshift(task);
    renderAll();
  } catch (e) {
    console.error("Ошибка при создании задачи", e);
  }
}

async function apiUpdateTask(id, patch) {
  try {
    const res = await apiFetch(`${API_BASE}/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (!res.ok) {
      console.error("Не удалось обновить задачу", res.status);
      return;
    }
    const updated = await res.json();
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      state.tasks[idx] = updated;
    }
    renderAll();
  } catch (e) {
    console.error("Ошибка при обновлении задачи", e);
  }
}

async function apiDeleteTask(id) {
  try {
    const res = await apiFetch(`${API_BASE}/tasks/${id}`, {
      method: "DELETE"
    });
    if (!res.ok && res.status !== 204) {
      console.error("Не удалось удалить задачу", res.status);
      return;
    }
    state.tasks = state.tasks.filter(t => t.id !== id);
    renderAll();
  } catch (e) {
    console.error("Ошибка при удалении задачи", e);
  }
}

// -------- AUTH API --------

async function apiAuthLogin(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.detail || "Не удалось войти";
    throw new Error(msg);
  }

  return data; // { token, user }
}

async function apiAuthRegister(name, email, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.detail || "Не удалось зарегистрироваться";
    throw new Error(msg);
  }

  return data; // { token, user }
}


// ---------- Утилиты ----------

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatRuDate(iso) {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
}

function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}


// Список имён проектов = явные проекты + все project из задач
function getProjectNames() {
  const set = new Set();
  // из состояния
  for (const name of state.projects) {
    if (name && name.trim()) set.add(name.trim());
  }
  // из задач
  for (const t of state.tasks) {
    if (t.project && t.project.trim()) set.add(t.project.trim());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
}

// Обновление options в select на экране Захвата
function renderProjectSelectOptions() {
  if (!projectSelectEl) return;

  const projectNames = getProjectNames();

  projectSelectEl.innerHTML = "";
  const emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.textContent = "— без проекта —";
  projectSelectEl.appendChild(emptyOpt);

  for (const name of projectNames) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    projectSelectEl.appendChild(opt);
  }
}


// =======================
//      AUTH STATE & UI
// =======================

function loadAuthFromStorage() {
  try {
    const raw = localStorage.getItem("retro_auth");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.token && parsed.user) {
      authState.token = parsed.token;
      authState.user = parsed.user;
    }
  } catch (e) {
    console.warn("Не удалось прочитать auth из localStorage", e);
  }
}

function setAuth(token, user) {
  authState.token = token;
  authState.user = user;

  if (token && user) {
    localStorage.setItem("retro_auth", JSON.stringify({ token, user }));
  } else {
    localStorage.removeItem("retro_auth");
  }

  renderUserPanel();
}

function renderUserPanel() {
  if (!userPanelEl) return;

  userPanelEl.innerHTML = "";

  // Если не авторизован – показываем кнопку "ВОЙТИ"
  if (!authState.user) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "topbar__user-btn";
    btn.textContent = "ВОЙТИ";
    btn.addEventListener("click", () => openAuthModal("login"));
    userPanelEl.appendChild(btn);
    return;
  }

  // Имя пользователя
  const nameSpan = document.createElement("span");
  nameSpan.className = "topbar__user-name";
  nameSpan.textContent = authState.user.name || authState.user.email;

  // Кнопка "ВЫЙТИ"
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "topbar__user-btn";
  btn.textContent = "ВЫЙТИ";
  btn.addEventListener("click", handleLogout);

  // Добавляем только имя и кнопку
  userPanelEl.appendChild(nameSpan);
  userPanelEl.appendChild(btn);
}


function requireAuth() {
  if (!authState.token) {
    openAuthModal("login");
    return false;
  }
  return true;
}

async function handleLogout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: authHeaders()
    });
  } catch (e) {
    // и ладно
  } finally {
    setAuth(null, null);
    state.tasks = [];
    renderAll();
  }
}


// --- модалка логина / регистрации ---

function openAuthModal(mode = "login") {
  authState.mode = mode;

  if (authErrorEl) {
    authErrorEl.style.display = "none";
    authErrorEl.textContent = "";
  }

  if (authNameEl) authNameEl.value = "";
  if (authEmailEl) authEmailEl.value = "";
  if (authPasswordEl) authPasswordEl.value = "";

  updateAuthModeUI();

  if (authModalEl) {
    authModalEl.classList.remove("hidden");
  }
}

function closeAuthModal() {
  if (!authModalEl) return;
  authModalEl.classList.add("hidden");

  if (authErrorEl) authErrorEl.style.display = "none";
  if (authPasswordEl) authPasswordEl.value = "";
}

function updateAuthModeUI() {
  authTabs.forEach(tab => {
    const tabMode = tab.dataset.mode;
    tab.classList.toggle("auth-tab--active", tabMode === authState.mode);
  });

  if (authState.mode === "login") {
    if (authModalTitleEl) authModalTitleEl.textContent = "Вход";
    if (authModalSubtitleEl)
      authModalSubtitleEl.textContent =
        "Вернись к своим делишкам. Нужны только почта и пароль.";
    if (authNameEl) authNameEl.closest("div")?.style && (authNameEl.closest("div").style.display = "block");
  } else {
    if (authModalTitleEl) authModalTitleEl.textContent = "Регистрация";
    if (authModalSubtitleEl)
      authModalSubtitleEl.textContent =
        "Создадим новый профиль для классной девчонки или парня.";
  }
}

// =======================
//  Создание и обновление задач
// =======================

function createTask({ text, category, project, date }) {
  const cleanText = (text || "").trim();
  if (!cleanText) return;

  // без авторизации не лезем в /tasks, а сразу открываем модалку логина
  if (!requireAuth()) return;

  apiCreateTask({
    text: cleanText,
    category: category || "work",
    project: project || "",
    date: date || null
  });
}

function toggleTaskDone(taskId, done) {
  apiUpdateTask(taskId, { done });
}

// ---------- Модалка задачи ----------

function openTaskModal(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || !taskModalEl) return;

  currentModalTaskId = task.id;

  taskModalTitleEl.textContent = task.title || "БЕЗ НАЗВАНИЯ";

  const catLabel = task.category === "work" ? "Рабочее" : "Личное";
  const projLabel = task.project ? ` • Проект: ${task.project}` : "";
  const dateLabel = task.date ? ` • Когда: ${formatRuDate(task.date)}` : "";
  taskModalMetaEl.textContent = `${catLabel}${projLabel}${dateLabel}`;

  taskModalTextareaEl.value = task.text || "";
  autoResizeTextarea(taskModalTextareaEl);

  function handleTextareaInput() {
    autoResizeTextarea(taskModalTextareaEl);
  }

  taskModalTextareaEl.removeEventListener("input", handleTextareaInput);
  taskModalTextareaEl.addEventListener("input", handleTextareaInput);

  // заполняем список проектов
  if (taskModalProjectSelectEl) {
    const projectNames = getProjectNames();

    taskModalProjectSelectEl.innerHTML = "";

    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "— без проекта —";
    taskModalProjectSelectEl.appendChild(emptyOpt);

    for (const name of projectNames) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (task.project === name) {
        opt.selected = true;
      }
      taskModalProjectSelectEl.appendChild(opt);
    }
  }

  // дата
  if (taskModalDateEl) {
    taskModalDateEl.value = task.date || "";
  }

  taskModalEl.classList.remove("hidden");
}

function closeTaskModal() {
  currentModalTaskId = null;
  if (taskModalEl) {
    taskModalEl.classList.add("hidden");
  }
}

// ---------- Рендеры ----------

function renderStream() {
  if (!streamListEl) return;
  streamListEl.innerHTML = "";

  let tasks = state.tasks.filter(t => !t.project && !t.done);

  if (streamFilter === "work") {
    tasks = tasks.filter(t => t.category === "work");
  } else if (streamFilter === "personal") {
    tasks = tasks.filter(t => t.category === "personal");
  }

  if (!tasks.length) {
    if (streamEmptyEl) streamEmptyEl.style.display = "block";
    return;
  }
  if (streamEmptyEl) streamEmptyEl.style.display = "none";

  for (const task of tasks) {
    const li = document.createElement("li");
    li.className = "task-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-item__checkbox";
    checkbox.checked = task.done;
    checkbox.addEventListener("change", () => toggleTaskDone(task.id, checkbox.checked));

    const meta = document.createElement("div");
    meta.className = "task-item__meta";

    const titleEl = document.createElement("div");
    titleEl.className = "task-item__title";
    titleEl.textContent = task.title || task.text;
    titleEl.addEventListener("click", () => openTaskModal(task.id));

    const infoEl = document.createElement("div");
    infoEl.className = "task-item__info";
    const catLabel = task.category === "work" ? "Рабочее" : "Личное";
    const dateLabel = task.date ? " • до " + formatRuDate(task.date) : "";
    infoEl.textContent = catLabel + dateLabel;

    meta.appendChild(titleEl);
    meta.appendChild(infoEl);

    li.appendChild(checkbox);
    li.appendChild(meta);
    streamListEl.appendChild(li);
  }
}

function renderToday() {
  if (!todayListEl) return;
  todayListEl.innerHTML = "";

  const today = getTodayISO();
  const date = todayFilterDate || today;

  if (todayFilterDateEl && !todayFilterDateEl.value) {
    todayFilterDateEl.value = date;
  }

  if (todayDateEl) {
    todayDateEl.textContent = "Задачи на: " + formatRuDate(date);
  }

  const tasks = state.tasks.filter(t => t.date === date && !t.done);

  if (!tasks.length) {
    if (todayEmptyEl) todayEmptyEl.style.display = "block";
    return;
  }
  if (todayEmptyEl) todayEmptyEl.style.display = "none";

  for (const task of tasks) {
    const li = document.createElement("li");
    li.className = "task-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-item__checkbox";
    checkbox.checked = task.done;
    checkbox.addEventListener("change", () => toggleTaskDone(task.id, checkbox.checked));

    const meta = document.createElement("div");
    meta.className = "task-item__meta";

    const titleEl = document.createElement("div");
    titleEl.className = "task-item__title";
    titleEl.textContent = task.title || task.text;
    titleEl.addEventListener("click", () => openTaskModal(task.id));

    const infoEl = document.createElement("div");
    infoEl.className = "task-item__info";
    const catLabel = task.category === "work" ? "Рабочее" : "Личное";
    const projectLabel = task.project ? " • проект: " + task.project : "";
    infoEl.textContent = catLabel + projectLabel;

    meta.appendChild(titleEl);
    meta.appendChild(infoEl);

    li.appendChild(checkbox);
    li.appendChild(meta);
    todayListEl.appendChild(li);
  }
}

function renderProjects() {
  if (!projectsListEl) return;
  projectsListEl.innerHTML = "";

  const projectNames = getProjectNames();

  if (!projectNames.length) {
    if (projectsEmptyEl) projectsEmptyEl.style.display = "block";
    return;
  }
  if (projectsEmptyEl) projectsEmptyEl.style.display = "none";

  for (const projectName of projectNames) {
    const tasks = state.tasks.filter(t => t.project === projectName);
    const total = tasks.length;
    const done = tasks.filter(t => t.done).length;

    const itemEl = document.createElement("li");
    itemEl.className = "project-item";

    // header проекта
    const headerEl = document.createElement("div");
    headerEl.className = "project-item__header";

    const leftEl = document.createElement("div");
    leftEl.className = "project-item__left";

    const nameEl = document.createElement("div");
    nameEl.className = "project-item__name";
    nameEl.textContent = projectName;

    const countEl = document.createElement("div");
    countEl.className = "project-item__count";
    countEl.textContent = `${done}/${total} завершено`;

    leftEl.appendChild(nameEl);
    leftEl.appendChild(countEl);

    const controlsEl = document.createElement("div");
    controlsEl.className = "project-item__controls";

    const toggleEl = document.createElement("button");
    toggleEl.type = "button";
    toggleEl.className = "project-item__toggle";
    toggleEl.textContent = "▸";

    const deleteProjectBtn = document.createElement("button");
    deleteProjectBtn.type = "button";
    deleteProjectBtn.className = "project-item__delete";
    deleteProjectBtn.textContent = "✕";

    controlsEl.appendChild(toggleEl);
    controlsEl.appendChild(deleteProjectBtn);

    headerEl.appendChild(leftEl);
    headerEl.appendChild(controlsEl);

    // тело проекта
    const bodyEl = document.createElement("div");
    bodyEl.className = "project-item__body project-item__body--collapsed";

    const tasksListEl = document.createElement("ul");
    tasksListEl.className = "project-task-list";

    const sortedTasks = tasks.slice().sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    for (const task of sortedTasks) {
      const taskLi = document.createElement("li");
      taskLi.className = "task-item" + (task.done ? " task-item--done" : "");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "task-item__checkbox";
      checkbox.checked = task.done;
      checkbox.addEventListener("change", () => {
        toggleTaskDone(task.id, checkbox.checked);
      });

      const meta = document.createElement("div");
      meta.className = "task-item__meta";

      const titleEl = document.createElement("div");
      titleEl.className = "task-item__title";
      titleEl.textContent = task.title || task.text;
      titleEl.addEventListener("click", () => openTaskModal(task.id));

      const infoEl = document.createElement("div");
      infoEl.className = "task-item__info";
      const catLabel = task.category === "work" ? "Рабочее" : "Личное";
      const dateLabel = task.date ? ` • когда: ${formatRuDate(task.date)}` : "";
      infoEl.textContent = `${catLabel}${dateLabel}`;

      meta.appendChild(titleEl);
      meta.appendChild(infoEl);

      taskLi.appendChild(checkbox);
      taskLi.appendChild(meta);
      tasksListEl.appendChild(taskLi);
    }

    // форма добавления задачи в этот проект
    const addWrapperEl = document.createElement("div");
    addWrapperEl.className = "project-add";

    const addInputEl = document.createElement("input");
    addInputEl.type = "text";
    addInputEl.className = "input-text project-add__input";
    addInputEl.placeholder = "Новая задача в этом проекте";

    const addDateEl = document.createElement("input");
    addDateEl.type = "date";
    addDateEl.className = "project-add__date";

    const addBtnEl = document.createElement("button");
    addBtnEl.type = "button";
    addBtnEl.className = "btn-secondary project-add__btn";
    addBtnEl.textContent = "+ Добавить";

    function submitNewTask() {
      const text = addInputEl.value.trim();
      if (!text) return;

      const date = addDateEl.value || null;

      createTask({
        text,
        category: "work",
        project: projectName,
        date
      });

      addInputEl.value = "";
      addDateEl.value = "";
    }

    addBtnEl.addEventListener("click", submitNewTask);
    addInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitNewTask();
      }
    });

    addWrapperEl.appendChild(addInputEl);
    addWrapperEl.appendChild(addDateEl);
    addWrapperEl.appendChild(addBtnEl);

    bodyEl.appendChild(tasksListEl);
    bodyEl.appendChild(addWrapperEl);

    function toggleProject() {
      const isCollapsed = bodyEl.classList.contains("project-item__body--collapsed");
      if (isCollapsed) {
        bodyEl.classList.remove("project-item__body--collapsed");
        toggleEl.textContent = "▾";
      } else {
        bodyEl.classList.add("project-item__body--collapsed");
        toggleEl.textContent = "▸";
      }
    }

    function deleteProject() {
      const ok = confirm(`Удалить проект "${projectName}"? Все задачи перейдут в "без проекта".`);
      if (!ok) return;

      const idx = state.projects.indexOf(projectName);
      if (idx !== -1) {
        state.projects.splice(idx, 1);
      }

      const tasksInProject = state.tasks.filter(t => t.project === projectName);
      for (const task of tasksInProject) {
        apiUpdateTask(task.id, { project: "" });
      }
    }

    headerEl.addEventListener("click", toggleProject);

    toggleEl.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleProject();
    });

    deleteProjectBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteProject();
    });

    itemEl.appendChild(headerEl);
    itemEl.appendChild(bodyEl);
    projectsListEl.appendChild(itemEl);
  }
}

function renderDone() {
  if (!doneListEl) return;
  doneListEl.innerHTML = "";

  const tasks = state.tasks.filter(t => t.done);

  if (!tasks.length) {
    if (doneEmptyEl) doneEmptyEl.style.display = "block";
    return;
  }
  if (doneEmptyEl) doneEmptyEl.style.display = "none";

  for (const task of tasks) {
    const li = document.createElement("li");
    li.className = "task-item task-item--done";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-item__checkbox";
    checkbox.checked = true;
    checkbox.addEventListener("change", () => {
      toggleTaskDone(task.id, checkbox.checked);
    });

    const meta = document.createElement("div");
    meta.className = "task-item__meta";

    const titleEl = document.createElement("div");
    titleEl.className = "task-item__title";
    titleEl.textContent = task.title || task.text;
    titleEl.addEventListener("click", () => openTaskModal(task.id));

    const infoEl = document.createElement("div");
    infoEl.className = "task-item__info";
    const catLabel = task.category === "work" ? "Рабочее" : "Личное";
    const projectLabel = task.project ? ` • проект: ${task.project}` : "";
    const dateLabel = task.date ? ` • когда: ${formatRuDate(task.date)}` : "";
    infoEl.textContent = `${catLabel}${projectLabel}${dateLabel}`;

    meta.appendChild(titleEl);
    meta.appendChild(infoEl);

    li.appendChild(checkbox);
    li.appendChild(meta);

    doneListEl.appendChild(li);
  }
}

function renderAll() {
  renderStream();
  renderToday();
  renderProjects();
  renderDone();
  renderProjectSelectOptions();
}

// ---------- Навигация ----------

function showScreen(name) {
  const targetId = "screen-" + name;
  document.querySelectorAll(".screen").forEach(sec => {
    sec.classList.toggle("screen--active", sec.id === targetId);
  });

  navButtons.forEach(btn => {
    btn.classList.toggle("nav-btn--active", btn.dataset.screen === name);
  });
}

// ---------- Обработчики ----------

function handleSaveTask() {
  if (!descEl) return;

  const text = descEl.value;
  const category =
    categoryPersonalEl && categoryPersonalEl.checked ? "personal" : "work";
  const project = projectSelectEl ? projectSelectEl.value : "";
  const date = dateInputEl ? (dateInputEl.value || null) : null;

  createTask({ text, category, project, date });

  descEl.value = "";
}

if (taskModalDeleteBtnEl) {
  taskModalDeleteBtnEl.addEventListener("click", () => {
    if (!currentModalTaskId) return;

    const ok = confirm("Удалить задачу навсегда?");
    if (!ok) return;

    apiDeleteTask(currentModalTaskId);
    closeTaskModal();
  });
}

// Ctrl+Enter в textarea
if (descEl) {
  descEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSaveTask();
    }
  });
}

// Кнопка СОХРАНИТЬ
if (saveBtnEl) {
  saveBtnEl.addEventListener("click", (e) => {
    e.preventDefault();
    handleSaveTask();
  });
}

// Кнопки навигации
navButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const screen = btn.dataset.screen;
    if (!screen) return;
    showScreen(screen);
  });
});

// Фильтры Потока
streamFilterChips.forEach(chip => {
  chip.addEventListener("click", () => {
    const filter = chip.dataset.filter || "all";
    streamFilter = filter;

    streamFilterChips.forEach(c => {
      c.classList.toggle("chip--active", c === chip);
    });

    renderStream();
  });
});

// Добавление проекта через + ПРОЕКТ
function handleAddProject() {
  if (!newProjectNameEl) return;
  const name = newProjectNameEl.value.trim();
  if (!name) return;

  if (!state.projects.includes(name)) {
    state.projects.push(name);
  }
  newProjectNameEl.value = "";
  renderAll();
}

if (addProjectBtnEl) {
  addProjectBtnEl.addEventListener("click", (e) => {
    e.preventDefault();
    handleAddProject();
  });
}

if (newProjectNameEl) {
  newProjectNameEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddProject();
    }
  });
}

if (todayFilterDateEl) {
  todayFilterDateEl.addEventListener("change", () => {
    todayFilterDate = todayFilterDateEl.value || null;
    renderToday();
  });
}

// Модалка задачи: кнопки
if (taskModalCloseEl) {
  taskModalCloseEl.addEventListener("click", closeTaskModal);
}
if (taskModalCancelBtnEl) {
  taskModalCancelBtnEl.addEventListener("click", closeTaskModal);
}
if (taskModalEl) {
  taskModalEl.addEventListener("click", (e) => {
    if (e.target === taskModalEl || e.target.classList.contains("modal__backdrop")) {
      closeTaskModal();
    }
  });
}
if (taskModalSaveBtnEl) {
  taskModalSaveBtnEl.addEventListener("click", () => {
    if (!currentModalTaskId) return;

    const patch = {
      text: taskModalTextareaEl ? (taskModalTextareaEl.value || "") : undefined,
      project: taskModalProjectSelectEl ? (taskModalProjectSelectEl.value || "") : undefined,
      date: taskModalDateEl ? (taskModalDateEl.value || null) : undefined
    };

    apiUpdateTask(currentModalTaskId, patch);
    closeTaskModal();
  });
}

// Auth модалка: события

authTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const mode = tab.dataset.mode || "login";
    authState.mode = mode;
    updateAuthModeUI();
  });
});

if (authModalCloseEl) {
  authModalCloseEl.addEventListener("click", closeAuthModal);
}
if (authCancelBtnEl) {
  authCancelBtnEl.addEventListener("click", closeAuthModal);
}
if (authModalEl) {
  authModalEl.addEventListener("click", (e) => {
    if (e.target === authModalEl || e.target.classList.contains("modal__backdrop")) {
      closeAuthModal();
    }
  });
}
if (authSubmitBtnEl) {
  authSubmitBtnEl.addEventListener("click", async () => {
    if (!authEmailEl || !authPasswordEl) return;

    const email = authEmailEl.value.trim();
    const password = authPasswordEl.value;

    if (!email || !password) {
      authErrorEl.textContent = "Нужно ввести почту и пароль.";
      authErrorEl.style.display = "block";
      return;
    }

    if (authState.mode === "register") {
      const name = authNameEl?.value.trim() || email;
      if (!name) {
        authErrorEl.textContent = "Имя обязательно для регистрации.";
        authErrorEl.style.display = "block";
        return;
      }
      try {
        const data = await apiAuthRegister(name, email, password);
        setAuth(data.token, data.user);
        closeAuthModal();
        await apiLoadTasks();
      } catch (e) {
        authErrorEl.textContent = e.message || "Ошибка регистрации";
        authErrorEl.style.display = "block";
      }
    } else {
      try {
        const data = await apiAuthLogin(email, password);
        setAuth(data.token, data.user);
        closeAuthModal();
        await apiLoadTasks();
      } catch (e) {
        authErrorEl.textContent = e.message || "Ошибка входа";
        authErrorEl.style.display = "block";
      }
    }
  });
}

// Закрытие модалок по Esc
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeTaskModal();
    closeAuthModal();
  }
});

// ---------- Старт ----------

document.addEventListener("DOMContentLoaded", async () => {
  loadAuthFromStorage();
  renderUserPanel();
  showScreen("capture");

  if (authState.token) {
    try {
      await apiLoadTasks();
    } catch {
      // токен протух, покажем пусто
    }
  } else {
    // сразу предлагаем войти, но не навязчиво
    // можно просто оставить кнопку "ВОЙТИ" без автопопапа
  }
});
