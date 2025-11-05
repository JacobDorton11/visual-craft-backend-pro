import express from 'express';
const slots = generateSlots({ days: days || 7, stepMin: 60 });
res.json({ slots, durationMin: duration, tz: BUSINESS_TZ, note: GOOGLE_SERVICE_ACCOUNT_JSON ? undefined : 'Calendar not fully configured; returning generated slots.' });
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


await db.run(
`INSERT INTO bookings (code, listing_type, package, address, lat, lng, start_iso, duration_min, name, email, phone, notes, status, created_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
c, listingType || '', pkg || '', address || '', lat || null, lng || null,
startISO, duration, name || '', email || '', phone || '', notes || '', 'confirmed', created_at
);


// Send emails (best-effort; do not fail booking if email fails)
try {
await sendConfirmationEmail({ to: email, code: c, whenISO: startISO, durationMin: duration, address });
} catch (e) {
console.warn('email send failed:', e.message);
}


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


// Optionally, update Google Calendar event here (if you create one per booking)


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


res.json({ ok: true });
} catch (e) {
console.error(e);
res.status(500).json({ error: 'server' });
}
});


// Fallback 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));


// Start
initDb().then(() => {
server.listen(PORT, () => console.log('VC backend PRO on', PORT));
}).catch(err => {
console.error('DB init failed:', err);
process.exit(1);
});
