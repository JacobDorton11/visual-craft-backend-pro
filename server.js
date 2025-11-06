// server.js — ESM version (works on Render)
// Features:
// - API: /api/health, /api/availability, /api/book (demo-safe)
// - Serves SPA from /web (static + SPA fallback)
// - Binds to process.env.PORT

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM __dirname boilerplate
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ---------- Middleware ----------
app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin:
      process.env.FRONTEND_BASE_URL ||
      process.env.PUBLIC_BASE_URL ||
      '*', // same-origin or allow all (adjust later if you want)
  })
);

// ---------- API (minimal demo endpoints) ----------

// Health check for sanity
app.get('/api/health', (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'production' });
});

// Availability (demo): return two slots per day for N days
app.post('/api/availability', (req, res) => {
  const days = Number(req.body?.days) || 5;

  const slots = [];
  const now = new Date();
  for (let d = 0; d < days; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    [10, 14].forEach((hour) => {
      const slot = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        hour,
        0,
        0
      );
      slots.push(slot.toISOString());
    });
  }

  // durationMin informs the client how long the appointment is
  res.json({ slots, durationMin: 60 });
});

// Book (demo): generate a confirmation code and return it
app.post('/api/book', (req, res) => {
  try {
    const s4 = () => Math.random().toString(36).slice(2, 6).toUpperCase();
    const y = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const code = `VCP-${y}-${s4()}`;

    // In a fuller build, you’d: save to DB, create Google Calendar event,
    // send email + ICS, etc. For now, just return a code so the flow works.
    res.json({ ok: true, code });
  } catch (e) {
    console.error('BOOK error', e);
    res.status(500).json({ ok: false, error: 'Booking failed' });
  }
});

// ---------- Static hosting for the SPA ----------

// Serve everything in /web (don’t auto-index; we do SPA fallback)
app.use(express.static(path.join(__dirname, 'web'), { index: false }));

// SPA fallback: any non-API route returns index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

// ---------- Start server ----------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`VC backend + SPA listening on ${PORT}`);
});
