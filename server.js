const express = require('express');
const http = require('http');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const CONFIG_FILE = path.join(__dirname, 'config.json');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Load or create config
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }
  return {
    comfyUrl: process.env.COMFY_URL || 'http://localhost:8188',
    outputDir: process.env.OUTPUT_DIR || '',
    comfyApiKey: process.env.COMFY_API_KEY || '',
  };
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

let config = loadConfig();

const MODELS_DIR = path.join(__dirname, 'models');
fs.mkdirSync(MODELS_DIR, { recursive: true });

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/models', express.static(MODELS_DIR));

const upload = multer({ dest: UPLOAD_DIR });

// ── Config ───────────────────────────────────

app.get('/api/config', (req, res) => {
  res.json(config);
});

app.post('/api/config', (req, res) => {
  config = { ...config, ...req.body };
  saveConfig(config);
  res.json(config);
});

// ── Templates ────────────────────────────────

app.get('/api/templates', (req, res) => {
  const templateDir = path.join(__dirname, 'templates');
  const templates = [];
  if (fs.existsSync(templateDir)) {
    for (const name of fs.readdirSync(templateDir)) {
      const configPath = path.join(templateDir, name, 'config.json');
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        templates.push({ id: name, ...cfg });
      }
    }
  }
  res.json(templates);
});

app.get('/api/templates/:id', (req, res) => {
  const dir = path.join(__dirname, 'templates', req.params.id);
  const cfgPath = path.join(dir, 'config.json');
  const wfPath = path.join(dir, 'workflow.json');
  if (!fs.existsSync(cfgPath)) return res.status(404).json({ error: 'Not found' });
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const workflow = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
  res.json({ id: req.params.id, ...cfg, workflow });
});

// ── Image Upload ─────────────────────────────

app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    const file = req.file;
    const ext = path.extname(file.originalname) || '.png';
    const newPath = file.path + ext;
    fs.renameSync(file.path, newPath);
    res.json({
      filename: path.basename(newPath),
      originalName: file.originalname,
      path: `/uploads/${path.basename(newPath)}`,
      comfyName: path.basename(newPath),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 3D Model Upload ─────────────────────────

app.post('/api/models/upload', upload.single('model'), (req, res) => {
  try {
    const file = req.file;
    const ext = path.extname(file.originalname) || '.glb';
    const safeName = file.filename + ext;
    const newPath = path.join(MODELS_DIR, safeName);
    fs.renameSync(file.path, newPath);
    res.json({
      filename: safeName,
      originalName: file.originalname,
      path: `/models/${safeName}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ComfyUI Proxy ────────────────────────────

function proxyRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.comfyUrl + urlPath);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {},
    };
    if (body) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(opts, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        try { resolve({ status: res.statusCode, data: JSON.parse(buf.toString()) }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// Upload image to ComfyUI
app.post('/api/comfy/upload', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const ext = path.extname(file.originalname) || '.png';
    const localName = path.basename(file.path) + ext;
    const localPath = file.path + ext;
    fs.renameSync(file.path, localPath);

    // Upload to ComfyUI
    const fileData = fs.readFileSync(localPath);
    const boundary = '----NodeFormBoundary' + Math.random().toString(36).slice(2);
    const mime = ext.match(/jpe?g/i) ? 'image/jpeg' : 'image/png';

    const bodyParts = [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${localName}"\r\nContent-Type: ${mime}\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ];
    const bodyBuf = Buffer.concat(bodyParts);

    const url = new URL(config.comfyUrl + '/upload/image');
    const result = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: url.hostname, port: url.port, path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': bodyBuf.length },
      }, (resp) => {
        let data = '';
        resp.on('data', c => data += c);
        resp.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', reject);
      req.write(bodyBuf);
      req.end();
    });

    res.json({
      localPath: `/uploads/${localName}`,
      comfyName: result.name || localName,
      originalName: file.originalname,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit workflow to ComfyUI
app.post('/api/comfy/prompt', async (req, res) => {
  try {
    const payload = { prompt: req.body.workflow };
    // Include API key for partner nodes if configured
    if (config.comfyApiKey) {
      payload.extra_data = { api_key_comfy_org: config.comfyApiKey };
      console.log('[Prompt] Sending with API key:', config.comfyApiKey.substring(0, 12) + '...');
    } else {
      console.log('[Prompt] No API key configured');
    }
    console.log('[Prompt] Payload keys:', JSON.stringify(Object.keys(payload)));
    const result = await proxyRequest('POST', '/prompt', payload);
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Poll history for a prompt
app.get('/api/comfy/history/:promptId', async (req, res) => {
  try {
    const result = await proxyRequest('GET', `/history/${req.params.promptId}`);
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy ComfyUI output images
app.get('/api/comfy/view', async (req, res) => {
  try {
    const { filename, subfolder, type } = req.query;
    const params = new URLSearchParams({ filename, subfolder: subfolder || '', type: type || 'output' });
    const url = new URL(`${config.comfyUrl}/view?${params}`);

    http.get(url, (resp) => {
      // Save locally too
      const localPath = path.join(UPLOAD_DIR, filename);
      const writeStream = fs.createWriteStream(localPath);
      const chunks = [];
      resp.on('data', c => { chunks.push(c); writeStream.write(c); });
      resp.on('end', () => {
        writeStream.end();
        const contentType = resp.headers['content-type'] || 'image/png';
        res.set('Content-Type', contentType);
        res.send(Buffer.concat(chunks));
      });
    }).on('error', err => res.status(500).json({ error: err.message }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check ComfyUI connectivity
app.get('/api/comfy/status', async (req, res) => {
  try {
    const result = await proxyRequest('GET', '/system_stats');
    res.json({ connected: true, ...result.data });
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

// ── Sidecar metadata ─────────────────────────

// Save generation output: fetch image from ComfyUI, save image + sidecar to output dir
app.post('/api/comfy/save-output', async (req, res) => {
  try {
    const { filename, subfolder, type, metadata } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename required' });

    const sidecarName = filename.replace(/\.(png|jpg|jpeg|webp|gif)$/i, '.json');
    const jsonData = metadata ? JSON.stringify(metadata, null, 2) : null;

    // Always save sidecar locally in uploads/
    if (jsonData) {
      fs.writeFileSync(path.join(UPLOAD_DIR, sidecarName), jsonData);
    }

    // If output directory is configured, fetch image from ComfyUI and save both there
    const outputDir = config.outputDir;
    if (outputDir) {
      try {
        const outSubdir = subfolder ? path.join(outputDir, subfolder) : outputDir;
        fs.mkdirSync(outSubdir, { recursive: true });

        // Fetch image from ComfyUI and save to output dir
        const params = new URLSearchParams({
          filename,
          subfolder: subfolder || '',
          type: type || 'output',
        });
        const url = new URL(`${config.comfyUrl}/view?${params}`);

        await new Promise((resolve, reject) => {
          http.get(url, (resp) => {
            const imgPath = path.join(outSubdir, filename);
            const writeStream = fs.createWriteStream(imgPath);
            resp.pipe(writeStream);
            writeStream.on('finish', () => {
              console.log(`[Output] Image saved to ${imgPath}`);
              resolve();
            });
            writeStream.on('error', reject);
          }).on('error', reject);
        });

        // Save sidecar JSON alongside image
        if (jsonData) {
          const metaPath = path.join(outSubdir, sidecarName);
          fs.writeFileSync(metaPath, jsonData);
          console.log(`[Output] Sidecar saved to ${metaPath}`);
        }
      } catch (err) {
        console.error(`[Output] Failed to save to output dir: ${err.message}`);
      }
    }

    res.json({ saved: true, filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Prompt Library ───────────────────────────

function getPromptsDir() {
  if (config.outputDir) return path.join(config.outputDir, 'Prompts');
  return path.join(__dirname, 'prompts');
}

// List all saved prompts
app.get('/api/prompts', async (req, res) => {
  try {
    const dir = getPromptsDir();
    if (!fs.existsSync(dir)) return res.json({ prompts: [] });

    const files = await fs.promises.readdir(dir);
    const prompts = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = JSON.parse(await fs.promises.readFile(path.join(dir, file), 'utf8'));
        prompts.push({
          filename: file,
          name: data.name || file.replace('.json', ''),
          positive: data.positive || '',
          negative: data.negative || '',
          tags: data.tags || [],
          created: data.created || null,
          modified: data.modified || null,
        });
      } catch {}
    }

    prompts.sort((a, b) => (b.modified || b.created || '').localeCompare(a.modified || a.created || ''));
    res.json({ prompts, dir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save a prompt to the library
app.post('/api/prompts', (req, res) => {
  try {
    const { name, positive, negative, tags } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    const dir = getPromptsDir();
    fs.mkdirSync(dir, { recursive: true });

    const safeName = name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
    const filename = `${safeName}.json`;
    const filePath = path.join(dir, filename);

    const existing = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};

    const data = {
      name: safeName,
      positive: positive || '',
      negative: negative || '',
      tags: tags || [],
      created: existing.created || new Date().toISOString(),
      modified: new Date().toISOString(),
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`[Prompts] Saved: ${filePath}`);
    res.json({ saved: true, filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a prompt from the library
app.delete('/api/prompts/:filename', (req, res) => {
  try {
    const dir = getPromptsDir();
    const filePath = path.join(dir, path.basename(req.params.filename));
    if (!filePath.startsWith(dir)) return res.status(403).json({ error: 'Invalid path' });
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Gallery: Browse images ───────────────────

// Browse ComfyUI output history
app.get('/api/gallery', async (req, res) => {
  try {
    const histResult = await proxyRequest('GET', '/history?max_items=100');
    if (histResult.status !== 200) return res.json({ images: [] });

    const images = [];
    const seen = new Set();
    const entries = Object.entries(histResult.data || {}).reverse();
    for (const [promptId, entry] of entries) {
      for (const [, nodeOut] of Object.entries(entry.outputs || {})) {
        for (const img of (nodeOut.images || nodeOut.gifs || [])) {
          const key = `${img.subfolder || ''}/${img.filename}`;
          if (seen.has(key)) continue;
          seen.add(key);
          images.push({
            filename: img.filename,
            subfolder: img.subfolder || '',
            type: img.type || 'output',
            source: 'comfy',
            promptId,
          });
        }
      }
    }
    res.json({ images });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Browse arbitrary directory
app.get('/api/gallery/dir', async (req, res) => {
  try {
    const dirPath = req.query.path;
    if (!dirPath) return res.status(400).json({ error: 'path required' });

    const resolved = path.resolve(dirPath);
    const images = [];

    async function scanDir(dir) {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name.startsWith('@')) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (/\.(png|jpg|jpeg|webp|gif)$/i.test(entry.name)) {
          const stat = await fs.promises.stat(fullPath);
          if (stat.size === 0) continue;
          const relDir = path.dirname(path.relative(resolved, fullPath)) || '';
          images.push({
            filename: entry.name,
            source: 'dir',
            dirPath: path.dirname(fullPath),
            subfolder: relDir === '.' ? '' : relDir,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        }
      }
    }

    await scanDir(resolved);

    // Newest first
    images.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    // Cap at 200 to avoid huge payloads
    images.splice(200);
    res.json({ images, dirPath: resolved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get sidecar metadata for a gallery image (checks uploads/ for cached sidecars)
app.get('/api/gallery/sidecar', async (req, res) => {
  try {
    const { filename, dir } = req.query;
    if (!filename) return res.status(400).json({ error: 'filename required' });
    const sidecarName = filename.replace(/\.(png|jpg|jpeg|webp|gif)$/i, '.json');

    // Check dir source first (custom directory)
    if (dir) {
      const dirPath = path.resolve(dir, sidecarName);
      if (fs.existsSync(dirPath)) {
        return res.json(JSON.parse(fs.readFileSync(dirPath, 'utf8')));
      }
    }

    // Check uploads/ (our cached sidecars)
    const localPath = path.join(UPLOAD_DIR, sidecarName);
    if (fs.existsSync(localPath)) {
      return res.json(JSON.parse(fs.readFileSync(localPath, 'utf8')));
    }

    res.json(null);
  } catch (err) {
    res.json(null);
  }
});

// Serve image from arbitrary directory
app.get('/api/gallery/dir/image', (req, res) => {
  const { dir, filename } = req.query;
  if (!dir || !filename) return res.status(400).json({ error: 'dir and filename required' });
  const resolved = path.resolve(dir, path.basename(filename));
  if (!resolved.startsWith(path.resolve(dir))) return res.status(403).json({ error: 'Invalid path' });
  res.sendFile(resolved);
});

// ── Start ────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Canvas server: http://localhost:${PORT}`);
  console.log(`ComfyUI backend: ${config.comfyUrl}`);
});
