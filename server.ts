import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Socket.IO Logic
  // We'll store a basic state object in memory to sync late joiners
  let classroomState = {
    activeOverlay: null as string | null,
    connectedStudents: [] as string[],
    selectionHistory: [] as string[],
    quickWheelWinner: null as string | null,
    drawings: [] as any[], // Add drawings to server state
    lastAction: null as any
  };

  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Send current state to new connections
    socket.emit("sync_state", classroomState);

    socket.on("classroom_action", (action) => {
      console.log("Received action:", action.type); // Less noisy logging

      // Update server state based on action
      if (action.type === 'STUDENT_JOIN') {
        if (!classroomState.connectedStudents.includes(action.payload.studentId)) {
          classroomState.connectedStudents.push(action.payload.studentId);
        }
      } else if (action.type === 'STUDENT_LEAVE') {
        classroomState.connectedStudents = classroomState.connectedStudents.filter(
          id => id !== action.payload.studentId
        );
      } else if (action.type === 'SET_OVERLAY') {
        classroomState.activeOverlay = action.payload.overlay;
      } else if (action.type === 'SPIN_WHEEL') {
        classroomState.activeOverlay = 'QUICK_WHEEL';
        classroomState.quickWheelWinner = action.payload.targetId;
        classroomState.selectionHistory.push(action.payload.targetId);
      } else if (action.type === 'GAME_WIN') {
        // Keep the overlay active, just record the win
      } else if (action.type === 'CLOSE_OVERLAY') {
        classroomState.activeOverlay = null;
        classroomState.quickWheelWinner = null;
      } else if (action.type === 'DRAWING_START') {
        classroomState.drawings.push({
          id: action.payload.id,
          color: action.payload.color,
          width: 4,
          points: [{ x: action.payload.x, y: action.payload.y }],
          isComplete: false
        });
      } else if (action.type === 'DRAWING_POINT') {
        const stroke = classroomState.drawings.find(d => d.id === action.payload.id);
        if (stroke) stroke.points.push({ x: action.payload.x, y: action.payload.y });
      } else if (action.type === 'DRAWING_END') {
        const stroke = classroomState.drawings.find(d => d.id === action.payload.id);
        if (stroke) stroke.isComplete = true;
      } else if (action.type === 'DRAWING_CLEAR') {
        classroomState.drawings = [];
      } else if (action.type === 'END_SESSION') {
        classroomState.drawings = [];
        classroomState.activeOverlay = null;
      }

      classroomState.lastAction = action;

      // Broadcast to everyone else
      socket.broadcast.emit("classroom_action", action);
      // Also broadcast the updated state just in case
      io.emit("sync_state", classroomState);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
