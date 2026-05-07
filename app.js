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

// ── Columns ───────────────────────────────────────────────────────────────────
const COLS = [
  { id: 'backlog',    label: 'Backlog',     color: '#9E9E9E' },
  { id: 'todo',       label: 'To Do',       color: '#5C7A9E' },
  { id: 'inprogress', label: 'In Progress', color: '#5C7A5A' },
  { id: 'done',       label: 'Done',        color: '#52A065' },
];

// ── State ─────────────────────────────────────────────────────────────────────
let boards        = [];
let activeBoardId = null;
let activeCards   = [];      // cards on current board
let allCards      = [];      // cards across ALL boards (for My Tasks / All Tasks)
let editingCardId = null;
let editingBoardId = null;   // which board the editing card belongs to
let unsubCards    = null;
let boardUnsubs   = {};      // per-board card listeners

// ── Identity (localStorage) ───────────────────────────────────────────────────
let myName = localStorage.getItem('ce_myName') || '';

function setMyName(name) {
  myName = name.trim();
  localStorage.setItem('ce_myName', myName);
  renderIdentity();
  renderMyTasks();
  renderKanban();
}

function renderIdentity() {
  const nameEl   = document.getElementById('identity-name');
  const avatarEl = document.getElementById('identity-avatar');
  if (myName) {
    nameEl.textContent   = myName;
    avatarEl.textContent = myName.charAt(0).toUpperCase();
  } else {
    nameEl.textContent   = 'Set your name';
    avatarEl.textContent = '?';
  }
}

// Show name modal on first visit
function maybePromptName() {
  if (!myName) openNameModal();
}

// ── Name modal ────────────────────────────────────────────────────────────────
function openNameModal() {
  document.getElementById('name-input').value = myName;
  document.getElementById('modal-name').classList.remove('hidden');
  setTimeout(() => document.getElementById('name-input').focus(), 50);
}

document.getElementById('btn-change-name').addEventListener('click', openNameModal);
document.getElementById('my-identity').addEventListener('click', (e) => {
  if (e.target !== document.getElementById('btn-change-name')) openNameModal();
});

document.getElementById('btn-save-name').addEventListener('click', () => {
  const val = document.getElementById('name-input').value.trim();
  if (!val) return;
  setMyName(val);
  document.getElementById('modal-name').classList.add('hidden');
});
document.getElementById('name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-save-name').click();
});

// ── Boards listener ───────────────────────────────────────────────────────────
onSnapshot(query(collection(db, 'boards'), orderBy('createdAt')), snap => {
  boards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderBoardNav();

  // Subscribe to cards for every board (powers My Tasks + All Tasks)
  boards.forEach(board => {
    if (!boardUnsubs[board.id]) {
      boardUnsubs[board.id] = onSnapshot(
        query(collection(db, 'boards', board.id, 'cards'), orderBy('createdAt')),
        snap => {
          const boardCards = snap.docs.map(d => ({ id: d.id, boardId: board.id, ...d.data() }));
          // Update allCards for this board
          allCards = allCards.filter(c => c.boardId !== board.id).concat(boardCards);
          renderMyTasks();
          if (document.getElementById('view-tasks').classList.contains('hidden') === false) {
            renderAllTasks();
          }
          // Also update active board cards
          if (board.id === activeBoardId) {
            activeCards = boardCards;
            renderKanban();
          }
        }
      );
    }
  });

  // Auto-select first board on first load
  if (!activeBoardId && boards.length > 0) {
    selectBoard(boards[0].id);
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
  document.getElementById('btn-add-card').style.display = 'inline-flex';
  renderBoardNav();
  // Cards already loaded via allCards — filter
  activeCards = allCards.filter(c => c.boardId === id);
  showView('kanban');
  renderKanban();
}

// ── View switching ────────────────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-btn, .board-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + name).classList.remove('hidden');

  // Highlight correct nav button
  const navBtn = document.querySelector(`.nav-btn[data-view="${name}"]`);
  if (navBtn) navBtn.classList.add('active');

  // Show/hide Add card button
  document.getElementById('btn-add-card').style.display = name === 'kanban' && activeBoardId ? 'inline-flex' : 'none';

  if (name === 'tasks') {
    const board = boards.find(b => b.id === activeBoardId);
    document.getElementById('board-title').textContent = board ? board.name : 'CE Innovation Dashboard';
    renderAllTasks();
  }
  if (name === 'mytasks') {
    document.getElementById('board-title').textContent = myName ? `${myName}'s Tasks` : 'My Tasks';
    renderMyTasks();
  }
  if (name === 'kanban' && activeBoardId) {
    const board = boards.find(b => b.id === activeBoardId);
    document.getElementById('board-title').textContent = board ? board.name : '';
    const matchingBtn = document.querySelector(`.board-btn[data-board="${activeBoardId}"]`);
    if (matchingBtn) matchingBtn.classList.add('active');
  }
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// ── Kanban render ─────────────────────────────────────────────────────────────
function renderKanban() {
  const board = document.getElementById('kanban-board');
  if (!activeBoardId) {
    board.innerHTML = '<div class="kanban-empty"><p>Select a board from the sidebar</p></div>';
    return;
  }

  board.innerHTML = '';
  COLS.forEach(col => {
    const colCards = activeCards.filter(c => c.col === col.id);
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
    colCards.forEach(card => cardsEl.appendChild(makeCardEl(card, activeBoardId)));

    colEl.addEventListener('dragover',  e => { e.preventDefault(); colEl.classList.add('drag-over'); });
    colEl.addEventListener('dragleave', e => { if (!colEl.contains(e.relatedTarget)) colEl.classList.remove('drag-over'); });
    colEl.addEventListener('drop', async e => {
      e.preventDefault(); colEl.classList.remove('drag-over');
      const cardId  = e.dataTransfer.getData('cardId');
      const boardId = e.dataTransfer.getData('boardId');
      if (cardId && boardId) {
        await updateDoc(doc(db, 'boards', boardId, 'cards', cardId), { col: col.id });
      }
    });

    board.appendChild(colEl);
  });
}

function makeCardEl(card, boardId) {
  const div = document.createElement('div');
  const today   = new Date().toISOString().slice(0, 10);
  const overdue = card.due && card.due < today && card.col !== 'done';
  const isMe    = myName && card.assignee && card.assignee.toLowerCase() === myName.toLowerCase();

  div.className = 'kanban-card' + (isMe ? ' mine' : '');
  div.draggable = true;
  div.innerHTML = `
    <div class="card-title">${esc(card.title)}</div>
    ${card.desc ? `<div class="card-desc">${esc(card.desc)}</div>` : ''}
    <div class="card-meta">
      ${card.assignee ? `<span class="card-assignee${isMe ? ' me' : ''}">${esc(card.assignee)}</span>` : ''}
      ${card.due      ? `<span class="card-due${overdue ? ' overdue' : ''}">${card.due}</span>` : ''}
    </div>
  `;
  div.addEventListener('dragstart', e => {
    e.dataTransfer.setData('cardId',  card.id);
    e.dataTransfer.setData('boardId', boardId);
    div.classList.add('dragging');
  });
  div.addEventListener('dragend',  () => div.classList.remove('dragging'));
  div.addEventListener('click',    () => openCardModal(card, boardId));
  return div;
}

// ── My Tasks render ───────────────────────────────────────────────────────────
function renderMyTasks() {
  const list    = document.getElementById('mytasks-list');
  const empty   = document.getElementById('mytasks-empty');
  const heading = document.getElementById('mytasks-heading');

  heading.textContent = myName ? `${myName}'s Tasks` : 'My Tasks';

  if (!myName) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    empty.querySelector('p').textContent = 'Set your name in the sidebar to see your tasks.';
    return;
  }

  const mine = allCards.filter(c =>
    c.assignee && c.assignee.toLowerCase() === myName.toLowerCase() && c.col !== 'done'
  );

  if (mine.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    empty.querySelector('p').textContent = 'No open tasks assigned to you.';
    return;
  }

  empty.classList.add('hidden');

  // Group by column
  const groups = COLS.filter(col => col.id !== 'done').map(col => ({
    col,
    cards: mine.filter(c => c.col === col.id)
  })).filter(g => g.cards.length > 0);

  list.innerHTML = '';
  groups.forEach(({ col, cards }) => {
    const groupEl = document.createElement('div');
    groupEl.innerHTML = `
      <div class="task-group-label">
        <span class="task-group-dot" style="background:${col.color}"></span>
        ${col.label} <span style="font-weight:400;color:var(--text-muted)">(${cards.length})</span>
      </div>
    `;
    const taskList = document.createElement('div');
    taskList.className = 'task-list';
    cards.forEach(card => taskList.appendChild(makeTaskRow(card, true)));
    groupEl.appendChild(taskList);
    list.appendChild(groupEl);
  });
}

// ── All Tasks render ──────────────────────────────────────────────────────────
function renderAllTasks() {
  const list   = document.getElementById('task-list');
  const filter = document.getElementById('filter-assignee').value.trim().toLowerCase();

  let cards = activeBoardId ? allCards.filter(c => c.boardId === activeBoardId) : allCards;
  if (filter) cards = cards.filter(c => c.assignee && c.assignee.toLowerCase().includes(filter));

  list.innerHTML = '';
  if (cards.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:0.875rem;padding:1rem 0">No tasks found.</p>';
    return;
  }
  cards.forEach(card => list.appendChild(makeTaskRow(card, false)));
}

document.getElementById('filter-assignee').addEventListener('input', renderAllTasks);

function makeTaskRow(card, showBoard) {
  const col     = COLS.find(c => c.id === card.col) || COLS[0];
  const board   = boards.find(b => b.id === card.boardId);
  const today   = new Date().toISOString().slice(0, 10);
  const overdue = card.due && card.due < today && card.col !== 'done';
  const isMe    = myName && card.assignee && card.assignee.toLowerCase() === myName.toLowerCase();

  const row = document.createElement('div');
  row.className = 'task-row' + (isMe ? ' mine' : '');
  row.innerHTML = `
    <div>
      <div class="task-row-title">${esc(card.title)}</div>
      ${showBoard && board ? `<div class="task-board-name">${esc(board.name)}</div>` : ''}
    </div>
    <span class="task-col-badge" style="background:${col.color}22;color:${col.color}">${col.label}</span>
    <span class="task-assignee">${card.assignee ? esc(card.assignee) : '—'}</span>
    <span class="task-due${overdue ? ' overdue' : ''}">${card.due || ''}</span>
  `;
  row.addEventListener('click', () => openCardModal(card, card.boardId));
  return row;
}

// ── Card modal ────────────────────────────────────────────────────────────────
document.getElementById('btn-add-card').addEventListener('click', () => openCardModal(null, activeBoardId));

function openCardModal(card, boardId) {
  editingCardId  = card ? card.id  : null;
  editingBoardId = boardId         || activeBoardId;

  document.getElementById('modal-card-title').textContent = card ? 'Edit card' : 'New card';
  document.getElementById('card-title').value    = card ? card.title     : '';
  document.getElementById('card-desc').value     = card ? (card.desc     || '') : '';
  document.getElementById('card-assignee').value = card ? (card.assignee || '') : '';
  document.getElementById('card-due').value      = card ? (card.due      || '') : '';
  document.getElementById('card-col').value      = card ? card.col       : 'backlog';
  document.getElementById('btn-delete-card').style.display = card ? 'inline-flex' : 'none';

  // Populate assignee suggestions from all known names
  const names = [...new Set(allCards.map(c => c.assignee).filter(Boolean))];
  const dl = document.getElementById('assignee-suggestions');
  dl.innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');

  document.getElementById('modal-card').classList.remove('hidden');
  setTimeout(() => document.getElementById('card-title').focus(), 50);
}

document.getElementById('btn-cancel-card').addEventListener('click', () =>
  document.getElementById('modal-card').classList.add('hidden'));

document.getElementById('btn-save-card').addEventListener('click', async () => {
  const title = document.getElementById('card-title').value.trim();
  if (!title || !editingBoardId) return;

  const data = {
    title,
    desc:     document.getElementById('card-desc').value.trim(),
    assignee: document.getElementById('card-assignee').value.trim(),
    due:      document.getElementById('card-due').value,
    col:      document.getElementById('card-col').value,
  };

  if (editingCardId) {
    await updateDoc(doc(db, 'boards', editingBoardId, 'cards', editingCardId), data);
  } else {
    await addDoc(collection(db, 'boards', editingBoardId, 'cards'), { ...data, createdAt: Date.now() });
  }
  document.getElementById('modal-card').classList.add('hidden');
});

document.getElementById('btn-delete-card').addEventListener('click', async () => {
  if (!editingCardId || !editingBoardId) return;
  await deleteDoc(doc(db, 'boards', editingBoardId, 'cards', editingCardId));
  document.getElementById('modal-card').classList.add('hidden');
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

// Close modals on backdrop click
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
});

// ── Init ──────────────────────────────────────────────────────────────────────
renderIdentity();
maybePromptName();

// ── Utility ───────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
