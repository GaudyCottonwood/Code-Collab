// server/server.js
const os = require('os');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { spawn, exec } = require('child_process'); // Added exec for C compilation
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(cors());

// Function to get local IP address for display
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const serverIp = getLocalIP();
const SERVER_PORT = process.env.PORT || 3001;

// --- File Upload Setup ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});
const upload = multer({ storage });
app.use('/uploads', express.static(uploadDir)); // Serve uploaded files

// --- In-memory Stores ---
// roomData will store { code: { python: "...", javascript: "...", c: "..." }, currentLanguage: "python" }
const roomData = {};
const uploadedFiles = []; // Stores metadata of uploaded files

// --- Default Code Snippets ---
const defaultSnippets = {
  python: '# Write Python code here\nprint("Hello, Python World!")',
  javascript: '// Write JavaScript code here\nconsole.log("Hello, JavaScript World!");',
  c: '// Write C code here\n#include <stdio.h>\n\nint main() {\n  printf("Hello, C World!\\n");\n  return 0;\n}',
};

// --- Language Execution Configuration ---
const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';
const nodeCmd = process.platform === 'win32' ? 'node' : 'node';
// Ensure GCC (or your chosen C compiler) is installed and in the system's PATH.
const cCompiler = 'gcc';

const languageConfigs = {
  python: {
    extension: '.py',
    getRunCommand: (filepath) => `${pythonCmd} "${filepath}"`, // Enclose filepath in quotes
    cleanup: (sourceFile) => {
      if (fs.existsSync(sourceFile)) fs.unlinkSync(sourceFile);
    },
  },
  javascript: {
    extension: '.js',
    getRunCommand: (filepath) => `${nodeCmd} "${filepath}"`, // Enclose filepath in quotes
    cleanup: (sourceFile) => {
      if (fs.existsSync(sourceFile)) fs.unlinkSync(sourceFile);
    },
  },
  c: {
    extension: '.c',
    getCompileCommand: (sourceFile, outputFile) => `${cCompiler} "${sourceFile}" -o "${outputFile}" -std=c11 -Wall -Wextra`, // Added common flags
    getRunCommand: (outputFile) => (process.platform === 'win32' ? `"${outputFile}"` : `./"${outputFile}"`), // Enclose
    getOutputFilename: (base) => (process.platform === 'win32' ? `${base}.exe` : base),
    cleanup: (sourceFile, outputFile) => {
      if (fs.existsSync(sourceFile)) fs.unlinkSync(sourceFile);
      if (outputFile && fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    },
  },
};

// --- HTTP Endpoints ---
// File Upload
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }
  const fileMeta = {
    filename: req.file.filename,
    originalname: req.file.originalname,
    url: `/uploads/${req.file.filename}`,
  };
  uploadedFiles.push(fileMeta);
  io.emit('file-list', uploadedFiles); // Notify all clients
  res.json({ success: true, file: fileMeta });
});

// Clear Uploaded Files
app.delete('/clear-files', (req, res) => {
  // Basic in-memory clearing. For persistent storage, you'd delete files from disk.
  const uploadDirContent = fs.readdirSync(uploadDir);
  for (const file of uploadDirContent) {
    try {
      fs.unlinkSync(path.join(uploadDir, file));
    } catch (err) {
      console.error(`Failed to delete file ${file}:`, err);
      // Decide if you want to stop or continue. For now, continue.
    }
  }
  uploadedFiles.length = 0; // Clear the in-memory list
  io.emit('file-list', uploadedFiles); // Notify all clients
  res.status(200).send({ message: 'All uploaded files and their records cleared.' });
});


// --- Socket.IO Setup ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for simplicity in local dev
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  socket.emit('file-list', uploadedFiles); // Send current file list to new user

  // Handle user joining a room
  socket.on('join', (room) => {
    socket.join(room);
    console.log(`User ${socket.id} joined room: ${room}`);

    // Initialize room data if it doesn't exist
    if (!roomData[room]) {
      roomData[room] = {
        code: { ...defaultSnippets }, // Store code for each language
        currentLanguage: 'python', // Default language for the room
      };
    }

    // Send initial state for the room to the joining user
    socket.emit('init', {
      code: roomData[room].code[roomData[room].currentLanguage],
      ip: serverIp,
      roomLanguage: roomData[room].currentLanguage,
    });
  });

  // Handle code changes from a client
  socket.on('code', ({ room, value, language }) => {
    if (roomData[room] && roomData[room].code && language) {
      roomData[room].code[language] = value;
      // Broadcast the changed code (just the value) to other clients in the room
      // The client-side will handle displaying it based on their currently selected language
      socket.to(room).emit('code', value);
    }
  });

  // Handle language change for the room
  socket.on('languageChange', ({ room, language, defaultCode }) => {
    if (roomData[room] && languageConfigs[language]) {
      roomData[room].currentLanguage = language;
      // If no code exists for this language in this room yet, set the default
      if (typeof roomData[room].code[language] === 'undefined') {
        roomData[room].code[language] = defaultCode || defaultSnippets[language] || `// Code for ${language}`;
      }
      // Notify all clients in the room about the language change
      io.to(room).emit('roomLanguageChanged', {
        language: roomData[room].currentLanguage,
        code: roomData[room].code[language],
      });
      console.log(`Room ${room} language changed to ${language}`);
    }
  });

  // Handle code compilation and execution request
  socket.on('compile', ({ room, language, code: sourceCode }) => {
    if (!roomData[room] || !language || typeof sourceCode === 'undefined') {
      io.to(room).emit('output', 'Error: Room, language, or code not specified.\n');
      io.to(room).emit('done');
      return;
    }

    const langConfig = languageConfigs[language];
    if (!langConfig) {
      io.to(room).emit('output', `Error: Language "${language}" is not supported.\n`);
      io.to(room).emit('done');
      return;
    }

    // Unique base for temporary files
    const baseTempFilename = `temp_${socket.id}_${Date.now()}`;
    const sourceFilename = langConfig.extension ? `${baseTempFilename}${langConfig.extension}` : baseTempFilename;
    const sourceFilepath = path.join(__dirname, sourceFilename);

    let outputExecutablePath = null;
    if (langConfig.getOutputFilename) {
      outputExecutablePath = path.join(__dirname, langConfig.getOutputFilename(baseTempFilename));
    }

    fs.writeFileSync(sourceFilepath, sourceCode);

    const cleanupFunc = () => {
      langConfig.cleanup(sourceFilepath, outputExecutablePath);
    };

    const runCmdStr = langConfig.getRunCommand(outputExecutablePath || sourceFilepath);

    const executeCode = () => {
      // Ensure command and arguments are split correctly for spawn
      const commandParts = runCmdStr.split(' ');
      const command = commandParts[0];
      const args = commandParts.slice(1);

      const proc = spawn(command, args, { shell: process.platform === 'win32' }); // Use shell on Windows for .exe

      proc.stdout.on('data', (data) => io.to(room).emit('output', data.toString()));
      proc.stderr.on('data', (data) => io.to(room).emit('output', `STDERR: ${data.toString()}`));

      proc.on('error', (err) => {
        io.to(room).emit('output', `Execution error: ${err.message}\n`);
        cleanupFunc();
        io.to(room).emit('done');
      });

      proc.on('close', (exitCode) => {
        if (exitCode !== 0) {
          io.to(room).emit('output', `Process exited with code ${exitCode}\n`);
        }
        cleanupFunc();
        io.to(room).emit('done');
      });
    };

    if (langConfig.getCompileCommand && outputExecutablePath) {
      const compileCmdStr = langConfig.getCompileCommand(sourceFilepath, outputExecutablePath);
      exec(compileCmdStr, (error, stdout, stderr) => {
        if (error) {
          io.to(room).emit('output', `Compilation Error: ${error.message}\n`);
          if (stderr) io.to(room).emit('output', `Compilation STDERR: ${stderr}\n`);
          cleanupFunc();
          io.to(room).emit('done');
          return;
        }
        if (stderr) {
          io.to(room).emit('output', `Compilation Warnings: ${stderr}\n`);
        }
        executeCode(); // Run the compiled executable
      });
    } else {
      executeCode(); // For interpreted languages
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Optionally, implement logic to clean up roomData if all users leave a room
  });
});

server.listen(SERVER_PORT, '0.0.0.0', () => {
  console.log(`Server running on http://${serverIp}:${SERVER_PORT}`);
  console.log('Make sure GCC (or your chosen C compiler) and Node.js are installed and in your system PATH for C and JavaScript execution.');
});