(function () {
  const script = document.currentScript;
  const scriptApi = script && script.getAttribute('data-api');
  const scriptSite = script && script.getAttribute('data-site-id');
  const inferredApi = script && script.src ? new URL(script.src, window.location.href).origin : '';
  const API_BASE = window.KG_CHAT_API || scriptApi || inferredApi || window.location.origin;
  const SITE_ID = window.KG_SITE_ID || scriptSite || 'default';
  const QUICK_ACTIONS = Array.isArray(window.KG_QUICK_ACTIONS) && window.KG_QUICK_ACTIONS.length
    ? window.KG_QUICK_ACTIONS
    : [
        { label: 'All products', q: 'show all products' },
        { label: 'Desks', q: 'show desks' },
        { label: 'Chairs', q: 'show chairs' },
        { label: 'Shipping', q: 'shipping and delivery' },
        { label: 'Returns', q: 'returns policy' }
      ];
  let leadId = localStorage.getItem('kg_lead_' + SITE_ID) || '';

  const css = `
    .kg-chat-launcher{
      position:fixed;right:20px;bottom:20px;z-index:999999;
      display:inline-flex;align-items:center;gap:10px;
      border:0;border-radius:999px;padding:14px 18px;
      background:linear-gradient(135deg,#0f172a,#1e293b);
      color:#fff;font:600 14px/1.1 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      box-shadow:0 16px 34px rgba(15,23,42,.24);
      cursor:pointer;letter-spacing:.01em
    }
    .kg-chat-launcher::before{
      content:'';width:10px;height:10px;border-radius:999px;background:#22c55e;
      box-shadow:0 0 0 6px rgba(34,197,94,.16)
    }
    .kg-chat-shell{
      position:fixed;right:20px;bottom:78px;z-index:999999;
      width:420px;max-width:calc(100vw - 32px);
      height:min(700px,calc(100vh - 110px));
      background:#fff;border:1px solid rgba(15,23,42,.08);
      border-radius:24px;overflow:hidden;display:none;flex-direction:column;
      box-shadow:0 26px 80px rgba(15,23,42,.24);
      font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      min-height:0;
    }
    .kg-chat-shell *{box-sizing:border-box}
    .kg-chat-top{
      position:relative;
      background:linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#334155 100%);
      color:#fff;padding:18px 18px 16px;
    }
    .kg-chat-top::after{
      content:'';position:absolute;inset:auto -40px -42px auto;width:160px;height:160px;
      background:radial-gradient(circle,rgba(255,255,255,.14),transparent 68%);
      pointer-events:none
    }
    .kg-chat-topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;position:relative;z-index:1}
    .kg-brand{display:flex;align-items:center;gap:12px;min-width:0}
    .kg-avatar{
      width:44px;height:44px;border-radius:16px;flex:0 0 auto;
      background:linear-gradient(135deg,#22c55e,#14b8a6);
      display:grid;place-items:center;color:#fff;font-weight:800;
      box-shadow:0 10px 24px rgba(20,184,166,.28)
    }
    .kg-brand-text{min-width:0}
    .kg-kicker{
      margin:0 0 4px;font-size:11px;line-height:1.2;letter-spacing:.16em;
      text-transform:uppercase;color:rgba(255,255,255,.72)
    }
    .kg-title{margin:0;font-size:18px;line-height:1.2;font-weight:700}
    .kg-subtitle{
      margin:6px 0 0;color:rgba(255,255,255,.82);font-size:13px;line-height:1.45;
      max-width:230px
    }
    .kg-status{
      flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;
      padding:8px 10px;border-radius:999px;background:rgba(255,255,255,.1);
      color:rgba(255,255,255,.92);font-size:12px;line-height:1
    }
    .kg-status::before{
      content:'';width:8px;height:8px;border-radius:999px;background:#22c55e;
      box-shadow:0 0 0 5px rgba(34,197,94,.18)
    }
    .kg-quick-actions{
      display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:14px 14px 0;
      background:linear-gradient(180deg,#f8fafc 0%,#ffffff 100%);
      border-bottom:1px solid #eef2f7
    }
    .kg-chip{
      border:1px solid #d7dee8;background:#fff;border-radius:999px;padding:8px 12px;
      font-size:12px;font-weight:600;color:#0f172a;cursor:pointer;
      transition:transform .14s ease,box-shadow .14s ease,border-color .14s ease
    }
    .kg-chip:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(15,23,42,.08);border-color:#b9c4d3}
    .kg-chat-body{
      flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;
      -webkit-overflow-scrolling:touch;
      padding:16px;background:
      radial-gradient(circle at top left,rgba(34,197,94,.06),transparent 28%),
      linear-gradient(180deg,#f8fafc 0%,#f7f8fb 100%);
      white-space:pre-wrap
    }
    .kg-chat-body::-webkit-scrollbar{width:10px}
    .kg-chat-body::-webkit-scrollbar-thumb{background:#d5dce6;border-radius:999px;border:2px solid #f8fafc}
    .kg-msg{
      margin:10px 0;padding:12px 14px;border-radius:16px;
      font-size:14px;line-height:1.55;max-width:88%;
      white-space:pre-wrap;word-break:break-word
    }
    .kg-bot{
      background:#fff;color:#0f172a;border:1px solid #e5eaf1;
      box-shadow:0 8px 24px rgba(15,23,42,.04)
    }
    .kg-user{
      background:linear-gradient(135deg,#0f172a,#1e293b);
      color:#fff;margin-left:auto;box-shadow:0 12px 28px rgba(15,23,42,.16)
    }
    .kg-chat-footer{
      background:#fff;border-top:1px solid #eef2f7;padding:14px;flex:0 0 auto
    }
    .kg-compose{
      display:flex;gap:10px;align-items:flex-end;margin-bottom:10px
    }
    .kg-input{
      flex:1;width:100%;min-height:48px;resize:none;
      border:1px solid #d7dee8;border-radius:14px;padding:13px 14px;
      font:400 14px/1.4 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      color:#0f172a;background:#fff;outline:none;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.45)
    }
    .kg-input:focus{border-color:#60a5fa;box-shadow:0 0 0 4px rgba(96,165,250,.14)}
    .kg-send{
      flex:0 0 auto;border:0;border-radius:14px;padding:13px 16px;
      background:linear-gradient(135deg,#0ea5e9,#2563eb);
      color:#fff;font:700 14px/1 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      cursor:pointer;box-shadow:0 12px 26px rgba(37,99,235,.22)
    }
    .kg-send:hover{filter:brightness(1.02)}
    .kg-support-note{
      display:flex;align-items:center;justify-content:space-between;gap:10px;
      color:#64748b;font-size:12px;line-height:1.45;margin-top:4px
    }
    .kg-support-note strong{color:#0f172a}
    .kg-escalate{
      margin-top:12px;border-top:1px dashed #e5eaf1;padding-top:10px
    }
    .kg-escalate summary{
      list-style:none;cursor:pointer;font-size:12px;font-weight:700;color:#0f172a;
      display:flex;align-items:center;justify-content:space-between;gap:10px
    }
    .kg-escalate summary::-webkit-details-marker{display:none}
    .kg-escalate summary::after{content:'+';color:#64748b;font-size:18px;line-height:1}
    .kg-escalate[open] summary::after{content:'−'}
    .kg-form{
      margin-top:10px;
      display:grid;grid-template-columns:1fr 1fr;gap:8px
    }
    .kg-form input,.kg-form textarea{
      width:100%;border:1px solid #d7dee8;border-radius:12px;padding:11px 12px;
      font:400 13px/1.35 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      color:#0f172a;background:#fff;outline:none
    }
    .kg-form input:focus,.kg-form textarea:focus{border-color:#60a5fa;box-shadow:0 0 0 4px rgba(96,165,250,.12)}
    .kg-form textarea{grid-column:1 / -1;min-height:70px;resize:vertical}
    .kg-save{
      grid-column:1 / -1;border:0;border-radius:12px;padding:12px 14px;
      background:#0f172a;color:#fff;font:700 14px/1 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      cursor:pointer
    }
    .kg-launch-close{
      border:0;background:rgba(255,255,255,.1);color:#fff;
      width:34px;height:34px;border-radius:12px;cursor:pointer;font-size:18px;line-height:1
    }
    @media (max-width: 520px){
      .kg-chat-launcher{
        right:16px;bottom:16px;padding:13px 16px;font-size:13px
      }
      .kg-chat-shell{
        right:10px;left:10px;top:10px;bottom:74px;
        width:auto;max-width:none;height:auto;max-height:none;
        border-radius:22px
      }
      .kg-chat-top{padding:16px 16px 14px}
      .kg-chat-topbar{align-items:flex-start}
      .kg-avatar{width:40px;height:40px;border-radius:14px}
      .kg-title{font-size:17px}
      .kg-subtitle{
        max-width:none;font-size:12px;line-height:1.4
      }
      .kg-status{padding:7px 9px;font-size:11px}
      .kg-quick-actions{
        padding:12px 12px 0;gap:7px;grid-template-columns:repeat(2,minmax(0,1fr))
      }
      .kg-chip{
        width:100%;padding:9px 10px;font-size:11px;min-height:38px;
        white-space:normal;line-height:1.2
      }
      .kg-chat-body{
        padding:14px
      }
      .kg-msg{
        max-width:92%;font-size:13px;line-height:1.5;border-radius:14px
      }
      .kg-chat-footer{padding:12px}
      .kg-compose{flex-direction:column;align-items:stretch;margin-bottom:8px}
      .kg-input{
        min-height:72px;padding:12px 12px;font-size:13px;border-radius:13px
      }
      .kg-send{
        width:100%;padding:12px 14px;border-radius:13px;font-size:13px
      }
      .kg-support-note{flex-direction:column;align-items:flex-start;gap:6px;margin-top:6px}
      .kg-escalate{margin-top:10px;padding-top:9px}
      .kg-form{grid-template-columns:1fr}
      .kg-form input,.kg-form textarea{
        padding:10px 11px;font-size:12px;border-radius:11px
      }
      .kg-form textarea{min-height:64px}
      .kg-save{padding:11px 12px;font-size:13px;border-radius:11px}
    }
  `;

  function buildWidget() {
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    const shell = document.createElement('div');
    shell.className = 'kg-chat-shell';
    shell.innerHTML = `
      <div class="kg-chat-top">
        <div class="kg-chat-topbar">
          <div class="kg-brand">
            <div class="kg-avatar">A</div>
            <div class="kg-brand-text">
              <p class="kg-kicker">Customer Support</p>
              <h3 class="kg-title">AI support agent</h3>
              <p class="kg-subtitle">I can help with products, shipping, returns, quotes, and general support.</p>
            </div>
          </div>
          <div class="kg-status">Online</div>
        </div>
      </div>
    <div class="kg-quick-actions">
        ${QUICK_ACTIONS.map(action => `<button class="kg-chip" data-q="${String(action.q || action.label || '').replace(/"/g, '&quot;')}">${String(action.label || action.q || '')}</button>`).join('')}
      </div>
      <div class="kg-chat-body" id="kgBody">
        <div class="kg-msg kg-bot">Hi, I am your support agent. Tell me what you need, or choose a quick topic above.</div>
      </div>
      <div class="kg-chat-footer">
        <div class="kg-compose">
          <textarea class="kg-input" id="kgInput" rows="2" placeholder="Ask about products, availability, shipping, returns, quotes, or support..."></textarea>
          <button class="kg-send" id="kgSend">Send</button>
        </div>
        <div class="kg-support-note">
          <span><strong>Usually replies in a few minutes.</strong> I can also forward details to your support team.</span>
          <span>Secure chat</span>
        </div>
        <details class="kg-escalate">
          <summary>Need human follow-up?</summary>
          <div class="kg-form">
            <input id="kgName" placeholder="Name">
            <input id="kgPhone" placeholder="Phone / WhatsApp">
            <input id="kgEmail" placeholder="Email">
            <input id="kgCompany" placeholder="Company">
            <input id="kgInterest" placeholder="Product interest">
            <input id="kgBudget" placeholder="Budget">
            <textarea id="kgMessage" placeholder="Message for support"></textarea>
            <button class="kg-save" id="kgSave">Send to support</button>
          </div>
        </details>
      </div>
    `;

    const launcher = document.createElement('button');
    launcher.className = 'kg-chat-launcher';
    launcher.textContent = 'Support';

    document.body.appendChild(shell);
    document.body.appendChild(launcher);

    const body = shell.querySelector('#kgBody');
    const input = shell.querySelector('#kgInput');
    const sendBtn = shell.querySelector('#kgSend');
    const saveBtn = shell.querySelector('#kgSave');
    const nameInput = shell.querySelector('#kgName');
    const phoneInput = shell.querySelector('#kgPhone');
    const emailInput = shell.querySelector('#kgEmail');
    const companyInput = shell.querySelector('#kgCompany');
    const interestInput = shell.querySelector('#kgInterest');
    const budgetInput = shell.querySelector('#kgBudget');
    const messageInput = shell.querySelector('#kgMessage');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'kg-launch-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close chat');
    closeBtn.textContent = '×';
    shell.querySelector('.kg-chat-topbar').appendChild(closeBtn);

    function add(text, type) {
      const msg = document.createElement('div');
      msg.className = 'kg-msg ' + (type === 'user' ? 'kg-user' : 'kg-bot');
      msg.textContent = text;
      body.appendChild(msg);
      body.scrollTop = body.scrollHeight;
    }

    function ask(q) {
      input.value = q;
      sendBtn.click();
    }

    async function sendMessage() {
      const message = input.value.trim();
      if (!message) return;
      add(message, 'user');
      input.value = '';
      try {
        const r = await fetch(API_BASE + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: SITE_ID, leadId, message })
        });
        const data = await r.json();
        leadId = data.leadId || leadId;
        localStorage.setItem('kg_lead_' + SITE_ID, leadId);
        add(data.reply || 'Sorry, I could not answer right now.', 'bot');
      } catch (e) {
        add('Connection problem. Please try again.', 'bot');
      }
    }

    function toggle(open) {
      const next = typeof open === 'boolean' ? open : shell.style.display !== 'flex';
      shell.style.display = next ? 'flex' : 'none';
      if (next) {
        setTimeout(() => input.focus(), 50);
      }
    }

    launcher.onclick = () => toggle();
    closeBtn.onclick = () => toggle(false);
    shell.querySelectorAll('.kg-chip').forEach(chip => chip.addEventListener('click', () => ask(chip.getAttribute('data-q') || '')));
    sendBtn.onclick = sendMessage;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    saveBtn.onclick = async () => {
      const p = {
        siteId: SITE_ID,
        leadId,
        name: nameInput.value,
        phone: phoneInput.value,
        email: emailInput.value,
        company: companyInput.value,
        productInterest: interestInput.value,
        budget: budgetInput.value,
        message: messageInput.value,
        sourcePage: location.href
      };
      try {
        const r = await fetch(API_BASE + '/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p)
        });
        const d = await r.json();
        if (d.ok) {
          leadId = d.leadId;
          localStorage.setItem('kg_lead_' + SITE_ID, leadId);
          add('Thanks! Your request is saved. Our team will contact you soon.', 'bot');
        } else {
          add(d.error || 'Please add phone or email.', 'bot');
        }
      } catch (e) {
        add('Could not save lead right now.', 'bot');
      }
    };
  }

  if (document.body) {
    buildWidget();
  } else {
    document.addEventListener('DOMContentLoaded', buildWidget, { once: true });
  }
})();
