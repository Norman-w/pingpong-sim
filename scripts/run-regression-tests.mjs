import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false },
});

try {
  const suite = await server.ssrLoadModule('/tests/lob-topic-regression.test.ts');
  await suite.runLobTopicRegressionSuite();
  const spinSuite = await server.ssrLoadModule('/tests/spin-recording-regression.test.ts');
  await spinSuite.runSpinRecordingRegressionSuite();
} finally {
  await server.close();
}
