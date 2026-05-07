import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy }
  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ── Firebase ──────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDwvcqvXRtnq5iuplYefhifEDx_1U6lAVU",
  authDomain:        "ce-innovation-dashboard-d6f7a.firebaseapp.com",
  projectId:         "ce-innovation-dashboard-d6f7a",
  storageBucket:     "ce-innovation-dashboard-d6f7a.firebasestorage.app",
  messagingSenderId: "821823754783",
  appId:             "1:821823754783:web:bed65511c0549a13b33b2a"
};

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

// ── State ─────────────────────────────────────────────────────────────────────
let boards       = [];
let cards        = [];
let activeBoardId = null;
let editingCardId = null;
let unsubCards    = null;

const COLS = [
  { id: 'backlog',    label: 'Backlog',     color: '#9E9E9E' },
  { id: 'todo',       label: 'To Do',       color: '#5C7A9E' },
  { id: 'inprogress', label: 'In Progress', color: '#5C7A5A' },
  { id: 'done',       label: 'Done',        color: '#52A065' },
];

// ── Boards ────────────────────────────────────────────────────────────────────
onSnapshot(query(collection(db, 'boards'), orderBy('createdAt')), snap => {
  boards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderBoardNav();
  // Auto-select the first board on first load
  if (!activeBoardId && boards.length > 0) {
    selectBoard(boards[0].id);
  } else if (activeBoardId && !boards.find(b => b.id === activeBoardId)) {
    activeBoardId = null;
    renderKanban();
  }
});

function renderBoardNav() {
  const nav = document.getElementById('board-nav');
  nav.innerHTML = '';
  boards.forEach(board => {
    const btn = document.createElement('button');
    btn.className = 'board-btn' + (board.id === activeBoardId ? ' active' : '');
    btn.innerHTML = `<span class="board-dot"></span>${esc(board.name)}`;
    btn.addEventListener('click', () => selectBoard(board.id));
    nav.appendChild(btn);
  });
}

function selectBoard(id) {
  activeBoardId = id;
  const board = boards.find(b => b.id === id);
  document.getElementById('board-title').textContent = board ? board.name : '';
  document.getElementById('btn-add-card').disabled = false;
  renderBoardNav();
  subscribeCards(id);
  showView('kanban');
}

// ── Cards subscription ────────────────────────────────────────────────────────
function subscribeCards(boardId) {
  if (unsubCards) unsubCards();
  unsubCards = onSnapshot(
    query(collection(db, 'boards', boardId, 'cards'), orderBy('createdAt')),
    snap => {
      cards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderKanban();
      renderTaskList();
    }
  );
}

// ── Kanban render ─────────────────────────────────────────────────────────────
function renderKanban() {
  const board = document.getElementById('kanban-board');

  if (!activeBoardId) {
    board.innerHTML = '<div class="kanban-empty"><p>Create or select a board to get started</p></div>';
    return;
  }

  board.innerHTML = '';

  COLS.forEach(col => {
    const colCards = cards.filter(c => c.col === col.id);

    const colEl = document.createElement('div');
    colEl.className = 'kanban-col';
    colEl.dataset.col = col.id;

    colEl.innerHTML = `
      <div class="col-header">
        <div class="col-header-left">
          <span class="col-dot" style="background:${col.color}"></span>
          <span class="col-label">${col.label}</span>
        </div>
        <span class="col-count">${colCards.length}</span>
      </div>
      <div class="col-cards" id="cards-${col.id}"></div>
    `;

    const cardsEl = colEl.querySelector('.col-cards');
    colCards.forEach(card => cardsEl.appendChild(makeCardEl(card)));

    // Drop targets
    colEl.addEventListener('dragover', e => { e.preventDefault(); colEl.classList.add('drag-over'); });
    colEl.addEventListener('dragleave', e => { if (!colEl.contains(e.relatedTarget)) colEl.classList.remove('drag-over'); });
    colEl.addEventListener('drop', async e => {
      e.preventDefault();
      colEl.classList.remove('drag-over');
      const cardId = e.dataTransfer.getData('cardId');
      if (cardId) {
        await updateDoc(doc(db, 'boards', activeBoardId, 'cards', cardId), { col: col.id });
      }
    });

    board.appendChild(colEl);
  });
}

function makeCardEl(card) {
  const div = document.createElement('div');
  div.className = 'kanban-card';
  div.draggable = true;
  div.dataset.id = card.id;

  const today = new Date().toISOString().slice(0, 10);
  const overdue = card.due && card.due < today && card.col !== 'done';

  div.innerHTML = `
    <div class="card-title">${esc(card.title)}</div>
    ${card.desc ? `<div class="card-desc">${esc(card.desc)}</div>` : ''}
    <div class="card-meta">
      ${card.assignee ? `<span class="card-assignee">👤 ${esc(card.assignee)}</span>` : ''}
      ${card.due ? `<span class="card-due${overdue ? ' overdue' : ''}">${card.due}</span>` : ''}
    </div>
  `;

  div.addEventListener('dragstart', e => {
    e.dataTransfer.setData('cardId', card.id);
    div.classList.add('dragging');
  });
  div.addEventListener('dragend', () => div.classList.remove('dragging'));
  div.addEventListener('click', () => openCardModal(card));

  return div;
}

// ── Task list render ──────────────────────────────────────────────────────────
function renderTaskList() {
  const list = document.getElementById('task-list');
  list.innerHTML = '';

  if (!activeBoardId) return;

  const board = boards.find(b => b.id === activeBoardId);
  const boardName = board ? board.name : '';

  if (cards.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:0.875rem">No cards yet on this board.</p>';
    return;
  }

  cards.forEach(card => {
    const col = COLS.find(c => c.id === card.col) || COLS[0];
    const row = document.createElement('div');
    row.className = 'task-row';
    row.innerHTML = `
      <div>
        <div class="task-row-title">${esc(card.title)}</div>
        <div class="task-board-name">${esc(boardName)}</div>
      </div>
      <span class="task-col-badge" style="background:${col.color}22;color:${col.color}">${col.label}</span>
      <span class="task-assignee">${card.assignee ? '👤 ' + esc(card.assignee) : ''}</span>
      <span class="card-due${card.due && card.due < new Date().toISOString().slice(0,10) && card.col !== 'done' ? ' overdue' : ''}">${card.due || ''}</span>
    `;
    row.addEventListener('click', () => openCardModal(card));
    list.appendChild(row);
  });
}

// ── View switching ────────────────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + name).classList.remove('hidden');
  document.querySelector(`.nav-btn[data-view="${name}"]`).classList.add('active');
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    showView(btn.dataset.view);
    if (btn.dataset.view === 'tasks') renderTaskList();
  });
});

// ── Board modal ───────────────────────────────────────────────────────────────
document.getElementById('btn-new-board').addEventListener('click', () => {
  document.getElementById('board-name-input').value = '';
  document.getElementById('modal-board').classList.remove('hidden');
  setTimeout(() => document.getElementById('board-name-input').focus(), 50);
});

document.getElementById('btn-cancel-board').addEventListener('click', () =>
  document.getElementById('modal-board').classList.add('hidden'));

document.getElementById('btn-save-board').addEventListener('click', async () => {
  const name = document.getElementById('board-name-input').value.trim();
  if (!name) return;
  const ref = await addDoc(collection(db, 'boards'), { name, createdAt: Date.now() });
  document.getElementById('modal-board').classList.add('hidden');
  selectBoard(ref.id);
});

document.getElementById('board-name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-save-board').click();
});

// ── Card modal ────────────────────────────────────────────────────────────────
document.getElementById('btn-add-card').addEventListener('click', () => openCardModal(null));

function openCardModal(card) {
  editingCardId = card ? card.id : null;
  document.getElementById('modal-card-title').textContent = card ? 'Edit card' : 'New card';
  document.getElementById('card-title').value    = card ? card.title    : '';
  document.getElementById('card-desc').value     = card ? (card.desc    || '') : '';
  document.getElementById('card-assignee').value = card ? (card.assignee || '') : '';
  document.getElementById('card-due').value      = card ? (card.due     || '') : '';
  document.getElementById('card-col').value      = card ? card.col      : 'backlog';
  document.getElementById('btn-delete-card').style.display = card ? 'inline-flex' : 'none';
  document.getElementById('modal-card').classList.remove('hidden');
  setTimeout(() => document.getElementById('card-title').focus(), 50);
}

document.getElementById('btn-cancel-card').addEventListener('click', () =>
  document.getElementById('modal-card').classList.add('hidden'));

document.getElementById('btn-save-card').addEventListener('click', async () => {
  const title = document.getElementById('card-title').value.trim();
  if (!title) return;

  const data = {
    title,
    desc:      document.getElementById('card-desc').value.trim(),
    assignee:  document.getElementById('card-assignee').value.trim(),
    due:       document.getElementById('card-due').value,
    col:       document.getElementById('card-col').value,
  };

  if (editingCardId) {
    await updateDoc(doc(db, 'boards', activeBoardId, 'cards', editingCardId), data);
  } else {
    await addDoc(collection(db, 'boards', activeBoardId, 'cards'), { ...data, createdAt: Date.now() });
  }

  document.getElementById('modal-card').classList.add('hidden');
});

document.getElementById('btn-delete-card').addEventListener('click', async () => {
  if (!editingCardId) return;
  await deleteDoc(doc(db, 'boards', activeBoardId, 'cards', editingCardId));
  document.getElementById('modal-card').classList.add('hidden');
});

// Close modals on backdrop click
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('hidden');
  });
});

// ── Utility ───────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
