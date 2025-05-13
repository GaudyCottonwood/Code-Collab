import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import io from 'socket.io-client';
import Editor from '@monaco-editor/react';
import SimpleEditor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-python';
import 'prismjs/themes/prism.css';

const SERVER_URL = `${window.location.protocol}//${window.location.hostname}:3001`;
const socket = io(SERVER_URL);
const ROOM = 'default';

export default function App() {
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [files, setFiles] = useState([]);
  const fileInputRef = useRef();
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  useEffect(() => {
    socket.emit('join', ROOM);
    socket.on('init', initial => setCode(initial));
    socket.on('code', updated => setCode(updated));
    socket.on('output', data => setOutput(prev => prev + data));
    socket.on('done', () => setRunning(false));
    socket.on('file-list', list => setFiles(list));
    return () => socket.disconnect();
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

  const uploadFile = async () => {
    const file = fileInputRef.current.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    await fetch(`${SERVER_URL}/upload`, { method: 'POST', body: form });
    fileInputRef.current.value = '';
  };

  return (
    <div className="app">
      {/* top split area */}
      <div className="main-area">
        <div className="editor-section">
          {isMobile ? (
            <SimpleEditor
              value={code}
              onValueChange={handleEditorChange}
              highlight={c => highlight(c, languages.python)}
              padding={12}
              className="mobile-editor"
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

        <pre className="output-panel">
          {output}
        </pre>
      </div>

      {/* controls row */}
      <div className="controls">
        <button
          onClick={runCode}
          disabled={running}
          className="button run"
        >
          {running ? 'Running…' : 'Run'}
        </button>
        <input type="file" ref={fileInputRef} />
        <button
          onClick={uploadFile}
          className="button upload"
        >
          Upload File
        </button>
      </div>

      {/* shared files list */}
      <div className="shared-files">
        <h4>Shared Files</h4>
        <ul>
          {files.map((f,i) => (
            <li key={i}>
              <a href={`${SERVER_URL}${f.url}`} download>
                {f.originalname}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
