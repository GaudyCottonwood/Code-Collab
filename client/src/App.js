import React, { useState, useEffect, useRef } from 'react';
import './App.css'; // Ensure this is the revised App.css from the previous step
import io from 'socket.io-client';
import Editor from '@monaco-editor/react';
import SimpleEditor from 'react-simple-code-editor';

// --- PrismJS Setup ---
// 1. Import the core Prism object first.
import Prism from 'prismjs/components/prism-core';
// 2. Import 'clike' as it's a common dependency.
import 'prismjs/components/prism-clike';
// 3. Then import other languages. Order can sometimes matter if one extends another.
//    JavaScript extends clike. Python and C are generally standalone or depend on clike.
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-c';
// 4. Import a theme.
import 'prismjs/themes/prism-tomorrow.css'; // Using prism-tomorrow for a dark theme example. Or use your preferred.

const SERVER_PORT = 3001;
const SERVER_URL = `${window.location.protocol}//${window.location.hostname}:${SERVER_PORT}`;
const socket = io(SERVER_URL);
const ROOM = 'default';

const defaultSnippets = {
  python: '# Write Python code here\nprint("Hello, Python World!")',
  javascript: '// Write JavaScript code here\nconsole.log("Hello, JavaScript World!");',
  c: '// Write C code here\n#include <stdio.h>\n\nint main() {\n  printf("Hello, C World!\\n");\n  return 0;\n}',
};

export default function App() {
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [language, setLanguage] = useState('python');
  const [serverIp, setServerIp] = useState('localhost');

  const fileInputRef = useRef(null);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  useEffect(() => {
    socket.emit('join', ROOM);

    socket.on('init', ({ code: initialCode, ip, roomLanguage }) => {
      setServerIp(ip);
      const currentLang = roomLanguage || language;
      setLanguage(currentLang);

      let displayCode = `# Connect at http://${ip}:${window.location.port || 3000}\n# Language: ${currentLang}\n\n`;
      if (initialCode) {
        displayCode += initialCode;
      } else {
        displayCode += defaultSnippets[currentLang] || `// Code for ${currentLang}`;
      }
      setCode(displayCode);
    });

    socket.on('code', (updatedCode) => {
      setCode(prevCode => {
        const headerMatch = prevCode.match(/^# Connect at.*\n# Language:.*\n\n/);
        const header = headerMatch ? headerMatch[0] : '';
        return header + updatedCode;
      });
    });

    socket.on('output', (data) => setOutput((prev) => prev + data));
    socket.on('done', () => setRunning(false));
    socket.on('file-list', (fileList) => setFiles(fileList));

    socket.on('roomLanguageChanged', ({ language: newLanguage, code: newCode }) => {
      setLanguage(newLanguage);
      const header = `# Connect at http://${serverIp}:${window.location.port || 3000}\n# Language: ${newLanguage}\n\n`;
      setCode(header + (newCode || defaultSnippets[newLanguage] || `// Code for ${newLanguage}`));
    });

    return () => {
      socket.off('init');
      socket.off('code');
      socket.off('output');
      socket.off('done');
      socket.off('file-list');
      socket.off('roomLanguageChanged');
    };
  }, [language, serverIp]); // Added language and serverIp as dependencies

  const handleEditorChange = (value) => {
    const headerMatch = value.match(/^# Connect at.*\n# Language:.*\n\n/);
    const codeOnly = headerMatch ? value.substring(headerMatch[0].length) : value;
    setCode(value);
    socket.emit('code', { room: ROOM, value: codeOnly, language: language });
  };

  const runCode = () => {
    setOutput('');
    setRunning(true);
    const headerMatch = code.match(/^# Connect at.*\n# Language:.*\n\n/);
    const codeToRun = headerMatch ? code.substring(headerMatch[0].length) : code;
    socket.emit('compile', { room: ROOM, language: language, code: codeToRun });
  };

  const uploadFile = async (file) => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      await fetch(`${SERVER_URL}/upload`, { method: 'POST', body: form });
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error('Upload failed', err);
      setOutput((prev) => prev + `Error uploading file: ${err.message}\n`);
    }
  };

  const onFileInputChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) uploadFile(file);
  };

  const clearFiles = async () => {
    try {
      await fetch(`${SERVER_URL}/clear-files`, { method: 'DELETE' });
      // setOutput(''); // Optionally clear output
    } catch (err) {
      console.error('Clear files failed', err);
      setOutput((prev) => prev + `Error clearing files: ${err.message}\n`);
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
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  // Syntax highlighting for SimpleEditor (mobile)
  const highlightCodeWithPrism = (codeToHighlight) => {
    // Ensure the language component is loaded in Prism.languages
    if (Prism.languages[language]) {
      return Prism.highlight(codeToHighlight, Prism.languages[language], language);
    }
    return codeToHighlight; // Fallback if language not found
  };

  const handleLanguageChange = (newLanguage) => {
    setLanguage(newLanguage);
    const header = `# Connect at http://${serverIp}:${window.location.port || 3000}\n# Language: ${newLanguage}\n\n`;
    const newDefaultCode = defaultSnippets[newLanguage] || `// Code for ${newLanguage}`;
    const fullCode = header + newDefaultCode;
    setCode(fullCode);
    setOutput('');

    if (socket.connected) {
      socket.emit('languageChange', {
        room: ROOM,
        language: newLanguage,
        defaultCode: newDefaultCode,
      });
    }
  };

  return (
    <div className="container">
      <div className="top-split">
        <div className="editor-pane">
          {isMobile ? (
            <SimpleEditor
              value={code}
              onValueChange={handleEditorChange}
              highlight={highlightCodeWithPrism} // Use the updated Prism highlighter
              padding={12}
              className="mobile-editor" // Added className for specific mobile styling
              style={{ // Basic inline styles, prefer App.css for more complex ones
                width: '100%',
                height: '100%',
                fontFamily: 'monospace',
                fontSize: 14,
                overflow: 'auto'
              }}
            />
          ) : (
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={handleEditorChange}
              theme="vs-dark"
              options={{
                wordWrap: 'on',
                minimap: { enabled: true },
                fontSize: 14,
              }}
            />
          )}
        </div>
        <div className="output-pane">
          <pre>{output}</pre>
        </div>
      </div>

      <div className="controls">
        <select value={language} onChange={(e) => handleLanguageChange(e.target.value)} className="language-selector">
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
          <option value="c">C</option>
        </select>
        <button onClick={runCode} disabled={running} className="run-button">
          {running ? '…Running' : 'Run'}
        </button>
        <input type="file" ref={fileInputRef} onChange={onFileInputChange} style={{ display: 'none' }} id="fileUploadInput" />
        <button onClick={() => fileInputRef.current && fileInputRef.current.click()} className="upload-button">
          Upload File
        </button>
        <button onClick={clearFiles} className="clear-button">
          Clear Files
        </button>
      </div>

      <div
        className={`shared-files${dragging ? ' drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <h4>Shared Files</h4>
        {files.length === 0 ? (
          <p>No files shared yet.</p>
        ) : (
          <ul>
            {files.map((f, i) => (
              <li key={i}>
                <a href={`${SERVER_URL}${f.url}`} download={f.originalname}>
                  {f.originalname}
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="drop-hint">
          {dragging
            ? 'Release to upload'
            : 'Drag & drop a file here, or use the upload button above'}
        </p>
      </div>
    </div>
  );
}