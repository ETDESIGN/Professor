// Supabase Functions - Node.js Compatible Implementation
// Updated extract-page function for local development

import express from 'express';

const MOCK_RESPONSE = {
  success: true,
  url: 'https://example.com/mock-image.png',
  metadata: {
    extractedText: 'Sample extracted text from document',
    pageCount: 1,
    language: 'en'
  }
};

const app = express();
app.use(express.json({ limit: '10mb' }));

app.post('/extract-page', function(req, res) {
  res.json(MOCK_RESPONSE);
});

app.get('/health', function(_req, res) {
  res.json({ status: 'ok' });
});

const PORT = 3002;
app.listen(PORT, '0.0.0.0', function() {
  console.log('Extract page function server running on port ' + PORT);
});

export { app };