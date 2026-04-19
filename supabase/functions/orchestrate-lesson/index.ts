// Supabase Functions - Node.js Compatible Implementation
// Updated orchestrate-lesson function for local development

import express from 'express';

const MOCK_RESULTS = {
  success: true,
  unitId: 'test-unit',
  publishedAssets: {},
  timelineId: 'test-timeline'
};

const app = express();
app.use(express.json({ limit: '10mb' }));

app.post('/orchestrate-lesson', function(req, res) {
  res.json(MOCK_RESULTS);
});

app.get('/health', function(_req, res) {
  res.json({ status: 'ok' });
});

const PORT = 3005;
app.listen(PORT, '0.0.0.0', function() {
  console.log('Orchestrate lesson function server running on port ' + PORT);
});

export { app };