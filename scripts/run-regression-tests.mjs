import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false },
});

try {
  const suite = await server.ssrLoadModule('/tests/lob-topic-regression.test.ts');
  await suite.runLobTopicRegressionSuite();
} finally {
  await server.close();
}
