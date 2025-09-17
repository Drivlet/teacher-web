require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// ===== Config =====
const JUDGE0_URL = 'https://judge0-ce.p.rapidapi.com';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'your_rapidapi_key_here';
const RAPIDAPI_HOST = 'judge0-ce.p.rapidapi.com';

// ===== Health endpoint =====
app.get('/health', (req, res) => {
  console.log('Health check received');
  res.json({ status: 'OK', message: 'Server is running', timestamp: new Date().toISOString() });
});

// ===== Run Code Endpoint =====
app.post('/run', async (req, res) => {
  try {
    const { code, language_id = 71 } = req.body; // 71 = Python

    // Demo fallback if no key provided
    if (RAPIDAPI_KEY === 'your_rapidapi_key_here') {
      console.log('⚠ Using mock response (no API key set)');
      return res.json({
        output: "Hello, World!\n[Mock response - set up Judge0 API key]",
        status: "success"
      });
    }

    // Submit code to Judge0
    const response = await axios.post(
      `${JUDGE0_URL}/submissions`,
      {
        source_code: code,
        language_id: language_id,
        stdin: ''
      },
      {
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST,
          'Content-Type': 'application/json'
        },
        params: {
          base64_encoded: 'false',
          fields: '*'
        }
      }
    );

    const submissionId = response.data.token;

    // Poll result after 2s
    setTimeout(async () => {
      try {
        const resultResponse = await axios.get(
          `${JUDGE0_URL}/submissions/${submissionId}`,
          {
            headers: {
              'X-RapidAPI-Key': RAPIDAPI_KEY,
              'X-RapidAPI-Host': RAPIDAPI_HOST
            },
            params: {
              base64_encoded: 'false',
              fields: '*'
            }
          }
        );

        res.json({
          output: resultResponse.data.stdout || resultResponse.data.stderr || 'No output',
          status: resultResponse.data.status.description
        });
      } catch (error) {
        console.error('❌ Error fetching result:', error.message);
        res.status(500).json({ error: 'Failed to get execution result' });
      }
    }, 2000);

  } catch (error) {
    console.error('❌ Error executing code:', error.message);
    res.status(500).json({ error: 'Failed to execute code' });
  }
});

// ===== Socket.io Events =====
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // Join a session
  socket.on('join_session', (data) => {
    const { sessionId, userType, userName } = data;
    socket.join(sessionId);
    console.log(`${userName} (${userType}) joined session: ${sessionId}`);

    // Notify others in the session
    socket.to(sessionId).emit('user_joined', {
      userName,
      userType,
      message: `${userName} joined the session`
    });
  });

  // Handle editor changes from teacher
  socket.on('editor_change', (data) => {
    const { sessionId, code } = data;
    console.log('✍ Editor update for session:', sessionId);

    // Broadcast to students
    socket.to(sessionId).emit('editor_update', {
      code,
      updatedAt: new Date().toISOString()
    });
  });

  // Send quiz
  socket.on('send_quiz', (data) => {
    const { sessionId, quizText } = data;
    console.log('📤 Quiz sent to session:', sessionId);

    socket.to(sessionId).emit('quiz_received', {
      quizText,
      sentAt: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
  });
});

// ===== Start Server =====
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});