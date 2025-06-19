import { createServer } from "http";
import { Server, Socket } from "socket.io";

// In-memory storage
const rooms = new Map<string, Room>();
const players = new Map<string, { player: Player; roomCode: string }>();

// Room and Player classes with types
class Room {
  code: string;
  teamCount: number;
  hostName: string;
  players: Player[];
  buzzerPressed: boolean;
  firstBuzzer: BuzzerEvent | null;
  buzzerOrder: BuzzerEvent[];
  createdAt: Date;

  constructor(code: string, teamCount: number, hostName: string) {
    this.code = code;
    this.teamCount = teamCount;
    this.hostName = hostName;
    this.players = [];
    this.buzzerPressed = false;
    this.firstBuzzer = null;
    this.buzzerOrder = [];
    this.createdAt = new Date();
  }
}

class Player {
  id: string;
  name: string;
  team: number;
  isHost: boolean;
  socketId: string;

  constructor(
    id: string,
    name: string,
    team: number,
    isHost: boolean,
    socketId: string
  ) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.isHost = isHost;
    this.socketId = socketId;
  }
}

interface BuzzerEvent {
  playerId: string;
  playerName: string;
  team: number;
  timestamp: number;
}

// Utility functions
function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function assignPlayerToTeam(room: Room): number {
  const teamCounts = Array(room.teamCount).fill(0);
  room.players.forEach((player) => {
    if (player.team > 0 && player.team <= room.teamCount) {
      teamCounts[player.team - 1]++;
    }
  });
  const minCount = Math.min(...teamCounts);
  const teamIndex = teamCounts.indexOf(minCount);
  return teamIndex + 1;
}

function createRoom(teamCount: number, hostName: string): Room {
  let roomCode = generateRoomCode();
  while (rooms.has(roomCode)) {
    roomCode = generateRoomCode();
  }
  const room = new Room(roomCode, teamCount, hostName);
  rooms.set(roomCode, room);
  return room;
}

// Setup HTTP server and Socket.IO
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket: Socket) => {
  console.log("Client connected:", socket.id);

  socket.on(
    "create-room",
    (
      { teamCount, hostName }: { teamCount: number; hostName: string },
      callback: (response: {
        success: boolean;
        roomCode?: string;
        error?: string;
      }) => void
    ) => {
      try {
        const room = createRoom(teamCount, hostName);
        callback({ success: true, roomCode: room.code });
        console.log(`Room created: ${room.code}`);
      } catch (err) {
        console.error("Room creation error:", err);
        callback({ success: false, error: "Failed to create room" });
      }
    }
  );

  socket.on(
    "join-room",
    ({
      roomCode,
      playerName,
      isHost,
    }: {
      roomCode: string;
      playerName: string;
      isHost: boolean;
    }) => {
      const room = rooms.get(roomCode);
      if (!room) {
        socket.emit("error", "Room not found");
        return;
      }

      let player = room.players.find((p) => p.name === playerName);

      if (!player) {
        const team = assignPlayerToTeam(room);
        player = new Player(
          socket.id,
          playerName,
          team,
          isHost || room.players.length === 0,
          socket.id
        );
        room.players.push(player);
        console.log(
          `Player ${player.name} joined room ${roomCode} (team ${team})`
        );
      } else {
        player.socketId = socket.id;
        console.log(`Player ${player.name} reconnected to room ${roomCode}`);
      }

      players.set(socket.id, { player, roomCode });
      socket.join(roomCode);
      socket.emit("player-joined", player);
      io.to(roomCode).emit("room-state", room);
    }
  );

  socket.on(
    "press-buzzer",
    ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
      const room = rooms.get(roomCode);
      if (!room || room.buzzerPressed) return;

      const player = room.players.find((p) => p.id === playerId);
      if (!player) return;

      const buzzerEvent: BuzzerEvent = {
        playerId: player.id,
        playerName: player.name,
        team: player.team,
        timestamp: Date.now(),
      };

      room.buzzerPressed = true;
      room.firstBuzzer = buzzerEvent;
      room.buzzerOrder.push(buzzerEvent);

      console.log(`${player.name} buzzed in room ${roomCode}`);
      io.to(roomCode).emit("buzzer-pressed", buzzerEvent);
      io.to(roomCode).emit("room-state", room);
    }
  );

  socket.on("reset-buzzer", ({ roomCode }: { roomCode: string }) => {
    const room = rooms.get(roomCode);
    const playerData = players.get(socket.id);

    if (!room || !playerData?.player.isHost) {
      socket.emit("error", "Only the host can reset the buzzer");
      return;
    }

    room.buzzerPressed = false;
    room.firstBuzzer = null;
    room.buzzerOrder = [];

    console.log(`Buzzer reset in room ${roomCode}`);
    io.to(roomCode).emit("room-state", room);
  });

  socket.on(
    "get-room",
    (
      { roomCode }: { roomCode: string },
      callback: (response: {
        success: boolean;
        room?: Room;
        error?: string;
      }) => void
    ) => {
      const room = rooms.get(roomCode);
      if (!room) {
        callback({ success: false, error: "Room not found" });
        return;
      }
      callback({ success: true, room });
    }
  );

  socket.on("disconnect", () => {
    const playerData = players.get(socket.id);
    if (playerData) {
      const { roomCode, player } = playerData;
      const room = rooms.get(roomCode);
      if (room) {
        console.log(`Player ${player.name} disconnected from room ${roomCode}`);
        io.to(roomCode).emit("room-state", room);
      }
      players.delete(socket.id);
    }
  });

  socket.on("delete-room", ({ roomCode }: { roomCode: string }) => {
    const playerData = players.get(socket.id);
    if (!playerData?.player.isHost) {
      socket.emit("error", "Only the host can delete the room");
      return;
    }

    const room = rooms.get(roomCode);
    if (room) {
      io.to(roomCode).emit("room-deleted");
      room.players.forEach((player) => {
        const entry = [...players.entries()].find(
          ([, data]) => data.player.id === player.id
        );
        if (entry) players.delete(entry[0]);
      });
      rooms.delete(roomCode);
      console.log(`Room ${roomCode} deleted`);
    }
  });
});

// Clean up old rooms every hour
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (
      now - room.createdAt.getTime() > 2 * 60 * 60 * 1000 &&
      room.players.length === 0
    ) {
      rooms.delete(code);
      console.log(`Cleaned up empty room: ${code}`);
    }
  }
}, 60 * 60 * 1000);

const port = process.env.PORT || 3001;
httpServer.listen(port, () => {
  console.log(`Socket.IO server running on port ${port}`);
});
