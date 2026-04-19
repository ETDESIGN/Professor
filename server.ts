import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

// Mock AI Services for Development
const MOCK_RESPONSES = {
  'generate-lesson': {
    textContent: {
      title: 'Sample Lesson',
      description: 'A sample lesson for development',
      visual_prompt: 'Educational illustration',
      spoken_intro: 'Welcome to the lesson!',
      vocabulary: [
        { word: 'Sample', definition: 'An example or representative instance' },
        { word: 'Lesson', definition: 'A period of teaching or learning' }
      ],
      grammarRules: [
        { rule: 'Basic Structure', explanation: 'Subject + Verb' }
      ],
      sentences: [
        { original: 'This is a sample.', translation: 'This is an example.' }
      ]
    },
    imageUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=sample',
    audioUrl: null
  },
  'generate-media': {
    results: {
      images: {},
      audios: {}
    }
  },
  'evaluate-pronunciation': {
    evaluation: {
      targetText: 'Sample text',
      score: 0.85,
      feedback: 'Good pronunciation',
      phonemeAnalysis: []
    }
  },
  'orchestrate-lesson': {
    success: true,
    unitId: 'test-unit',
    publishedAssets: {},
    timelineId: 'test-timeline'
  }
};

// Socket.IO state
let classroomState = {
  activeOverlay: null,
  connectedStudents: [],
  selectionHistory: [],
  quickWheelWinner: null,
  drawings: [],
  lastAction: null
};

async function startServer(port) {
  const app = express();
  
  // API routes FIRST (before static files)
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.post('/generate-lesson', express.json({ limit: '10mb' }), (req, res) => {
    res.json(MOCK_RESPONSES['generate-lesson']);
  });

  app.post('/generate-media', express.json({ limit: '10mb' }), (req, res) => {
    res.json(MOCK_RESPONSES['generate-media']);
  });

  app.post('/evaluate-pronunciation', express.json({ limit: '10mb' }), (req, res) => {
    res.json(MOCK_RESPONSES['evaluate-pronunciation']);
  });

  app.post('/orchestrate-lesson', express.json({ limit: '10mb' }), (req, res) => {
    res.json(MOCK_RESPONSES['orchestrate-lesson']);
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  // Socket.IO
  io.on('connection', (socket) => {
    socket.emit('sync_state', classroomState);
    socket.on('classroom_action', (action) => {
      if (action.type === 'STUDENT_JOIN' && !classroomState.connectedStudents.includes(action.payload.studentId)) {
        classroomState.connectedStudents.push(action.payload.studentId);
      } else if (action.type === 'STUDENT_LEAVE') {
        classroomState.connectedStudents = classroomState.connectedStudents.filter(id => id !== action.payload.studentId);
      } else if (action.type === 'SET_OVERLAY') {
        classroomState.activeOverlay = action.payload.overlay;
      } else if (action.type === 'SPIN_WHEEL') {
        classroomState.activeOverlay = 'QUICK_WHEEL';
        classroomState.quickWheelWinner = action.payload.targetId;
        classroomState.selectionHistory.push(action.payload.targetId);
      } else if (action.type === 'CLOSE_OVERLAY') {
        classroomState.activeOverlay = null;
        classroomState.quickWheelWinner = null;
      } else if (action.type === 'DRAWING_START') {
        classroomState.drawings.push({ id: action.payload.id, color: action.payload.color, width: 4, points: [{ x: action.payload.x, y: action.payload.y }], isComplete: false });
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
      socket.broadcast.emit('classroom_action', action);
      io.emit('sync_state', classroomState);
    });
    socket.on('disconnect', () => {});
  });

  const actualPort = process.env.PORT || port;
  server.listen(actualPort, '0.0.0.0', () => console.log(`Server running on port ${actualPort}`));
  return server;
}

// Cleanup and start
(async () => {
  try {
    const net = await import('net');
    const cleanupServer = net.createServer();
    await new Promise(resolve => {
      cleanupServer.listen(3000, '0.0.0.0', () => { cleanupServer.close(resolve); });
      cleanupServer.on('error', resolve);
    });
    await startServer(3000);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();

export { startServer };