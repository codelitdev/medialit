import { Response as ExpressRes } from "express";

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;");
}

export function authorizePage(pendingId: string, clientId: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize MediaLit</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); padding: 40px; max-width: 420px; width: 100%; }
  h1 { font-size: 22px; font-weight: 600; margin-bottom: 8px; }
  p { color: #666; font-size: 14px; margin-bottom: 24px; }
  label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; color: #333; }
  input[type="text"], input[type="email"] { width: 100%; padding: 10px 14px; font-size: 15px; border: 1px solid #ddd; border-radius: 8px; outline: none; transition: border-color .2s; }
  input:focus { border-color: #2563eb; }
  button { width: 100%; padding: 10px; font-size: 15px; font-weight: 500; background: #2563eb; color: #fff; border: none; border-radius: 8px; cursor: pointer; margin-top: 16px; }
  button:hover { background: #1d4ed8; }
  button:disabled { opacity: .6; cursor: not-allowed; }
  .error { color: #dc2626; font-size: 13px; margin-top: 10px; display: none; }
  .step { display: none; }
  .step.active { display: block; }
  .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; vertical-align: middle; margin-right: 6px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="card">
  <h1>Sign in to MediaLit</h1>
  <p>Application <strong>${escapeHtml(clientId)}</strong> requests access to your MediaLit account.</p>

  <div class="step active" id="step-email">
    <label for="email">Email address</label>
    <input type="email" id="email" placeholder="you@example.com" autofocus />
    <div class="error" id="email-error"></div>
    <button id="btn-send">Send verification code</button>
  </div>

  <div class="step" id="step-otp">
    <label for="otp">Verification code</label>
    <p style="font-size:13px;color:#888;margin-bottom:8px;">Enter the code sent to <span id="sent-email"></span></p>
    <input type="text" id="otp" placeholder="123456" inputmode="numeric" pattern="[0-9]*" autofocus />
    <div class="error" id="otp-error"></div>
    <button id="btn-verify">Verify &amp; authorize</button>
  </div>
</div>

<script>
const PENDING_ID = "${pendingId}";
let stepEl = document.getElementById('step-email');
let stepOtp = document.getElementById('step-otp');

document.getElementById('btn-send').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const btn = document.getElementById('btn-send');
  const err = document.getElementById('email-error');
  if (!email) { err.textContent = 'Enter your email'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Sending...';
  try {
    const r = await fetch('/oauth/authorize/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingId: PENDING_ID, email })
    });
    const d = await r.json();
    if (!d.success) { err.textContent = d.error || 'Failed to send code'; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Send verification code'; return; }
    document.getElementById('sent-email').textContent = email;
    document.getElementById('step-email').classList.remove('active');
    document.getElementById('step-otp').classList.add('active');
    document.getElementById('otp').focus();
  } catch (e) { err.textContent = 'Network error'; err.style.display = 'block'; }
  btn.disabled = false;
  btn.textContent = 'Send verification code';
});

document.getElementById('btn-verify').addEventListener('click', async () => {
  const otp = document.getElementById('otp').value.trim();
  const btn = document.getElementById('btn-verify');
  const err = document.getElementById('otp-error');
  if (!otp) { err.textContent = 'Enter the verification code'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Verifying...';
  try {
    const r = await fetch('/oauth/authorize/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingId: PENDING_ID, otp })
    });
    const d = await r.json();
    if (!d.success) { err.textContent = d.error || 'Invalid code'; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Verify & authorize'; return; }
    window.location.href = d.redirectUri;
  } catch (e) { err.textContent = 'Network error'; err.style.display = 'block'; }
  btn.disabled = false;
  btn.textContent = 'Verify & authorize';
});
</script>
</body>
</html>`;
}

export function errorPage(res: ExpressRes, msg: string) {
    res.type("html").status(400).send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Error</title>
<style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5}.card{background:#fff;border-radius:12px;padding:40px;max-width:420px;text-align:center}h1{color:#dc2626;font-size:20px}p{color:#666;font-size:14px}</style>
</head><body><div class="card"><h1>Authorization Error</h1><p>${msg}</p></div></body></html>`);
}
