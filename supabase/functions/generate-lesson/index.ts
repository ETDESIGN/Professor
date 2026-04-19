// Supabase Functions - Node.js Compatible Implementation
// Updated generate-lesson function for local development

import express from 'express';

const MOCK_RESPONSE = {
  textContent: {
    title: 'Sample Lesson',
    description: 'A sample lesson for development',
    visual_prompt: 'Educational illustration',
    spoken_intro: 'Welcome to the lesson!',
    vocabulary: [
      { word: 'Sample', definition: 'An example or representative instance' },
      { word: 'Lesson', definition: 'A period of teaching or learning' }
    ],
    grammarRules: [
      { rule: 'Basic Structure', explanation: 'Subject + Verb' }
    ],
    sentences: [
      { original: 'This is a sample.', translation: 'This is an example.' }
    ]
  },
  imageUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=sample',
  audioUrl: null
};

const app = express();
app.use(express.json({ limit: '10mb' }));

app.post('/generate-lesson', function(req, res) {
  res.json(MOCK_RESPONSE);
});

app.get('/health', function(_req, res) {
  res.json({ status: 'ok' });
});

const PORT = 3003;
app.listen(PORT, '0.0.0.0', function() {
  console.log('Generate lesson function server running on port ' + PORT);
});

export { app };