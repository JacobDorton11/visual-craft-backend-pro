import express from 'express';
} catch (e) {
console.error(e);
res.status(500).json({ error: 'server' });
}
});


// Fallback 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));


// ----- Email helpers ----------------------------------------------------------
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
if (!tx) {
console.warn('SMTP not configured; skipping email.');
return;
}
const ics = await makeIcs({
summary: `Photo Shoot – ${code}`,
description: `Your Visual Craft booking (code ${code}). Manage: ${FRONTEND_BASE_URL ? FRONTEND_BASE_URL + '/#/manage/' + code : ''}`,
startDate: whenISO,
durationMin,
location: address,
});


const manageUrl = FRONTEND_BASE_URL ? `${FRONTEND_BASE_URL}/#/manage/${code}` : '';
const html = `
<div style=\"font-family:Georgia,serif\">
<h2>Appointment Confirmed</h2>
<p><strong>Code:</strong> ${code}</p>
<p><strong>When:</strong> ${new Date(whenISO).toLocaleString('en-US', { timeZone: BUSINESS_TZ })}</p>
<p><strong>Where:</strong> ${address}</p>
${manageUrl ? `<p><a href=\"${manageUrl}\">Manage or reschedule</a></p>` : ''}
</div>`;


const attachments = [{ filename: `booking-${code}.ics`, content: ics, contentType: 'text/calendar' }];


await tx.sendMail({
from: `${MAIL_FROM_NAME} <${MAIL_FROM_EMAIL}>`,
to,
subject: `Visual Craft – Booking ${code}`,
html,
attachments,
});


if (ADMIN_EMAIL && ADMIN_EMAIL !== to) {
await tx.sendMail({
from: `${MAIL_FROM_NAME} <${MAIL_FROM_EMAIL}>`,
to: ADMIN_EMAIL,
subject: `New Booking – ${code}`,
html,
attachments,
});
}
}


// ----- Start ------------------------------------------------------------------
initDb().then(() => {
server.listen(PORT, () => console.log('VC backend PRO on', PORT));
}).catch(err => {
console.error('DB init failed:', err);
process.exit(1);
});
