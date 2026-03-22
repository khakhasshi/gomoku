const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 7004);
const HOST = process.env.HOST || '0.0.0.0';
const BOARD_SIZE = 15;
const ROOM_ID_LENGTH = 6;
const PLAYER_NAMES = {
  jiang: '江景哲',
  yi: '易诗雨'
};

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const clients = new Map();

function normalizePlayerName(name) {
  const trimmed = String(name || '').trim();
  if (trimmed === PLAYER_NAMES.yi) {
    return PLAYER_NAMES.yi;
  }
  return PLAYER_NAMES.jiang;
}

function getPreferredStone(name) {
  return name === PLAYER_NAMES.yi ? 'white' : 'black';
}

function rebalanceRoomPlayers(room) {
  room.players.forEach((player) => {
    player.stone = getPreferredStone(player.name);
  });

  room.players.sort((left, right) => {
    const order = { black: 0, white: 1 };
    return order[left.stone] - order[right.stone];
  });
}

function createRoomId() {
  let roomId = '';
  do {
    roomId = crypto.randomBytes(ROOM_ID_LENGTH).toString('base64url').slice(0, ROOM_ID_LENGTH).toUpperCase();
  } while (rooms.has(roomId));
  return roomId;
}

function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function createRoom(hostSocket, hostName) {
  const roomId = createRoomId();
  const room = {
    id: roomId,
    board: createEmptyBoard(),
    players: [
      { socket: hostSocket, id: clients.get(hostSocket).id, name: hostName, stone: 'black' }
    ],
    status: 'waiting',
    turn: 'black',
    winner: null,
    moves: [],
    createdAt: Date.now(),
    rematchVotes: new Set()
  };

  rebalanceRoomPlayers(room);
  rooms.set(roomId, room);
  clients.get(hostSocket).roomId = roomId;
  return room;
}

function serializeRoom(room) {
  return {
    id: room.id,
    board: room.board,
    status: room.status,
    turn: room.turn,
    winner: room.winner,
    moves: room.moves,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      stone: player.stone
    }))
  };
}

function send(socket, type, payload = {}) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify({ type, payload }));
  }
}

function broadcastRoom(room, type, payload = {}) {
  room.players.forEach((player) => send(player.socket, type, payload));
}

function findPlayer(room, socket) {
  return room.players.find((player) => player.socket === socket);
}

function getOpponent(room, socket) {
  return room.players.find((player) => player.socket !== socket);
}

function countDirection(board, row, col, rowStep, colStep, stone) {
  let count = 0;
  let nextRow = row + rowStep;
  let nextCol = col + colStep;

  while (
    nextRow >= 0 && nextRow < BOARD_SIZE &&
    nextCol >= 0 && nextCol < BOARD_SIZE &&
    board[nextRow][nextCol] === stone
  ) {
    count += 1;
    nextRow += rowStep;
    nextCol += colStep;
  }

  return count;
}

function hasFiveInRow(board, row, col, stone) {
  const directions = [
    [[0, -1], [0, 1]],
    [[-1, 0], [1, 0]],
    [[-1, -1], [1, 1]],
    [[-1, 1], [1, -1]]
  ];

  return directions.some((direction) => {
    const total = 1 + direction.reduce((sum, [rowStep, colStep]) => {
      return sum + countDirection(board, row, col, rowStep, colStep, stone);
    }, 0);

    return total >= 5;
  });
}

function resetRoom(room) {
  room.board = createEmptyBoard();
  room.status = room.players.length === 2 ? 'playing' : 'waiting';
  room.turn = 'black';
  room.winner = null;
  room.moves = [];
  room.rematchVotes.clear();
}

function notifyRoomState(room, message) {
  broadcastRoom(room, 'room:update', {
    room: serializeRoom(room),
    message
  });
}

function leaveRoom(socket, silent = false) {
  const client = clients.get(socket);
  if (!client || !client.roomId) {
    return;
  }

  const room = rooms.get(client.roomId);
  client.roomId = null;

  if (!room) {
    return;
  }

  const leavingPlayer = findPlayer(room, socket);
  room.players = room.players.filter((player) => player.socket !== socket);

  if (room.players.length === 0) {
    rooms.delete(room.id);
    return;
  }

  room.status = 'waiting';
  room.winner = null;
  room.turn = 'black';
  room.board = createEmptyBoard();
  room.moves = [];
  room.rematchVotes.clear();

  const remaining = room.players[0];
  if (remaining) {
    remaining.stone = getPreferredStone(remaining.name);
  }

  if (!silent) {
    notifyRoomState(room, `${leavingPlayer ? leavingPlayer.name : '玩家'} 已离开房间，等待新对手加入。`);
  }
}

wss.on('connection', (socket) => {
  const clientId = crypto.randomUUID();
  clients.set(socket, { id: clientId, roomId: null, name: '玩家' });

  send(socket, 'system:connected', { clientId, boardSize: BOARD_SIZE });

  socket.on('message', (rawMessage) => {
    let data;

    try {
      data = JSON.parse(rawMessage.toString());
    } catch (error) {
      send(socket, 'system:error', { message: '消息格式错误。' });
      return;
    }

    const { type, payload = {} } = data;
    const client = clients.get(socket);

    if (!client) {
      return;
    }

    if (type === 'room:create') {
      const hostName = normalizePlayerName(payload.name);
      leaveRoom(socket, true);
      client.name = hostName;
      const room = createRoom(socket, hostName);
      notifyRoomState(room, '房间创建成功，等待对手加入。');
      return;
    }

    if (type === 'room:join') {
      const roomId = String(payload.roomId || '').trim().toUpperCase();
      const playerName = normalizePlayerName(payload.name);
      const room = rooms.get(roomId);

      if (!room) {
        send(socket, 'system:error', { message: '房间不存在。' });
        return;
      }

      if (room.players.length >= 2) {
        send(socket, 'system:error', { message: '房间已满。' });
        return;
      }

      leaveRoom(socket, true);
      client.name = playerName;
      client.roomId = roomId;
      room.players.push({ socket, id: client.id, name: playerName, stone: getPreferredStone(playerName) });
      rebalanceRoomPlayers(room);
      room.status = 'playing';
      room.turn = 'black';
      room.winner = null;
      room.rematchVotes.clear();
      notifyRoomState(room, `${playerName} 已加入，江景哲先手。`);
      return;
    }

    if (type === 'room:leave') {
      leaveRoom(socket);
      send(socket, 'room:reset');
      return;
    }

    const room = client.roomId ? rooms.get(client.roomId) : null;

    if (!room) {
      send(socket, 'system:error', { message: '请先创建或加入房间。' });
      return;
    }

    const currentPlayer = findPlayer(room, socket);

    if (type === 'game:move') {
      const row = Number(payload.row);
      const col = Number(payload.col);

      if (!currentPlayer || room.status !== 'playing') {
        send(socket, 'system:error', { message: '当前对局未开始。' });
        return;
      }

      if (currentPlayer.stone !== room.turn) {
        send(socket, 'system:error', { message: '还没轮到你落子。' });
        return;
      }

      if (
        !Number.isInteger(row) || !Number.isInteger(col) ||
        row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE
      ) {
        send(socket, 'system:error', { message: '落子坐标无效。' });
        return;
      }

      if (room.board[row][col]) {
        send(socket, 'system:error', { message: '该位置已有棋子。' });
        return;
      }

      room.board[row][col] = currentPlayer.stone;
      room.moves.push({ row, col, stone: currentPlayer.stone, playerName: currentPlayer.name });

      if (hasFiveInRow(room.board, row, col, currentPlayer.stone)) {
        room.status = 'finished';
        room.winner = currentPlayer.id;
        notifyRoomState(room, `${currentPlayer.name} 获胜！`);
        return;
      }

      if (room.moves.length === BOARD_SIZE * BOARD_SIZE) {
        room.status = 'finished';
        room.winner = 'draw';
        notifyRoomState(room, '棋盘已满，平局。');
        return;
      }

      room.turn = currentPlayer.stone === 'black' ? 'white' : 'black';
      const opponent = getOpponent(room, socket);
      notifyRoomState(room, opponent ? `轮到 ${opponent.name} 落子。` : '等待对手落子。');
      return;
    }

    if (type === 'game:rematch') {
      if (!currentPlayer || room.players.length < 2) {
        send(socket, 'system:error', { message: '当前无法发起再来一局。' });
        return;
      }

      room.rematchVotes.add(currentPlayer.id);
      if (room.rematchVotes.size === 2) {
        resetRoom(room);
        notifyRoomState(room, '双方同意，再来一局。');
      } else {
        notifyRoomState(room, `${currentPlayer.name} 请求再来一局。`);
      }
    }
  });

  socket.on('close', () => {
    leaveRoom(socket);
    clients.delete(socket);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Gomoku server is running at http://${HOST}:${PORT}`);
});
