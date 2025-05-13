import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import io from 'socket.io-client';
import Editor from '@monaco-editor/react';
import SimpleEditor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-python';
import 'prismjs/themes/prism.css';

const SERVER_PORT = 3001;
const SERVER_URL = `${window.location.protocol}//${window.location.hostname}:${SERVER_PORT}`;
const socket = io(SERVER_URL);
const ROOM = 'default';

export default function App() {
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef();
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  useEffect(() => {
    socket.emit('join', ROOM);

    socket.on('init', ({ code: initial, ip }) => {
      setCode(
        `# Connect at http://${ip}:3000\n\n` +
        initial.replace(/^# Write Python code here/, '')
      );
    });
    socket.on('code', updated => setCode(updated));
    socket.on('output', data => setOutput(prev => prev + data));
    socket.on('done', () => setRunning(false));
    socket.on('file-list', list => setFiles(list));

    return () => {
      socket.off('init');
      socket.off('code');
      socket.off('output');
      socket.off('done');
      socket.off('file-list');
      socket.disconnect();
    };
  }, []);

  const handleEditorChange = (value) => {
    setCode(value);
    socket.emit('code', { room: ROOM, value });
  };

  const runCode = () => {
    setOutput('');
    setRunning(true);
    socket.emit('compile', { room: ROOM });
  };

  const uploadFile = async (file) => {
    const form = new FormData();
    form.append('file', file);
    try {
      await fetch(`${SERVER_URL}/upload`, { method: 'POST', body: form });
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error('Upload failed', err);
    }
  };

  const onFileInputChange = (e) => {
    const file = e.target.files[0];
    if (file) uploadFile(file);
  };

  const clearFiles = async () => {
    try {
      await fetch(`${SERVER_URL}/clear-files`, { method: 'DELETE' });
      setOutput(''); // Clear the output panel
    } catch (err) {
      console.error('Clear files failed', err);
    }
  };  

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragging(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  return (
    <div className="container">
      <div className="top-split">
        <div className="editor-pane">
          {isMobile ? (
            <SimpleEditor
              value={code}
              onValueChange={handleEditorChange}
              highlight={c => highlight(c, languages.python)}
              padding={12}
              style={{
                width: '100%',
                height: '100%',
                fontFamily: 'monospace',
                fontSize: 14,
              }}
            />
          ) : (
            <Editor
              height="100%"
              language="python"
              value={code}
              onChange={handleEditorChange}
              theme="vs-dark"
            />
          )}
        </div>
        <div className="output-pane">
          <pre>{output}</pre>
        </div>
      </div>

      <div className="controls">
        <button onClick={runCode} disabled={running}>
          {running ? '…Running' : 'Run'}
        </button>
        <input type="file" ref={fileInputRef} onChange={onFileInputChange} />
        <button
          onClick={() =>
            fileInputRef.current?.files[0] &&
            uploadFile(fileInputRef.current.files[0])
          }
        >
          Upload File
        </button>
        <button onClick={clearFiles}>
          Clear
        </button>
      </div>

      <div
        className={`shared-files${dragging ? ' drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <h4>Shared Files</h4>
        <ul>
          {files.map((f, i) => (
            <li key={i}>
              <a href={`${SERVER_URL}${f.url}`} download>
                {f.originalname}
              </a>
            </li>
          ))}
        </ul>
        <p className="drop-hint">
          {dragging
            ? 'Release to upload'
            : 'Drag & drop a file here, or use the upload button above'}
        </p>
      </div>
    </div>
  );
}
