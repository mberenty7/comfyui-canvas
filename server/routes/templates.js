const express = require('express');
const { listTemplates, getTemplate } = require('../services/templateService');
const { ok, err } = require('../utils/apiResponse');

module.exports = function createTemplatesRouter(rootDir) {
  const router = express.Router();

  router.get('/api/templates', (req, res) => {
    return ok(res, listTemplates(rootDir));
  });

  router.get('/api/templates/:id', (req, res) => {
    const t = getTemplate(rootDir, req.params.id);
    if (!t) return err(res, 'NOT_FOUND', 'Not found', 404);
    return ok(res, t);
  });

  return router;
};
