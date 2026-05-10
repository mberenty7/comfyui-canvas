const express = require('express');
const fs = require('fs');
const { proxyRequest, uploadImageToComfy } = require('../services/comfyClient');
const { getTemplate, listTemplates } = require('../services/templateService');
const { applyTemplateParams, applyPromptInputs, applyDefaultSeeds, applyBatchGroups } = require('../services/workflowBuilder');

module.exports = function createWorkflowRouter({ rootDir, configRef }) {
  const router = express.Router();

  router.post('/api/workflow/run', async (req, res) => {
    try {
      const config = configRef();
      const { template, params = {}, images = {}, wait = true, timeout = 120 } = req.body;
      if (!template) return res.status(400).json({ error: 'template is required' });

      const loaded = getTemplate(rootDir, template);
      if (!loaded) return res.status(404).json({ error: `Template '${template}' not found` });
      const cfg = loaded;
      const workflow = loaded.workflow;

      async function uploadBase64(dataUrl, name) {
        let base64Data, ext;
        if (dataUrl.startsWith('data:')) {
          base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          ext = dataUrl.match(/^data:image\/(\w+)/)?.[1] === 'jpeg' ? '.jpg' : '.png';
        } else {
          base64Data = dataUrl;
          ext = '.png';
        }
        const buf = Buffer.from(base64Data, 'base64');
        const filename = `wfrun_${name}_${Date.now()}${ext}`;
        const mime = ext === '.jpg' ? 'image/jpeg' : 'image/png';
        const result = await uploadImageToComfy(config.comfyUrl, filename, buf, mime);
        return result.name;
      }

      async function uploadFromPath(filePath, name) {
        const fileData = fs.readFileSync(filePath);
        const ext = filePath.split('.').pop()?.toLowerCase();
        const filename = `wfrun_${name}_${Date.now()}.${ext || 'png'}`;
        const mime = /jpe?g/i.test(ext || '') ? 'image/jpeg' : 'image/png';
        const result = await uploadImageToComfy(config.comfyUrl, filename, fileData, mime);
        return result.name;
      }

      applyTemplateParams(workflow, cfg, params);
      applyPromptInputs(workflow, cfg, params);
      applyDefaultSeeds(workflow, cfg, params);

      const uploadedImages = {};
      if (cfg.inputs) {
        for (const inputDef of cfg.inputs) {
          if (inputDef.type === 'image' && images[inputDef.name]) {
            const imgData = images[inputDef.name];
            let comfyName;
            if (imgData.startsWith('/') || imgData.match(/^[A-Za-z]:\\/)) comfyName = await uploadFromPath(imgData, inputDef.name);
            else comfyName = await uploadBase64(imgData, inputDef.name);
            uploadedImages[inputDef.name] = comfyName;
            if (inputDef.target_node && workflow[inputDef.target_node]) {
              workflow[inputDef.target_node].inputs[inputDef.target_field || 'image'] = comfyName;
            }
          }
        }
      }

      if (cfg.inputs) {
        applyBatchGroups(workflow, cfg, uploadedImages);
        for (const inputDef of cfg.inputs) {
          if (inputDef.type === 'image' && inputDef.optional && !uploadedImages[inputDef.name]) {
            if (inputDef.target_node && workflow[inputDef.target_node]) delete workflow[inputDef.target_node];
          }
        }
      }

      const payload = { prompt: workflow };
      if (config.comfyApiKey) payload.extra_data = { api_key_comfy_org: config.comfyApiKey };

      const submitResult = await proxyRequest(config.comfyUrl, 'POST', '/prompt', payload);
      if (submitResult.status !== 200 || !submitResult.data.prompt_id) {
        throw new Error('Failed to submit workflow: ' + JSON.stringify(submitResult.data));
      }
      const promptId = submitResult.data.prompt_id;
      if (!wait) return res.json({ promptId, status: 'submitted' });

      const maxWait = (timeout || 120) * 1000;
      const start = Date.now();
      while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, 2000));
        const histResult = await proxyRequest(config.comfyUrl, 'GET', `/history/${promptId}`);
        const history = histResult.data[promptId];
        if (!history) continue;
        if (history.status?.completed) {
          const outputs = history.outputs;
          const result = { promptId, status: 'completed', outputs: {} };
          for (const nodeOut of Object.values(outputs)) {
            if (nodeOut.images && nodeOut.images.length > 0) {
              const img = nodeOut.images[0];
              result.imageUrl = `/api/comfy/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`;
              result.filename = img.filename;
            }
          }
          return res.json(result);
        }
      }
      throw new Error(`Timed out after ${timeout}s`);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/workflow/templates', (req, res) => {
    const templates = listTemplates(rootDir).map(cfg => ({
      id: cfg.id,
      name: cfg.name,
      description: cfg.description,
      inputs: cfg.inputs,
      params: cfg.params,
      cost: cfg.cost,
    }));
    res.json(templates);
  });

  return router;
};
