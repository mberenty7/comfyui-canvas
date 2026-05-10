const express = require('express');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { proxyRequest, uploadImageToComfy } = require('../services/comfyClient');

module.exports = function createComfyRouter({ configRef, upload, UPLOAD_DIR }) {
  const router = express.Router();

  router.post('/api/comfy/upload', upload.single('image'), async (req, res) => {
    try {
      const config = configRef();
      const file = req.file;
      const ext = path.extname(file.originalname) || '.png';
      const localName = path.basename(file.path) + ext;
      const localPath = file.path + ext;
      fs.renameSync(file.path, localPath);

      const fileData = fs.readFileSync(localPath);
      const mime = ext.match(/jpe?g/i) ? 'image/jpeg' : 'image/png';
      const result = await uploadImageToComfy(config.comfyUrl, localName, fileData, mime);

      res.json({
        localPath: `/uploads/${localName}`,
        comfyName: result.name || localName,
        originalName: file.originalname,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/comfy/prompt', async (req, res) => {
    try {
      const config = configRef();
      const payload = { prompt: req.body.workflow };
      if (config.comfyApiKey) {
        payload.extra_data = { api_key_comfy_org: config.comfyApiKey };
      }
      const result = await proxyRequest(config.comfyUrl, 'POST', '/prompt', payload);
      res.json(result.data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/comfy/history/:promptId', async (req, res) => {
    try {
      const config = configRef();
      const result = await proxyRequest(config.comfyUrl, 'GET', `/history/${req.params.promptId}`);
      res.json(result.data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/comfy/view', async (req, res) => {
    try {
      const config = configRef();
      const { filename, subfolder, type } = req.query;
      const params = new URLSearchParams({ filename, subfolder: subfolder || '', type: type || 'output' });
      const url = new URL(`${config.comfyUrl}/view?${params}`);

      http.get(url, (resp) => {
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

  router.get('/api/comfy/status', async (req, res) => {
    try {
      const config = configRef();
      const result = await proxyRequest(config.comfyUrl, 'GET', '/system_stats');
      res.json({ connected: true, ...result.data });
    } catch (err) {
      res.json({ connected: false, error: err.message });
    }
  });

  return router;
};
