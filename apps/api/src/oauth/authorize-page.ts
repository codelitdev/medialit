import { Response as ExpressRes } from "express";

export function authorizePage(pendingId: string, clientId: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize MediaLit</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: #0b0b0b;
    color: #ffffff;
    min-height: 100vh;
    display: flex;
  }
  .container {
    display: flex;
    width: 100%;
    min-height: 100vh;
  }
  
  /* Left Pane Styles */
  .left-pane {
    flex: 1;
    background: #111111;
    padding: 60px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border-right: 1px solid #1f1f1f;
  }
  @media (max-width: 900px) {
    .left-pane { display: none; }
  }
  .logo-area {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo-circle {
    width: 36px;
    height: 36px;
    background: #fffcf8;
    color: #111;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 18px;
  }
  .logo-text {
    font-size: 16px;
    font-weight: 500;
    color: #e5e5e5;
  }
  .quote-container {
    margin-top: auto;
    margin-bottom: 80px;
  }
  .quote {
    font-size: 20px;
    line-height: 1.6;
    color: #e5e5e5;
    font-weight: 400;
    margin-bottom: 24px;
    max-width: 500px;
  }
  .author-area {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .author-avatar {
    width: 44px;
    height: 44px;
    background: #262626;
    color: #e5e5e5;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 16px;
  }
  .author-name {
    font-weight: 600;
    font-size: 14px;
    color: #ffffff;
  }
  .author-role {
    font-size: 12px;
    color: #a3a3a3;
    margin-top: 2px;
  }
  .left-footer {
    font-size: 13px;
    color: #737373;
    margin-top: auto;
    padding-top: 40px;
  }

  /* Right Pane Styles */
  .right-pane {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    background: #0b0b0b;
  }
  .right-content {
    max-width: 380px;
    width: 100%;
  }
  .heading {
    font-size: 32px;
    font-weight: 600;
    margin-bottom: 8px;
    color: #ffffff;
    letter-spacing: -0.5px;
  }
  .subheading {
    color: #a3a3a3;
    font-size: 14px;
    margin-bottom: 32px;
    line-height: 1.5;
  }
  .form-group {
    margin-bottom: 20px;
  }
  label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    margin-bottom: 8px;
    color: #e5e5e5;
  }
  input[type="text"], input[type="email"] {
    width: 100%;
    padding: 12px 16px;
    font-size: 15px;
    background: #181818;
    color: #ffffff;
    border: 1px solid #262626;
    border-radius: 8px;
    outline: none;
    transition: border-color .2s, box-shadow .2s;
  }
  input::placeholder {
    color: #525252;
  }
  input:focus {
    border-color: #8c7a6b;
    box-shadow: 0 0 0 2px rgba(140, 122, 107, 0.2);
  }
  button {
    width: 100%;
    padding: 12px;
    font-size: 15px;
    font-weight: 500;
    background: #8c7a6b;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    margin-top: 8px;
    transition: background .2s;
  }
  button:hover {
    background: #7a6a5c;
  }
  button:disabled {
    opacity: .6;
    cursor: not-allowed;
  }
  .error {
    color: #f87171;
    font-size: 13px;
    margin-top: 6px;
    display: none;
  }
  .step {
    display: none;
  }
  .step.active {
    display: block;
  }
  .back-link {
    margin-top: 32px;
    text-align: center;
  }
  .back-link a {
    color: #a3a3a3;
    text-decoration: none;
    font-size: 13px;
    transition: color .2s;
  }
  .back-link a:hover {
    color: #ffffff;
  }
  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin .6s linear infinite;
    vertical-align: middle;
    margin-right: 8px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="container">
  <!-- Left Side: Quote, Logo, Author Info -->
  <div class="left-pane">
    <div class="logo-area">
      <div class="logo-circle">M</div>
      <span class="logo-text">MediaLit</span>
    </div>
    
    <div class="quote-container">
      <blockquote class="quote">
        "Instead of rebuilding file uploads and processing pipelines for every project, I just plug in MediaLit. Now my apps, my agents, and I can all work seamlessly on the same set of files."
      </blockquote>
      
      <div class="author-area">
        <div class="author-avatar">R</div>
        <div class="author-info">
          <div class="author-name">Rajat</div>
          <div class="author-role">Software Engineer</div>
        </div>
      </div>
    </div>
    
    <div class="left-footer">MediaLit.</div>
  </div>

  <!-- Right Side: The Form -->
  <div class="right-pane">
    <div class="right-content">
      <div class="step active" id="step-email">
        <h1 class="heading">Get started</h1>
        <p class="subheading">Enter your email to sign in or create an account</p>
        
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" placeholder="name@company.com" autofocus />
          <div class="error" id="email-error"></div>
        </div>
        
        <button id="btn-send">Send OTP</button>
      </div>

      <div class="step" id="step-otp">
        <h1 class="heading">Verify OTP</h1>
        <p class="subheading">Enter the code sent to <span id="sent-email"></span></p>
        
        <div class="form-group">
          <label for="otp">Verification code</label>
          <input type="text" id="otp" placeholder="123456" inputmode="numeric" pattern="[0-9]*" autofocus />
          <div class="error" id="otp-error"></div>
        </div>
        
        <button id="btn-verify">Verify &amp; authorize</button>
      </div>
      
      <div class="back-link">
        <a href="${process.env.WEB_CLIENT || "http://localhost:3000"}">&larr; Back to home</a>
      </div>
    </div>
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
    if (!d.success) { err.textContent = d.error || 'Failed to send code'; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Send OTP'; return; }
    document.getElementById('sent-email').textContent = email;
    document.getElementById('step-email').classList.remove('active');
    document.getElementById('step-otp').classList.add('active');
    document.getElementById('otp').focus();
  } catch (e) { err.textContent = 'Network error'; err.style.display = 'block'; }
  btn.disabled = false;
  btn.textContent = 'Send OTP';
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
