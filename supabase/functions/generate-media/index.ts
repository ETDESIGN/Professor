// Supabase Functions - Node.js Compatible Implementation
// Updated generate-media function for local development

import express from 'express';

const MOCK_RESULTS = {
  results: {
    images: {},
    audios: {}
  }
};

const app = express();
app.use(express.json({ limit: '10mb' }));

app.post('/generate-media', function(req, res) {
  res.json(MOCK_RESULTS);
});

app.get('/health', function(_req, res) {
  res.json({ status: 'ok' });
});

const PORT = 3004;
app.listen(PORT, '0.0.0.0', function() {
  console.log('Generate media function server running on port ' + PORT);
});

export { app };