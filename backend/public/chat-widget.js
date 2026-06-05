(function () {
  const API_BASE = window.KG_CHAT_API || 'http://localhost:3000';
  let leadId = localStorage.getItem('kg_lead_id') || '';

  const css = `
  .kg-chat-btn{position:fixed;right:20px;bottom:20px;z-index:99999;background:#111;color:#fff;border:0;border-radius:999px;padding:14px 18px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.2);cursor:pointer}
  .kg-chat{position:fixed;right:20px;bottom:78px;width:360px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 110px);background:#fff;border-radius:18px;box-shadow:0 20px 70px rgba(0,0,0,.25);z-index:99999;display:none;overflow:hidden;font-family:Arial,sans-serif}
  .kg-head{background:#111;color:#fff;padding:16px}.kg-head strong{display:block;font-size:16px}.kg-head span{font-size:12px;opacity:.8}
  .kg-body{height:270px;overflow:auto;padding:14px;background:#f7f7f7}.kg-msg{margin:8px 0;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.35;max-width:85%}.kg-bot{background:#fff}.kg-user{background:#111;color:#fff;margin-left:auto}
  .kg-form{padding:12px;display:grid;gap:8px}.kg-form input,.kg-form textarea,.kg-input{width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:10px;padding:10px;font-size:14px}.kg-form textarea{height:60px}.kg-send,.kg-save{background:#111;color:#fff;border:0;border-radius:10px;padding:10px;font-weight:700;cursor:pointer}.kg-row{display:flex;gap:8px;padding:10px;border-top:1px solid #eee}.kg-row input{flex:1}
  `;
  const style = document.createElement('style'); style.innerHTML = css; document.head.appendChild(style);

  const chat = document.createElement('div'); chat.className = 'kg-chat';
  chat.innerHTML = `
    <div class="kg-head"><strong>Kontorgaarden Assistant</strong><span>Get a quick offer for office furniture</span></div>
    <div class="kg-body" id="kgBody"><div class="kg-msg kg-bot">Hi! What office furniture are you looking for?</div></div>
    <div class="kg-row"><input class="kg-input" id="kgInput" placeholder="Type your question..."><button class="kg-send" id="kgSend">Send</button></div>
    <div class="kg-form">
      <input id="kgName" placeholder="Name">
      <input id="kgPhone" placeholder="Phone / WhatsApp">
      <input id="kgEmail" placeholder="Email">
      <input id="kgCompany" placeholder="Company name">
      <input id="kgInterest" placeholder="Product interest e.g. desks, chairs">
      <input id="kgBudget" placeholder="Budget">
      <textarea id="kgMessage" placeholder="Message"></textarea>
      <button class="kg-save" id="kgSave">Get offer</button>
    </div>`;
  const btn = document.createElement('button'); btn.className = 'kg-chat-btn'; btn.textContent = 'Chat / Get offer';
  document.body.appendChild(chat); document.body.appendChild(btn);

  const body = chat.querySelector('#kgBody');
  function addMsg(text, type) { const d = document.createElement('div'); d.className = 'kg-msg ' + (type === 'user' ? 'kg-user' : 'kg-bot'); d.textContent = text; body.appendChild(d); body.scrollTop = body.scrollHeight; }

  btn.onclick = () => { chat.style.display = chat.style.display === 'block' ? 'none' : 'block'; };
  chat.querySelector('#kgSend').onclick = async () => {
    const input = chat.querySelector('#kgInput'); const message = input.value.trim(); if (!message) return;
    addMsg(message, 'user'); input.value = '';
    const res = await fetch(API_BASE + '/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ leadId, message }) });
    const data = await res.json(); leadId = data.leadId; localStorage.setItem('kg_lead_id', leadId); addMsg(data.reply, 'bot');
  };
  chat.querySelector('#kgSave').onclick = async () => {
    const payload = {
      leadId,
      name: kgName.value, phone: kgPhone.value, email: kgEmail.value, company: kgCompany.value,
      productInterest: kgInterest.value, budget: kgBudget.value, message: kgMessage.value, sourcePage: location.href
    };
    const res = await fetch(API_BASE + '/api/leads', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const data = await res.json();
    if (data.ok) { addMsg('Thanks! Your request is saved. Our team will contact you soon.', 'bot'); if (data.whatsappUrl) window.open(data.whatsappUrl, '_blank'); }
    else addMsg(data.error || 'Please add phone or email.', 'bot');
  };
})();
