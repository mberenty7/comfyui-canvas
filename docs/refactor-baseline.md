# Refactor Baseline

## Endpoint Map
46: app.get('/api/config', (req, res) => {
50: app.post('/api/config', (req, res) => {
58: app.get('/api/templates', (req, res) => {
73: app.get('/api/templates/:id', (req, res) => {
85: app.post('/api/upload', upload.single('image'), (req, res) => {
104: app.post('/api/models/upload', upload.single('model'), (req, res) => {
154: app.post('/api/comfy/upload', upload.single('image'), async (req, res) => {
201: app.post('/api/comfy/prompt', async (req, res) => {
220: app.get('/api/comfy/history/:promptId', async (req, res) => {
230: app.get('/api/comfy/view', async (req, res) => {
255: app.get('/api/comfy/status', async (req, res) => {
267: app.post('/api/comfy/save-output', async (req, res) => {
333: app.get('/api/prompts', async (req, res) => {
365: app.post('/api/prompts', (req, res) => {
397: app.delete('/api/prompts/:filename', (req, res) => {
412: app.get('/api/gallery', async (req, res) => {
443: app.get('/api/gallery/dir', async (req, res) => {
487: app.get('/api/gallery/sidecar', async (req, res) => {
514: app.get('/api/gallery/dir/image', (req, res) => {
524: app.get('/api/comfy/mesh', async (req, res) => {
548: app.post('/api/comfy/save-mesh', async (req, res) => {
611: app.post('/api/comfy/sam3-segment', async (req, res) => {
743: app.post('/api/bfl/generate', async (req, res) => {
789: app.get('/api/bfl/result/:id', async (req, res) => {
801: app.post('/api/bfl/save', async (req, res) => {
849: app.get('/api/image-base64', async (req, res) => {
902: app.post('/api/workflow/run', async (req, res) => {
1220: app.get('/api/workflow/templates', (req, res) => {
1243: app.post('/api/blockout/stylize', async (req, res) => {

## Baseline Call: /api/comfy/status
{"connected":true,"system":{"os":"win32","ram_total":34260758528,"ram_free":8426532864,"comfyui_version":"0.13.0","required_frontend_version":"1.38.14","installed_templates_version":"0.8.42","required_templates_version":"0.8.42","python_version":"3.10.6 (tags/v3.10.6:9c7b4bd, Aug  1 2022, 21:53:49) [MSC v.1932 64 bit (AMD64)]","pytorch_version":"2.5.1+cu121","embedded_python":false,"argv":["main.py","--listen","0.0.0.0"]},"devices":[{"name":"cuda:0 NVIDIA GeForce RTX 3080 : cudaMallocAsync","type":"cuda","index":0,"vram_total":10736893952,"vram_free":9511632896,"torch_vram_total":0,"torch_vram_free":0}]}

## Baseline Call: /api/workflow/templates
HTTP 404 on currently deployed container (new endpoint exists in repo branch, not deployed in this baseline).
