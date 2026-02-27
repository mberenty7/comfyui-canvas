const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;
const COMFY_URL = process.env.COMFY_URL || 'http://100.75.225.122:8188';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const CANVAS_DIR = path.join(__dirname, 'canvases');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(CANVAS_DIR, { recursive: true });

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOAD_DIR));

const upload = multer({ dest: UPLOAD_DIR });

// ── Template System ──────────────────────────
app.get('/api/templates', (req, res) => {
  const templateDir = path.join(__dirname, 'templates');
  const templates = [];
  for (const name of fs.readdirSync(templateDir)) {
    const configPath = path.join(templateDir, name, 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      templates.push({ id: name, ...config });
    }
  }
  res.json(templates);
});

app.get('/api/templates/:id', (req, res) => {
  const dir = path.join(__dirname, 'templates', req.params.id);
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  const workflow = JSON.parse(fs.readFileSync(path.join(dir, 'workflow.json'), 'utf8'));
  res.json({ ...config, workflow });
});

// ── Image Upload ─────────────────────────────
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const ext = path.extname(file.originalname) || '.png';
    const newPath = file.path + ext;
    fs.renameSync(file.path, newPath);

    // Also upload to ComfyUI
    const filename = path.basename(newPath);
    await uploadToComfy(newPath, filename);

    res.json({ filename, path: `/uploads/${path.basename(newPath)}`, comfyName: filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function uploadToComfy(filePath, filename) {
  const FormData = (await import('node-fetch')).default ? null : null;
  // Use raw http to upload multipart
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(filePath);
    const boundary = '----NodeFormBoundary' + Math.random().toString(36).slice(2);
    const mime = filename.endsWith('.jpg') || filename.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const url = new URL(`${COMFY_URL}/upload/image`);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── ComfyUI Proxy ────────────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const { workflow, nodeId } = req.body;
    const data = JSON.stringify({ prompt: workflow });

    const result = await new Promise((resolve, reject) => {
      const url = new URL(`${COMFY_URL}/prompt`);
      const req = http.request({
        hostname: url.hostname, port: url.port, path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });

    res.json({ prompt_id: result.prompt_id, nodeId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Poll ComfyUI history for a prompt
app.get('/api/history/:promptId', async (req, res) => {
  try {
    const result = await new Promise((resolve, reject) => {
      const url = new URL(`${COMFY_URL}/history/${req.params.promptId}`);
      http.get(url, (resp) => {
        let body = '';
        resp.on('data', c => body += c);
        resp.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy ComfyUI output images
app.get('/api/comfy-image', async (req, res) => {
  try {
    const { filename, subfolder, type } = req.query;
    const params = new URLSearchParams({ filename, subfolder: subfolder || '', type: type || 'output' });
    const url = new URL(`${COMFY_URL}/view?${params}`);

    http.get(url, (resp) => {
      // Save locally too
      const localPath = path.join(UPLOAD_DIR, filename);
      const writeStream = fs.createWriteStream(localPath);
      const chunks = [];
      resp.on('data', c => { chunks.push(c); writeStream.write(c); });
      resp.on('end', () => {
        writeStream.end();
        res.set('Content-Type', 'image/png');
        res.send(Buffer.concat(chunks));
      });
    }).on('error', err => res.status(500).json({ error: err.message }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Canvas Save/Load ─────────────────────────
app.post('/api/canvas/save', (req, res) => {
  const { name, data } = req.body;
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  fs.writeFileSync(path.join(CANVAS_DIR, `${safeName}.json`), JSON.stringify(data, null, 2));
  res.json({ ok: true, name: safeName });
});

app.get('/api/canvas/list', (req, res) => {
  const files = fs.readdirSync(CANVAS_DIR).filter(f => f.endsWith('.json'));
  res.json(files.map(f => f.replace('.json', '')));
});

app.get('/api/canvas/load/:name', (req, res) => {
  const filePath = path.join(CANVAS_DIR, `${req.params.name}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
});

// ── WebSocket for ComfyUI progress relay ─────
const wss = new WebSocket.Server({ server, path: '/ws' });

function connectComfyWS() {
  const comfyWsUrl = COMFY_URL.replace('http', 'ws') + '/ws?clientId=canvas-app';
  const comfyWs = new WebSocket(comfyWsUrl);

  comfyWs.on('message', (data) => {
    // Relay to all connected clients
    const msg = data.toString();
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  });

  comfyWs.on('close', () => {
    console.log('ComfyUI WS disconnected, reconnecting in 5s...');
    setTimeout(connectComfyWS, 5000);
  });

  comfyWs.on('error', (err) => {
    console.error('ComfyUI WS error:', err.message);
  });
}

connectComfyWS();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Canvas server: http://0.0.0.0:${PORT}`);
  console.log(`ComfyUI backend: ${COMFY_URL}`);
});
