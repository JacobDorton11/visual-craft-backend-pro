// server.js  — minimal smoke test (ESM)
import express from 'express';

const app = express();
const PORT = process.env.PORT || 8081;

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// 404 last
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log('SMOKE server listening on', PORT);
});
