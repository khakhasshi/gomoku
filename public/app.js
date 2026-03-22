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
const toast = document.getElementById('toast');

const PLAYER_CONFIG = {
  black: { label: '江景哲', color: '藏青色' },
  white: { label: '易诗雨', color: '粉色' }
};

const state = {
  boardSize: 15,
  clientId: null,
  room: null,
  ws: null,
  connected: false
};

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

function getMyPlayer() {
  return state.room?.players?.find((player) => player.id === state.clientId) || null;
}

function renderBoard() {
  boardElement.innerHTML = '';
  const myPlayer = getMyPlayer();
  const canPlay = state.room?.status === 'playing' && myPlayer && state.room.turn === myPlayer.stone;

  for (let row = 0; row < state.boardSize; row += 1) {
    for (let col = 0; col < state.boardSize; col += 1) {
      const cell = document.createElement('button');
      const stone = state.room?.board?.[row]?.[col] || null;

      cell.className = `cell ${stone || ''}`.trim();
      if (!stone && canPlay) {
        cell.classList.add('playable');
      }
      cell.type = 'button';
      cell.setAttribute('aria-label', `第 ${row + 1} 行，第 ${col + 1} 列`);
      cell.addEventListener('click', () => {
        if (!stone) {
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
  blackPlayer.textContent = black ? `${black.name}${black.id === state.clientId ? '（你）' : ''}` : '等待加入';
  whitePlayer.textContent = white ? `${white.name}${white.id === state.clientId ? '（你）' : ''}` : '等待加入';

  if (!room) {
    turnDisplay.textContent = '--';
  } else if (room.winner === 'draw') {
    turnDisplay.textContent = '平局';
  } else if (room.status === 'finished') {
    const winner = room.players.find((player) => player.id === room.winner);
    turnDisplay.textContent = winner ? `${winner.name} 获胜` : '对局结束';
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
    messageDisplay.textContent = room?.status === 'playing'
      ? (room.turn === myPlayer.stone ? '轮到你落子' : `等待${myPlayer.stone === 'black' ? '易诗雨' : '江景哲'}落子`)
      : messageDisplay.textContent;
  }

  renderBoard();
}

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${window.location.host}`);
  state.ws = ws;

  ws.addEventListener('open', () => {
    state.connected = true;
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
      messageDisplay.textContent = '你已离开房间';
      renderRoom();
      return;
    }

    if (type === 'system:error') {
      showToast(payload.message || '发生错误');
    }
  });
}

createRoomButton.addEventListener('click', () => {
  send('room:create', { name: getDisplayName() });
});

joinRoomButton.addEventListener('click', () => {
  const roomId = roomCodeInput.value.trim().toUpperCase();
  if (!roomId) {
    showToast('请输入房间号');
    return;
  }
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

rematchButton.addEventListener('click', () => {
  send('game:rematch');
});

leaveRoomButton.addEventListener('click', () => {
  send('room:leave');
});

renderBoard();
connect();
