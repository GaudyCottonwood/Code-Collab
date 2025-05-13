// Directory structure:
//
// code-collab/
// ├── server/
// │   ├── package.json
// │   └── server.js
// └── client/
//     ├── package.json
//     ├── public/
//     │   └── index.html
//     └── src/
//         ├── index.js
//         └── App.js
const os = require('os');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(cors());

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

// Setup file uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname)
});
const upload = multer({ storage });
app.use('/uploads', express.static(uploadDir));

// Configure Python command by OS
const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';

// In-memory stores
const codeStore = {};
const uploadedFiles = [];

// HTTP endpoint for file upload
app.post('/upload', upload.single('file'), (req, res) => {
  const fileMeta = {
    filename: req.file.filename,
    originalname: req.file.originalname,
    url: `/uploads/${req.file.filename}`
  };
  uploadedFiles.push(fileMeta);
  io.emit('file-list', uploadedFiles);
  res.json({ success: true, file: fileMeta });
});


// Clear uploaded files
app.delete('/clear-files', (req, res) => {
  uploadedFiles.length = 0;
  io.emit('file-list', uploadedFiles);
  res.status(200).send({ message: 'All files cleared' });
});




const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3001;

io.on('connection', socket => {
  // Send initial code and file list
  socket.emit('file-list', uploadedFiles);

  socket.on('join', room => {
    socket.join(room);
    if (!codeStore[room]) codeStore[room] = '# Write Python code here';
    socket.emit('init', {
      code: codeStore[room],
      ip: serverIp
    });
  });

  socket.on('code', ({ room, value }) => {
    codeStore[room] = value;
    socket.to(room).emit('code', value);
  });

  socket.on('compile', ({ room }) => {
    const source = codeStore[room] || '';
    const filename = `temp_${socket.id}.py`;
    const filepath = path.join(__dirname, filename);

    fs.writeFileSync(filepath, source);
    const proc = spawn(pythonCmd, [filepath]);

    proc.stdout.on('data', data => io.to(room).emit('output', data.toString()));
    proc.stderr.on('data', data => io.to(room).emit('output', data.toString()));

    proc.on('close', () => {
      fs.unlinkSync(filepath);
      io.to(room).emit('done');
    });
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Server on ${serverIp}:${PORT}`));