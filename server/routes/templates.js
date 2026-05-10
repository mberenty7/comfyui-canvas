const express = require('express');
const { listTemplates, getTemplate } = require('../services/templateService');

module.exports = function createTemplatesRouter(rootDir) {
  const router = express.Router();

  router.get('/api/templates', (req, res) => {
    res.json(listTemplates(rootDir));
  });

  router.get('/api/templates/:id', (req, res) => {
    const t = getTemplate(rootDir, req.params.id);
    if (!t) return res.status(404).json({ error: 'Not found' });
    res.json(t);
  });

  return router;
};
