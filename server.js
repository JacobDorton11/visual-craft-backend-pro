// ESM server.js — explicit static mounts + SPA fallback + simple API + diagnostics
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';

// ESM-safe root
const ROOT = process.cwd();
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ---------- Explicit static mounts ----------
const imgDir = path.join(ROOT, 'images');
const icoDir = path.join(ROOT, 'icons');

// Serve /images/* from ./images (never falls through to SPA)
app.use('/images', express.static(imgDir, { fallthrough: false, extensions: ['jpg','jpeg','png'] }));

// Serve /icons/* (optional)
app.use('/icons', express.static(icoDir, { fallthrough: true }));

// Serve manifest json if present
app.get(['/manifest.json','/manifest.webmanifest'], (req, res) => {
  const files = ['manifest.json','manifest.webmanifest'];
  for (const f of files) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  res.status(404).json({ error: 'manifest not found' });
});

// Root static (index.html, etc.)
app.use(express.static(ROOT, { extensions: ['html'] }));

// ---------- Minimal API (stubs for now) ----------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post('/api/availability', (req, res) => {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(base.getTime() + i * 90 * 60000);
    if (d.getTime() > now.getTime() + 15 * 60000) slots.push(d.toISOString());
  }
  res.json({ slots, durationMin: 60 });
});

app.post('/api/book', (req, res) => {
  const s4 = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
  res.json({ ok: true, code: `VCP-${ymd}-${s4()}` });
});

// ---------- Diagnostics ----------
app.get('/__diag', (req,res) => {
  const hasIndex = fs.existsSync(path.join(ROOT, 'index.html'));
  const hasImagesDir = fs.existsSync(imgDir);
  const imgs = hasImagesDir ? fs.readdirSync(imgDir) : [];
  res.json({
    ok: true,
    cwd: ROOT,
    index_html: hasIndex,
    images_dir: hasImagesDir,
    images: imgs
  });
});

app.get('/__list/images', (req, res) => {
  try {
    const files = fs.readdirSync(imgDir);
    res.type('text/plain').send(files.join('\n'));
  } catch (e) {
    res.status(404).type('text/plain').send('No /images folder found.');
  }
});

// ---------- SPA fallback (must be last; skip api & explicit static) ----------
app.get(/^\/(?!api\/|images\/|icons\/|manifest\.json$|manifest\.webmanifest$).*/, (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`VC backend + SPA listening on ${PORT}`);
});
