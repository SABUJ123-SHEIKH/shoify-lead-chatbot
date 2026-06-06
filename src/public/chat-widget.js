(function(){
  const script = document.currentScript;
  const scriptApi = script && script.getAttribute('data-api');
  const scriptSite = script && script.getAttribute('data-site-id');
  const inferredApi = script && script.src ? new URL(script.src, window.location.href).origin : '';
  const API_BASE = window.KG_CHAT_API || scriptApi || inferredApi || window.location.origin;
  const SITE_ID = window.KG_SITE_ID || scriptSite || 'default';
  let leadId = localStorage.getItem('kg_lead_'+SITE_ID) || '';
  const css=`.kg-chat-btn{position:fixed;right:20px;bottom:20px;z-index:999999;background:#111;color:#fff;border:0;border-radius:999px;padding:14px 18px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.22);cursor:pointer}.kg-chat{position:fixed;right:20px;bottom:78px;width:380px;max-width:calc(100vw - 32px);height:590px;max-height:calc(100vh - 110px);background:#fff;border-radius:18px;box-shadow:0 20px 70px rgba(0,0,0,.25);z-index:999999;display:none;overflow:hidden;font-family:Arial,sans-serif}.kg-head{background:#111;color:#fff;padding:16px}.kg-head strong{display:block;font-size:16px}.kg-head span{font-size:12px;opacity:.8}.kg-body{height:280px;overflow:auto;padding:14px;background:#f7f7f7;white-space:pre-wrap}.kg-msg{margin:8px 0;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.35;max-width:90%;white-space:pre-wrap;word-break:break-word}.kg-bot{background:#fff}.kg-user{background:#111;color:#fff;margin-left:auto}.kg-chips{display:flex;flex-wrap:wrap;gap:8px;padding:12px 12px 0;background:#f7f7f7}.kg-chip{border:1px solid #ddd;background:#fff;border-radius:999px;padding:7px 11px;font-size:12px;cursor:pointer;white-space:nowrap}.kg-row{display:flex;gap:8px;padding:10px;border-top:1px solid #eee}.kg-row input{flex:1}.kg-form{padding:12px;display:grid;gap:8px}.kg-form input,.kg-form textarea,.kg-input{width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:10px;padding:10px;font-size:14px}.kg-form textarea{height:52px}.kg-send,.kg-save{background:#111;color:#fff;border:0;border-radius:10px;padding:10px;font-weight:700;cursor:pointer}`;
  const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
  const chat=document.createElement('div'); chat.className='kg-chat'; chat.innerHTML=`<div class="kg-head"><strong>AI Sales Assistant</strong><span>Ask for product links, prices and offers</span></div><div class="kg-chips"><button class="kg-chip" data-q="show all products">All products</button><button class="kg-chip" data-q="show desks">Desks</button><button class="kg-chip" data-q="show chairs">Chairs</button><button class="kg-chip" data-q="shipping and delivery">Shipping</button><button class="kg-chip" data-q="returns policy">Returns</button></div><div class="kg-body" id="kgBody"><div class="kg-msg kg-bot">Hi! What product are you looking for?</div></div><div class="kg-row"><input class="kg-input" id="kgInput" placeholder="e.g. height-adjustable desk 180x80 budget 1500"><button class="kg-send" id="kgSend">Send</button></div><div class="kg-form"><input id="kgName" placeholder="Name"><input id="kgPhone" placeholder="Phone / WhatsApp"><input id="kgEmail" placeholder="Email"><input id="kgCompany" placeholder="Company"><input id="kgInterest" placeholder="Product interest"><input id="kgBudget" placeholder="Budget"><textarea id="kgMessage" placeholder="Message"></textarea><button class="kg-save" id="kgSave">Get offer</button></div>`;
  const btn=document.createElement('button'); btn.className='kg-chat-btn'; btn.textContent='Chat / Get offer'; document.body.appendChild(chat); document.body.appendChild(btn);
  const body=chat.querySelector('#kgBody');
  const input=chat.querySelector('#kgInput');
  const sendBtn=chat.querySelector('#kgSend');
  const saveBtn=chat.querySelector('#kgSave');
  const nameInput=chat.querySelector('#kgName');
  const phoneInput=chat.querySelector('#kgPhone');
  const emailInput=chat.querySelector('#kgEmail');
  const companyInput=chat.querySelector('#kgCompany');
  const interestInput=chat.querySelector('#kgInterest');
  const budgetInput=chat.querySelector('#kgBudget');
  const messageInput=chat.querySelector('#kgMessage');
  function add(t,type){const d=document.createElement('div'); d.className='kg-msg '+(type==='user'?'kg-user':'kg-bot'); d.textContent=t; body.appendChild(d); body.scrollTop=body.scrollHeight;}
  function ask(q){input.value=q; sendBtn.click();}
  btn.onclick=()=>{chat.style.display=chat.style.display==='block'?'none':'block'};
  chat.querySelectorAll('.kg-chip').forEach(chip=>chip.addEventListener('click',()=>ask(chip.getAttribute('data-q')||'')));
  sendBtn.onclick=async()=>{const message=input.value.trim(); if(!message)return; add(message,'user'); input.value=''; try{const r=await fetch(API_BASE+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({siteId:SITE_ID,leadId,message})}); const data=await r.json(); leadId=data.leadId||leadId; localStorage.setItem('kg_lead_'+SITE_ID,leadId); add(data.reply||'Sorry, I could not answer right now.','bot');}catch(e){add('Connection problem. Please try again.','bot')}};
  saveBtn.onclick=async()=>{const p={siteId:SITE_ID,leadId,name:nameInput.value,phone:phoneInput.value,email:emailInput.value,company:companyInput.value,productInterest:interestInput.value,budget:budgetInput.value,message:messageInput.value,sourcePage:location.href}; try{const r=await fetch(API_BASE+'/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}); const d=await r.json(); if(d.ok){leadId=d.leadId; localStorage.setItem('kg_lead_'+SITE_ID,leadId); add('Thanks! Your request is saved. Our team will contact you soon.','bot')} else add(d.error||'Please add phone or email.','bot')}catch(e){add('Could not save lead right now.','bot')}};
})();
