import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "localhost"; // no protocol here
const port = 3000;

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

// In-memory storage for rooms and players
const rooms = new Map();
const players = new Map();

// Room and player interfaces
class Room {
  constructor(code, teamCount, hostName) {
    this.hostName = hostName;
    this.code = code;
    this.teamCount = teamCount;
    this.players = [];
    this.buzzerPressed = false;
    this.firstBuzzer = null;
    this.buzzerOrder = [];
    this.createdAt = new Date();
  }
}

class Player {
  constructor(id, name, team, isHost, socketId) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.isHost = isHost;
    this.socketId = socketId;
  }
}

// Utility functions
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function assignPlayerToTeam(room) {
  const teamCounts = Array(room.teamCount).fill(0);

  room.players.forEach((player) => {
    if (player.team > 0 && player.team <= room.teamCount) {
      teamCounts[player.team - 1]++;
    }
  });

  // Find team with least players
  const minCount = Math.min(...teamCounts);
  const teamIndex = teamCounts.indexOf(minCount);

  return teamIndex + 1;
}

function createRoom(teamCount, hostName) {
  let roomCode = generateRoomCode();

  // Ensure unique room code
  while (rooms.has(roomCode)) {
    roomCode = generateRoomCode();
  }

  const room = new Room(roomCode, teamCount, hostName);
  rooms.set(roomCode, room);

  return room;
}

app.prepare().then(() => {
  const httpServer = createServer(handler);
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_HOST || "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Handle room creation
    socket.on("create-room", ({ teamCount, hostName }, callback) => {
      try {
        const room = createRoom(teamCount, hostName);
        console.log(`Room created: ${room.code} by ${hostName}`);

        callback({
          success: true,
          roomCode: room.code,
        });
      } catch (error) {
        console.error("Error creating room:", error);
        callback({
          success: false,
          error: "Failed to create room",
        });
      }
    });

    // Handle joining room
    socket.on("join-room", ({ roomCode, playerName, isHost }) => {
      const room = rooms.get(roomCode);

      if (!room) {
        socket.emit("error", "Room not found");
        return;
      }

      // Check if player already exists
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
          `Player ${playerName} joined room ${roomCode} on team ${team}`
        );
      } else {
        // Update socket ID for reconnection
        player.socketId = socket.id;
        console.log(`Player ${playerName} reconnected to room ${roomCode}`);
      }

      players.set(socket.id, { player, roomCode });
      socket.join(roomCode);

      socket.emit("player-joined", player);
      io.to(roomCode).emit("room-state", room);
    });

    // Handle buzzer press
    socket.on("press-buzzer", ({ roomCode, playerId }) => {
      const room = rooms.get(roomCode);
      if (!room || room.buzzerPressed) {
        return;
      }

      const player = room.players.find((p) => p.id === playerId);
      if (!player) {
        return;
      }

      const buzzerEvent = {
        playerId: player.id,
        playerName: player.name,
        team: player.team,
        timestamp: Date.now(),
      };

      room.buzzerPressed = true;
      room.firstBuzzer = buzzerEvent;
      room.buzzerOrder.push(buzzerEvent);

      console.log(`Buzzer pressed by ${player.name} in room ${roomCode}`);

      io.to(roomCode).emit("room-state", room);
      io.to(roomCode).emit("buzzer-pressed", buzzerEvent);
    });

    // Handle buzzer reset
    socket.on("reset-buzzer", ({ roomCode }) => {
      const room = rooms.get(roomCode);
      if (!room) {
        return;
      }

      const playerData = players.get(socket.id);
      if (!playerData || !playerData.player.isHost) {
        socket.emit("error", "Only the host can reset the buzzer");
        return;
      }

      room.buzzerPressed = false;
      room.firstBuzzer = null;
      room.buzzerOrder = [];

      console.log(`Buzzer reset in room ${roomCode}`);

      io.to(roomCode).emit("room-state", room);
    });

    // Handle getting room info
    socket.on("get-room", ({ roomCode }, callback) => {
      const room = rooms.get(roomCode);
      if (!room) {
        callback({ success: false, error: "Room not found" });
        return;
      }

      callback({ success: true, room });
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      const playerData = players.get(socket.id);

      if (playerData) {
        const { roomCode, player } = playerData;
        const room = rooms.get(roomCode);

        if (room) {
          console.log(
            `Player ${player.name} disconnected from room ${roomCode}`
          );
          // Keep player in room for potential reconnection
          // In production, you might want to remove after a timeout
          io.to(roomCode).emit("room-state", room);
        }

        players.delete(socket.id);
      }
    });

    // Handle room cleanup (optional - for production)
    socket.on("delete-room", ({ roomCode }) => {
      const playerData = players.get(socket.id);
      if (!playerData || !playerData.player.isHost) {
        socket.emit("error", "Only the host can delete the room");
        return;
      }

      const room = rooms.get(roomCode);
      if (room) {
        // Notify all players that room is being deleted
        io.to(roomCode).emit("room-deleted");

        // Remove all players from this room
        room.players.forEach((player) => {
          const playerSocket = [...players.entries()].find(
            ([, data]) => data.player.id === player.id
          );
          if (playerSocket) {
            players.delete(playerSocket[0]);
          }
        });

        rooms.delete(roomCode);
        console.log(`Room ${roomCode} deleted`);
      }
    });
  });

  // Cleanup old rooms periodically (optional)
  setInterval(() => {
    const now = new Date();
    const maxAge = 2 * 60 * 60 * 1000; // 2 hours

    for (const [roomCode, room] of rooms.entries()) {
      if (now - room.createdAt > maxAge && room.players.length === 0) {
        rooms.delete(roomCode);
        console.log(`Cleaned up empty room: ${roomCode}`);
      }
    }
  }, 60 * 60 * 1000); // Run every hour

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> Socket.IO server running`);
    });
});
