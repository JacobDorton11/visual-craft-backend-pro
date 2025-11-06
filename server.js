// ==== Visual Craft Backend (ESM, Node 20) =====================================
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { createEvent } from 'ics';
import { nanoid } from 'nanoid';
import http from 'http';

// -------------------- Environment --------------------
const PORT = process.env.PORT || 8081;
const BUSINESS_TZ = process.env.BUSINESS_TZ || 'America/New_York';
const BUSINESS_HOME_ADDR = process.env.BUSINESS_HOME_ADDR || '';
const BUSINESS_HOURS = process.env.BUSINESS_HOURS || 'Tue:09:00-17:00,Wed:09:00-17:00,Thu:09:00-17:00,Fri:09:00-17:00';
const DEFAULT_DRIVE_BUFFER_MIN = parseInt(process.env.DEFAULT_DRIVE_BUFFER_MIN || '20', 10);
const SLOT_STEP_MIN = parseInt(process.env.SLOT_STEP_MIN || '60', 10);
const BUSY_LOOKAHEAD_DAYS = parseInt(process.env.BUSY_LOOKAHEAD_DAYS || '14', 10);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const MAIL_FROM_EMAIL = process.env.MAIL_FROM_EMAIL || ADMIN_EMAIL;
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'Visual Craft Photography';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true') === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const GOOGLE_IMPERSONATE_EMAIL = process.env.GOOGLE_IMPERSONATE_EMAIL;
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || '';

// -------------------- App & HTTP server --------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const httpServer = http.createServer(app);
httpServer.keepAliveTimeout = 120000;
httpServer.headersTimeout = 120000;

// -------------------- DB (sqlite) --------------------
let db;
async function initDb() {
  db = await open({ filename: './data.sqlite', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    listing_type TEXT,
    package TEXT,
    address TEXT,
    lat REAL,
    lng REAL,
    start_iso TEXT,
    duration_min INTEGER,
    name TEXT,
    email TEXT,
    phone TEXT,
    notes TEXT,
    status TEXT DEFAULT 'confirmed',
    event_id TEXT,
    created_at TEXT
  );`);
}

// -------------------- Google Calendar --------------------
function buildCalendarClient() {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON || !GOOGLE_IMPERSONATE_EMAIL) return null;
  try {
    const cred = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    const jwt = new google.auth.JWT({
      email: cred.client_email,
      key: cred.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar'],
      subject: GOOGLE_IMPERSONATE_EMAIL,
    });
    return google.calendar({ version: 'v3', auth: jwt });
  } catch (e) {
    console.error('Google service account JSON parse error:', e.message);
    return null;
  }
}
const calendar = buildCalendarClient();

async function fetchBusyWindows({ timeMinISO, timeMaxISO }) {
  if (!calendar) return [];
  try {
    const body = {
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      timeZone: BUSINESS_TZ,
      items: [{ id: GOOGLE_CALENDAR_ID }],
    };
    const resp = await calendar.freebusy.query({ requestBody: body });
    const arr = resp?.data?.calendars?.[GOOGLE_CALENDAR_ID]?.busy || [];
    return arr.map(b => [Date.parse(b.start), Date.parse(b.end)]).filter(([s,e]) => isFinite(s) && isFinite(e));
  } catch (e) {
    console.warn('freebusy.query failed:', e.message);
    return [];
  }
}

async function createCalendarEvent({ summary, description, startISO, durationMin, location, attendees = [] }) {
  if (!calendar) return { id: null };
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMin * 60000);
  const requestBody = {
    summary,
    description,
    start: { dateTime: start.toISOString(), timeZone: BUSINESS_TZ },
    end:   { dateTime: end.toISOString(),   timeZone: BUSINESS_TZ },
    location,
    attendees,
    reminders: { useDefault: true },
  };
  const resp = await calendar.events.insert({ calendarId: GOOGLE_CALENDAR_ID, requestBody, sendUpdates: 'all' });
  return { id: resp?.data?.id || null };
}

async function updateCalendarEvent({ eventId, startISO, durationMin, location, summary, description }) {
  if (!calendar || !eventId) return;
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMin * 60000);
  const requestBody = {
    summary,
    description,
    start: { dateTime: start.toISOString(), timeZone: BUSINESS_TZ },
    end:   { dateTime: end.toISOString(),   timeZone: BUSINESS_TZ },
    location,
  };
  await calendar.events.patch({ calendarId: GOOGLE_CALENDAR_ID, eventId, requestBody, sendUpdates: 'all' });
}

async function deleteCalendarEvent({ eventId }) {
  if (!calendar || !eventId) return;
  await calendar.events.delete({ calendarId: GOOGLE_CALENDAR_ID, eventId, sendUpdates: 'all' });
}

// -------------------- Helpers --------------------
function code() { return 'VCP-' + nanoid(8).toUpperCase(); }

function pkgDuration(pkg) {
  if (!pkg) return 60;
  const p = String(pkg).toLowerCase();
  if (p.includes('platinum')) return 120;
  if (p.includes('gold')) return 90;
  return 60;
}

function parseBusinessHours(str) {
  const map = new Map();
  str.split(',').forEach(seg => {
    const idx = seg.indexOf(':');
    if (idx === -1) return;
    const day = seg.slice(0, idx).trim().slice(0,3).toLowerCase();
    const hours = seg.slice(idx+1).trim();
    if (day && hours) map.set(day, hours);
  });
  return map;
}

function generateCandidateSlots({ days = 7, stepMin = SLOT_STEP_MIN }) {
  const slots = [];
  const now = new Date();
  const hours = parseBusinessHours(BUSINESS_HOURS);
  for (let d = 0; d < days; d++) {
    const date = new Date(now);
    date.setDate(now.getDate() + d);
    const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][date.getDay()];
    const h = hours.get(dayKey);
    if (!h) continue;
    const [start, end] = h.split('-');
    const [sH, sM] = start.split(':').map(Number);
    const [eH, eM] = end.split(':').map(Number);
    let cur = new Date(date.getFullYear(), date.getMonth(), date.getDate(), sH, sM, 0, 0);
    const endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), eH, eM, 0, 0);
    while (cur < endDate) {
      if (d > 0 || cur > now) slots.push(cur.toISOString());
      cur = new Date(cur.getTime() + stepMin * 60000);
    }
  }
  return slots;
}

function expandInterval([s, e], min) { const d = min * 60000; return [s - d, e + d]; }
function intervalsOverlap([aS, aE], [bS, bE]) { return aS < bE && bS < aE; }

// -------------------- Routes --------------------
app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.get('/api/booking/:code', async (req, res) => {
  try {
    const b = await db.get('SELECT * FROM bookings WHERE code = ?', req.params.code);
    if (!b) return res.status(404).json({ error: 'Not found' });
    res.json(b);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
});

app.post('/api/availability', async (req, res) => {
  try {
    const { pkg, days } = req.body || {};
    const durationMin = pkgDuration(pkg);
    const windowDays = Math.min(Math.max(parseInt(days || BUSY_LOOKAHEAD_DAYS, 10), 1), 60);

    const candidates = generateCandidateSlots({ days: windowDays, stepMin: SLOT_STEP_MIN });
    const now = new Date();
    const timeMinISO = now.toISOString();
    const timeMax = new Date(now); timeMax.setDate(now.getDate() + windowDays);
    const timeMaxISO = timeMax.toISOString();

    const busy = await fetchBusyWindows({ timeMinISO, timeMaxISO });
    const busyExpanded = busy.map(iv => expandInterval(iv, DEFAULT_DRIVE_BUFFER_MIN));

    const allowed = candidates.filter(iso => {
      const start = Date.parse(iso);
      const end = start + durationMin * 60000;
      const apptExpanded = expandInterval([start, end], DEFAULT_DRIVE_BUFFER_MIN);
      for (const b of busyExpanded) if (intervalsOverlap(apptExpanded, b)) return false;
      return true;
    });

    res.json({ slots: allowed, durationMin, tz: BUSINESS_TZ });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
});

app.post('/api/book', async (req, res) => {
  try {
    const { listingType, pkg, address, lat, lng, startISO, name, email, phone, notes } = req.body || {};
    if (!address || !startISO || !email) return res.status(400).json({ error: 'missing-fields' });

    const duration = pkgDuration(pkg);
    const c = code();
    const created_at = new Date().toISOString();

    let eventId = null;
    try {
      const summary = `Photo Shoot – ${c}`;
      const description = `Listing: ${listingType || ''}\nPackage: ${pkg || ''}\nClient: ${name || ''} (${email || ''}${phone ? ', ' + phone : ''})`;
      const attendees = [
        email ? { email, displayName: name || 'Client' } : null,
        ADMIN_EMAIL ? { email: ADMIN_EMAIL, displayName: MAIL_FROM_NAME } : null,
      ].filter(Boolean);
      const created = await createCalendarEvent({ summary, description, startISO, durationMin: duration, location: address, attendees });
      eventId = created.id || null;
    } catch (e) {
      console.warn('calendar insert failed:', e.message);
    }

    await db.run(
      `INSERT INTO bookings (code, listing_type, package, address, lat, lng, start_iso, duration_min, name, email, phone, notes, status, event_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      c, listingType || '', pkg || '', address || '', lat || null, lng || null,
      startISO, duration, name || '', email || '', phone || '', notes || '', 'confirmed', eventId, created_at
    );

    try { await sendConfirmationEmail({ to: email, code: c, whenISO: startISO, durationMin: duration, address }); }
    catch (e) { console.warn('email send failed:', e.message); }

    res.json({ ok: true, code: c });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
});

app.post('/api/reschedule', async (req, res) => {
  try {
    const { code, newStartISO } = req.body || {};
    if (!code || !newStartISO) return res.status(400).json({ error: 'missing-fields' });
    const b = await db.get('SELECT * FROM bookings WHERE code = ?', code);
    if (!b) return res.status(404).json({ error: 'not-found' });

    await db.run('UPDATE bookings SET start_iso = ? WHERE code = ?', newStartISO, code);

    try {
      await updateCalendarEvent({
        eventId: b.event_id,
        startISO: newStartISO,
        durationMin: b.duration_min,
        location: b.address,
        summary: `Photo Shoot – ${code}`,
        description: `Rescheduled booking ${code}`,
      });
    } catch (e) {
      console.warn('calendar update failed:', e.message);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
});

app.post('/api/cancel', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'missing-fields' });
    const b = await db.get('SELECT * FROM bookings WHERE code = ?', code);
    if (!b) return res.status(404).json({ error: 'not-found' });

    await db.run('UPDATE bookings SET status = ? WHERE code = ?', 'canceled', code);

    try {
      await deleteCalendarEvent({ eventId: b.event_id });
    } catch (e) {
      console.warn('calendar delete failed:', e.message);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
});

// 404 fallback
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// -------------------- Email helpers --------------------
function buildTransport() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

function makeIcs({ summary, description, startDate, durationMin, location }) {
  const start = new Date(startDate);
  const event = {
    title: summary,
    description,
    start: [start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()],
    duration: { minutes: durationMin },
    location,
    calName: 'Visual Craft Photography',
    productId: 'VisualCraft/1.0',
  };
  return new Promise((resolve, reject) => {
    createEvent(event, (err, value) => (err ? reject(err) : resolve(value)));
  });
}

async function sendConfirmationEmail({ to, code, whenISO, durationMin, address }) {
  const tx = buildTransport();
  if (!tx) { console.warn('SMTP not configured; skipping email.'); return; }
  const ics = await makeIcs({
    summary: `Photo Shoot – ${code}`,
    description: `Your Visual Craft booking (code ${code}). Manage: ${FRONTEND_BASE_URL ? FRONTEND_BASE_URL + '/#/manage/' + code : ''}`,
    startDate: whenISO,
    durationMin,
    location: address,
  });
  const manageUrl = FRONTEND_BASE_URL ? `${FRONTEND_BASE_URL}/#/manage/${code}` : '';
  const html = `<div style="font-family:Georgia,serif">
    <h2>Appointment Confirmed</h2>
    <p><strong>Code:</strong> ${code}</p>
    <p><strong>When:</strong> ${new Date(whenISO).toLocaleString('en-US', { timeZone: BUSINESS_TZ })}</p>
    <p><strong>Where:</strong> ${address}</p>
    ${manageUrl ? `<p><a href="${manageUrl}">Manage or reschedule</a></p>` : ''}
  </div>`;
  const attachments = [{ filename: `booking-${code}.ics`, content: ics, contentType: 'text/calendar' }];
  await tx.sendMail({ from: `${MAIL_FROM_NAME} <${MAIL_FROM_EMAIL}>`, to, subject: `Visual Craft – Booking ${code}`, html, attachments });
  if (ADMIN_EMAIL && ADMIN_EMAIL !== to) {
    await tx.sendMail({ from: `${MAIL_FROM_NAME} <${MAIL_FROM_EMAIL}>`, to: ADMIN_EMAIL, subject: `New Booking – ${code}`, html, attachments });
  }
}

// -------------------- Start --------------------
initDb()
  .then(() => {
    httpServer.listen(PORT, () => console.log('VC backend listening on', PORT));
  })
  .catch((err) => {
    console.error('DB init failed:', err);
    process.exit(1);
  });
