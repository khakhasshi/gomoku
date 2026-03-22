const boardElement = document.getElementById('board');
const playerNameInput = document.getElementById('playerName');
const roomCodeInput = document.getElementById('roomCode');
const createRoomButton = document.getElementById('createRoomButton');
const joinRoomButton = document.getElementById('joinRoomButton');
const copyRoomButton = document.getElementById('copyRoomButton');
const rematchButton = document.getElementById('rematchButton');
const leaveRoomButton = document.getElementById('leaveRoomButton');
const connectionStatus = document.getElementById('connectionStatus');
const roomDisplay = document.getElementById('roomDisplay');
const messageDisplay = document.getElementById('messageDisplay');
const blackPlayer = document.getElementById('blackPlayer');
const whitePlayer = document.getElementById('whitePlayer');
const turnDisplay = document.getElementById('turnDisplay');
const chatStatus = document.getElementById('chatStatus');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSendButton = document.getElementById('chatSendButton');
const toast = document.getElementById('toast');
const STORAGE_KEYS = {
  identity: 'gomoku.identity',
  roomId: 'gomoku.roomId'
};

const PLAYER_CONFIG = {
  black: { label: '江景哲', color: '藏青色' },
  white: { label: '易诗雨', color: '粉色' }
};

const state = {
  boardSize: 15,
  clientId: null,
  room: null,
  ws: null,
  connected: false,
  reconnectAttempted: false
};

function saveIdentity() {
  localStorage.setItem(STORAGE_KEYS.identity, getDisplayName());
}

function saveRoomId(roomId) {
  if (roomId) {
    localStorage.setItem(STORAGE_KEYS.roomId, roomId);
  } else {
    localStorage.removeItem(STORAGE_KEYS.roomId);
  }
}

function getSavedRoomId() {
  return localStorage.getItem(STORAGE_KEYS.roomId) || '';
}

function triggerHaptics(duration = 10) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(duration);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

function send(type, payload = {}) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    showToast('连接尚未建立');
    return;
  }

  state.ws.send(JSON.stringify({ type, payload }));
}

function getDisplayName() {
  return playerNameInput.value.trim() === '易诗雨' ? '易诗雨' : '江景哲';
}

function restoreIdentity() {
  const savedIdentity = localStorage.getItem(STORAGE_KEYS.identity);
  if (savedIdentity === '易诗雨' || savedIdentity === '江景哲') {
    playerNameInput.value = savedIdentity;
  }
}

function tryReconnectRoom() {
  const roomId = getSavedRoomId().trim().toUpperCase();
  if (!roomId || !state.ws || state.ws.readyState !== WebSocket.OPEN || state.reconnectAttempted) {
    return;
  }

  state.reconnectAttempted = true;
  send('room:reconnect', { roomId, name: getDisplayName() });
}

function getMyPlayer() {
  return state.room?.players?.find((player) => player.id === state.clientId) || null;
}

function getLastMove() {
  return state.room?.moves?.length ? state.room.moves[state.room.moves.length - 1] : null;
}

function formatChatTime(timestamp) {
  if (!timestamp) {
    return '--:--';
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function renderChat() {
  const room = state.room;
  const myName = getDisplayName();
  const messages = room?.chatMessages || [];

  chatMessages.innerHTML = '';

  if (!room) {
    chatStatus.textContent = '进入房间后可聊天';
    chatInput.disabled = true;
    chatSendButton.disabled = true;

    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.textContent = '创建或加入房间后，就可以聊天啦。';
    chatMessages.appendChild(empty);
    return;
  }

  chatInput.disabled = false;
  chatSendButton.disabled = false;
  chatStatus.textContent = room.status === 'paused' ? '对局暂停中，聊天仍可用' : `房间 ${room.id}`;

  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.textContent = '还没有聊天消息，先打个招呼吧。';
    chatMessages.appendChild(empty);
    return;
  }

  messages.forEach((message) => {
    const item = document.createElement('div');
    const head = document.createElement('div');
    const name = document.createElement('span');
    const time = document.createElement('time');
    const bubble = document.createElement('div');
    const isMine = message.playerName === myName;

    item.className = `chat-message${isMine ? ' mine' : ''}`;
    head.className = 'chat-message-head';
    bubble.className = 'chat-bubble';

    name.textContent = message.playerName;
    time.textContent = formatChatTime(message.timestamp);
    bubble.textContent = message.text;

    head.append(name, time);
    item.append(head, bubble);
    chatMessages.appendChild(item);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChatMessage() {
  const text = chatInput.value.trim();

  if (!state.room) {
    showToast('请先创建或加入房间');
    return;
  }

  if (!text) {
    return;
  }

  send('chat:send', { text });
  chatInput.value = '';
}

function renderBoard() {
  boardElement.innerHTML = '';
  const myPlayer = getMyPlayer();
  const canPlay = state.room?.status === 'playing' && myPlayer && state.room.turn === myPlayer.stone;
  const lastMove = getLastMove();

  for (let row = 0; row < state.boardSize; row += 1) {
    for (let col = 0; col < state.boardSize; col += 1) {
      const cell = document.createElement('button');
      const stone = state.room?.board?.[row]?.[col] || null;

      cell.className = `cell ${stone || ''}`.trim();
      if (lastMove && lastMove.row === row && lastMove.col === col) {
        cell.classList.add('last-move');
        if (lastMove.timestamp) {
          cell.title = `最后一步：${lastMove.playerName} · ${new Date(lastMove.timestamp).toLocaleString()}`;
        }
      }
      if (!stone && canPlay) {
        cell.classList.add('playable');
      }
      cell.type = 'button';
      cell.setAttribute('aria-label', `第 ${row + 1} 行，第 ${col + 1} 列`);
      cell.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'mouse' && !stone && canPlay) {
          cell.classList.add('touch-active');
        }
      });
      cell.addEventListener('pointerup', () => {
        cell.classList.remove('touch-active');
      });
      cell.addEventListener('pointercancel', () => {
        cell.classList.remove('touch-active');
      });
      cell.addEventListener('pointerleave', () => {
        cell.classList.remove('touch-active');
      });
      cell.addEventListener('click', () => {
        if (!stone) {
          if (canPlay) {
            triggerHaptics(12);
          }
          send('game:move', { row, col });
        }
      });

      boardElement.appendChild(cell);
    }
  }
}

function renderRoom() {
  const room = state.room;
  const black = room?.players?.find((player) => player.stone === 'black');
  const white = room?.players?.find((player) => player.stone === 'white');
  const myPlayer = getMyPlayer();

  roomDisplay.textContent = room?.id || '未加入';
  saveRoomId(room?.id || '');
  blackPlayer.textContent = black ? `${black.name}${black.id === state.clientId ? '（你）' : ''}` : '等待加入';
  whitePlayer.textContent = white ? `${white.name}${white.id === state.clientId ? '（你）' : ''}` : '等待加入';

  if (!room) {
    turnDisplay.textContent = '--';
  } else if (room.winner === 'draw') {
    turnDisplay.textContent = '平局';
  } else if (room.status === 'finished') {
    const winner = room.players.find((player) => player.id === room.winner);
    turnDisplay.textContent = winner ? `${winner.name} 获胜` : '对局结束';
  } else if (room.status === 'paused') {
    turnDisplay.textContent = '对手掉线，已暂停';
  } else if (room.status === 'waiting') {
    turnDisplay.textContent = '等待对手';
  } else {
    turnDisplay.textContent = `${PLAYER_CONFIG[room.turn].label} · ${PLAYER_CONFIG[room.turn].color}`;
  }

  rematchButton.disabled = !room || room.players.length < 2;
  leaveRoomButton.disabled = !room;
  copyRoomButton.disabled = !room?.id;
  roomCodeInput.value = room?.id || roomCodeInput.value.trim().toUpperCase();

  if (myPlayer) {
    if (room?.status === 'playing') {
      messageDisplay.textContent = room.turn === myPlayer.stone ? '轮到你落子' : `等待${myPlayer.stone === 'black' ? '易诗雨' : '江景哲'}落子`;
    } else if (room?.status === 'paused') {
      messageDisplay.textContent = '对方网络波动，系统正在保留房间等待重连';
    }
  }

  renderBoard();
  renderChat();
}

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${window.location.host}`);
  state.ws = ws;

  ws.addEventListener('open', () => {
    state.connected = true;
    state.reconnectAttempted = false;
    connectionStatus.textContent = '已连接';
    showToast('已连接专属对战服务器');
  });

  ws.addEventListener('close', () => {
    state.connected = false;
    connectionStatus.textContent = '连接断开，正在重连';
    showToast('连接断开，3 秒后重连');
    setTimeout(connect, 3000);
  });

  ws.addEventListener('message', (event) => {
    const { type, payload } = JSON.parse(event.data);

    if (type === 'system:connected') {
      state.clientId = payload.clientId;
      state.boardSize = payload.boardSize;
      renderBoard();
      tryReconnectRoom();
      return;
    }

    if (type === 'room:update') {
      state.room = payload.room;
      if (payload.message) {
        messageDisplay.textContent = payload.message;
        showToast(payload.message);
      }
      renderRoom();
      return;
    }

    if (type === 'room:reset') {
      state.room = null;
      saveRoomId('');
      messageDisplay.textContent = '你已离开房间';
      renderRoom();
      return;
    }

    if (type === 'system:error') {
      showToast(payload.message || '发生错误');
    }
  });
}

playerNameInput.addEventListener('change', () => {
  saveIdentity();
});

createRoomButton.addEventListener('click', () => {
  saveIdentity();
  triggerHaptics(8);
  send('room:create', { name: getDisplayName() });
});

joinRoomButton.addEventListener('click', () => {
  const roomId = roomCodeInput.value.trim().toUpperCase();
  if (!roomId) {
    showToast('请输入房间号');
    return;
  }
  saveIdentity();
  triggerHaptics(8);
  send('room:join', { roomId, name: getDisplayName() });
});

copyRoomButton.addEventListener('click', async () => {
  if (!state.room?.id) {
    showToast('暂无房间号可复制');
    return;
  }

  try {
    await navigator.clipboard.writeText(state.room.id);
    showToast('房间号已复制');
  } catch (error) {
    showToast('复制失败，请手动复制');
  }
});

chatSendButton.addEventListener('click', () => {
  triggerHaptics(8);
  sendChatMessage();
});

chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    sendChatMessage();
  }
});

rematchButton.addEventListener('click', () => {
  triggerHaptics(8);
  send('game:rematch');
});

leaveRoomButton.addEventListener('click', () => {
  triggerHaptics(8);
  send('room:leave');
});

restoreIdentity();
roomCodeInput.value = getSavedRoomId();
renderBoard();
renderChat();
connect();
