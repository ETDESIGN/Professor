import express from 'express';

const MOCK_RESPONSES = {
  'generate-lesson': {
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
  },
  'generate-media': {
    results: {
      images: {},
      audios: {}
    }
  },
  'evaluate-pronunciation': {
    evaluation: {
      targetText: 'Sample text',
      score: 0.85,
      feedback: 'Good pronunciation',
      phonemeAnalysis: []
    }
  },
  'orchestrate-lesson': {
    success: true,
    unitId: 'test-unit',
    publishedAssets: {},
    timelineId: 'test-timeline'
  }
};

async function startServer(port: number) {
  const app = express();

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.post('/generate-lesson', express.json({ limit: '10mb' }), (_req, res) => {
    res.json(MOCK_RESPONSES['generate-lesson']);
  });

  app.post('/generate-media', express.json({ limit: '10mb' }), (_req, res) => {
    res.json(MOCK_RESPONSES['generate-media']);
  });

  app.post('/evaluate-pronunciation', express.json({ limit: '10mb' }), (_req, res) => {
    res.json(MOCK_RESPONSES['evaluate-pronunciation']);
  });

  app.post('/orchestrate-lesson', express.json({ limit: '10mb' }), (_req, res) => {
    res.json(MOCK_RESPONSES['orchestrate-lesson']);
  });

  const actualPort = process.env.PORT || port;
  app.listen(actualPort, () => console.log(`Dev server running on port ${actualPort}`));
}

(async () => {
  try {
    const net = await import('net');
    const cleanupServer = net.createServer();
    await new Promise(resolve => {
      cleanupServer.listen(3000, '0.0.0.0', () => { cleanupServer.close(resolve); });
      cleanupServer.on('error', resolve);
    });
    await startServer(3000);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();

export { startServer };
