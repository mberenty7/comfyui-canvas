const fs = require('fs');
const path = require('path');

function getTemplateDir(rootDir) {
  return path.join(rootDir, 'templates');
}

function listTemplates(rootDir) {
  const templateDir = getTemplateDir(rootDir);
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
  return templates;
}

function getTemplate(rootDir, id) {
  const dir = path.join(getTemplateDir(rootDir), id);
  const cfgPath = path.join(dir, 'config.json');
  const wfPath = path.join(dir, 'workflow.json');
  if (!fs.existsSync(cfgPath)) return null;
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const workflow = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
  return { id, ...cfg, workflow };
}

module.exports = {
  listTemplates,
  getTemplate,
};
