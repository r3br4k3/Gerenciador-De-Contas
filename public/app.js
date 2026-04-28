const state = {
  wallets: [],
  debts: [],
  currentWalletId: '',
  editingDebtId: ''
};

const dom = {
  walletSelect: document.querySelector('#walletSelect'),
  debtWallet: document.querySelector('#debtWallet'),
  debtsList: document.querySelector('#debtsList'),
  monthlyTotal: document.querySelector('#monthlyTotal'),
  remainingTotal: document.querySelector('#remainingTotal'),
  monthsToFinish: document.querySelector('#monthsToFinish'),
  addDebtFloating: document.querySelector('#addDebtFloating'),
  addDebtInline: document.querySelector('#addDebtInline'),
  debtDialog: document.querySelector('#debtDialog'),
  debtForm: document.querySelector('#debtForm'),
  debtFormTitle: document.querySelector('#debtFormTitle'),
  debtId: document.querySelector('#debtId'),
  newWalletButton: document.querySelector('#newWalletButton'),
  deleteWalletButton: document.querySelector('#deleteWalletButton'),
  shareWalletButton: document.querySelector('#shareWalletButton'),
  walletDialog: document.querySelector('#walletDialog'),
  walletForm: document.querySelector('#walletForm'),
  walletNameInput: document.querySelector('#walletNameInput'),
  debtTemplate: document.querySelector('#debtItemTemplate'),
  toastContainer: document.querySelector('#toastContainer'),
  confirmDialog: document.querySelector('#confirmDialog'),
  confirmMessage: document.querySelector('#confirmMessage'),
  confirmOk: document.querySelector('#confirmOk'),
  confirmCancel: document.querySelector('#confirmCancel'),
  logSection: document.querySelector('#logSection'),
  logToggle: document.querySelector('#logToggle'),
  logChevron: document.querySelector('#logChevron'),
  logBody: document.querySelector('#logBody'),
  logList: document.querySelector('#logList'),
  logCount: document.querySelector('#logCount'),
  logClear: document.querySelector('#logClear'),
  installButton: document.querySelector('#installButton')
};

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

// ─── Toast ────────────────────────────────────────────────────────────────────

const TOAST_ICONS = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type] ?? 'ℹ️'}</span><span class="toast-text">${message}</span>`;
  dom.toastContainer.appendChild(el);

  requestAnimationFrame(() => el.classList.add('toast-visible'));

  const remove = () => {
    el.classList.remove('toast-visible');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  };

  const timer = setTimeout(remove, 4000);
  el.addEventListener('click', () => { clearTimeout(timer); remove(); });
}

// ─── Custom confirm ───────────────────────────────────────────────────────────

function customConfirm(message) {
  return new Promise((resolve) => {
    dom.confirmMessage.textContent = message;
    dom.confirmDialog.showModal();

    const cleanup = (result) => {
      dom.confirmDialog.close();
      dom.confirmOk.removeEventListener('click', onOk);
      dom.confirmCancel.removeEventListener('click', onCancel);
      dom.confirmDialog.removeEventListener('cancel', onCancel);
      resolve(result);
    };

    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);

    dom.confirmOk.addEventListener('click', onOk, { once: true });
    dom.confirmCancel.addEventListener('click', onCancel, { once: true });
    dom.confirmDialog.addEventListener('cancel', onCancel, { once: true });
  });
}

// ─── Log de atividades ────────────────────────────────────────────────────────

const LOG_KEY = 'gdividas_log';
const LOG_MAX = 60;

const LOG_TYPES = {
  add:     { emoji: '➕', label: 'adicionado' },
  edit:    { emoji: '✏️',  label: 'editado'    },
  delete:  { emoji: '🗑️',  label: 'excluído'   },
  payment: { emoji: '💰', label: 'pagamento'   },
  wallet:  { emoji: '💼', label: 'carteira'    },
  share:   { emoji: '📤', label: 'compartilhado'},
  error:   { emoji: '❌', label: 'erro'         }
};

function logAdd(type, message) {
  const entries = logRead();
  entries.unshift({
    id: Date.now(),
    type,
    message,
    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    date: new Date().toLocaleDateString('pt-BR')
  });
  localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(0, LOG_MAX)));
  logRender();
}

function logRead() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; }
}

function logRender() {
  const entries = logRead();
  dom.logCount.textContent = entries.length === 0 ? 'Nenhuma atividade registrada' : `${entries.length} registro(s)`;
  dom.logList.innerHTML = '';

  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'log-empty';
    empty.textContent = 'Nenhuma atividade ainda.';
    dom.logList.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.className = `log-item log-type-${entry.type}`;
    li.innerHTML =
      `<span class="log-emoji">${LOG_TYPES[entry.type]?.emoji ?? '📌'}</span>` +
      `<span class="log-msg">${entry.message}</span>` +
      `<span class="log-time">${entry.date} ${entry.time}</span>`;
    dom.logList.appendChild(li);
  });
}

function logClear() {
  localStorage.removeItem(LOG_KEY);
  logRender();
  toast('Log limpo.', 'info');
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = 'Erro na requisicao';
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch (_error) {
      // Ignora parsing de resposta nao-json
    }
    throw new Error(message);
  }
  return response.json();
}

function setWalletSelects() {
  const options = state.wallets
    .map((wallet) => `<option value="${wallet.id}">${wallet.name}</option>`)
    .join('');

  dom.walletSelect.innerHTML = options;
  dom.debtWallet.innerHTML = options;

  if (!state.currentWalletId && state.wallets[0]) {
    state.currentWalletId = state.wallets[0].id;
  }

  dom.walletSelect.value = state.currentWalletId;
  dom.debtWallet.value = state.currentWalletId;
}

async function loadWallets() {
  state.wallets = await request('/api/wallets');

  if (state.wallets.length === 0) {
    const wallet = await request('/api/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Carteira Principal' })
    });
    state.wallets = [wallet];
  }

  if (!state.wallets.some((wallet) => wallet.id === state.currentWalletId)) {
    state.currentWalletId = state.wallets[0].id;
  }

  setWalletSelects();
}

function drawDebts() {
  dom.debtsList.innerHTML = '';

  if (state.debts.length === 0) {
    dom.debtsList.innerHTML = '<div class="empty-state">Nenhuma divida nesta carteira. Clique em + Nova divida para comecar.</div>';
    return;
  }

  state.debts.forEach((debt) => {
    const node = dom.debtTemplate.content.firstElementChild.cloneNode(true);

    const icon = node.querySelector('.debt-icon');
    icon.src = debt.iconUrl || '/icons/icon-192.svg';

    node.querySelector('.debt-title').textContent = debt.description;
    node.querySelector('.debt-meta').textContent = `Parcelas restantes: ${debt.remainingInstallments}`;
    node.querySelector('.debt-total').textContent = `Restante: ${brl.format(debt.remainingAmount)}`;
    node.querySelector('.installment-value').textContent = `Parcela: ${brl.format(debt.installmentValue)}`;
    node.querySelector('.progress-text').textContent = `${debt.paidInstallments}/${debt.totalInstallments}`;

    node.querySelector('.increase').addEventListener('click', () => changeInstallment(debt.id, 'inc'));
    node.querySelector('.decrease').addEventListener('click', () => changeInstallment(debt.id, 'dec'));
    node.querySelector('.edit').addEventListener('click', () => openDebtModal(debt));
    node.querySelector('.delete').addEventListener('click', () => removeDebt(debt.id));

    dom.debtsList.appendChild(node);
  });
}

function drawSummary(summary) {
  dom.monthlyTotal.textContent = brl.format(summary.totalMonthToPay || 0);
  dom.remainingTotal.textContent = brl.format(summary.totalRemainingDebt || 0);
  dom.monthsToFinish.textContent = String(summary.monthsToFinish || 0);
}

async function loadDebtsAndSummary() {
  if (!state.currentWalletId) return;

  const [debts, summary] = await Promise.all([
    request(`/api/debts?walletId=${encodeURIComponent(state.currentWalletId)}`),
    request(`/api/summary?walletId=${encodeURIComponent(state.currentWalletId)}`)
  ]);

  state.debts = debts;
  drawDebts();
  drawSummary(summary);
}

function openDebtModal(debt = null) {
  if (debt) {
    state.editingDebtId = debt.id;
    dom.debtFormTitle.textContent = 'Editar divida';
    dom.debtId.value = debt.id;
    dom.debtWallet.value = debt.walletId;
    document.querySelector('#debtDescription').value = debt.description;
    document.querySelector('#debtAmount').value = debt.totalAmount;
    document.querySelector('#debtInstallments').value = debt.totalInstallments;
  } else {
    state.editingDebtId = '';
    dom.debtFormTitle.textContent = 'Nova divida';
    dom.debtForm.reset();
    dom.debtWallet.value = state.currentWalletId;
  }

  dom.debtDialog.showModal();
}

function closeDebtModal() {
  state.editingDebtId = '';
  dom.debtDialog.close();
}

async function saveDebt(event) {
  event.preventDefault();

  const formData = new FormData(dom.debtForm);
  const id = String(formData.get('debtId') || '').trim();
  const desc = String(formData.get('description') || '').trim() || 'divida';

  if (!id) formData.delete('debtId');

  const isEditing = Boolean(id);
  const url = isEditing ? `/api/debts/${id}` : '/api/debts';
  const method = isEditing ? 'PUT' : 'POST';

  try {
    await request(url, { method, body: formData });
    closeDebtModal();
    await loadDebtsAndSummary();

    if (isEditing) {
      toast(`Divida "${desc}" atualizada.`, 'success');
      logAdd('edit', `Divida editada: "${desc}"`);
    } else {
      toast(`Divida "${desc}" adicionada.`, 'success');
      logAdd('add', `Nova divida adicionada: "${desc}"`);
    }
  } catch (error) {
    toast(error.message, 'error');
    logAdd('error', `Erro ao salvar divida "${desc}": ${error.message}`);
  }
}

async function removeDebt(id) {
  const debt = state.debts.find((d) => d.id === id);
  const desc = debt?.description || 'divida';

  const confirmed = await customConfirm(`Deseja excluir a divida "${desc}"? Esta acao nao pode ser desfeita.`);
  if (!confirmed) return;

  try {
    await request(`/api/debts/${id}`, { method: 'DELETE' });
    await loadDebtsAndSummary();
    toast(`Divida "${desc}" excluida.`, 'success');
    logAdd('delete', `Divida excluida: "${desc}"`);
  } catch (error) {
    toast(error.message, 'error');
    logAdd('error', `Erro ao excluir divida "${desc}": ${error.message}`);
  }
}

async function changeInstallment(id, action) {
  const debt = state.debts.find((d) => d.id === id);
  const desc = debt?.description || 'divida';

  try {
    const updated = await request(`/api/debts/${id}/installments`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });

    await loadDebtsAndSummary();

    if (action === 'inc') {
      toast(`Parcela paga: "${desc}" (${updated.paidInstallments}/${updated.totalInstallments})`, 'success');
      logAdd('payment', `Parcela paga em "${desc}": ${updated.paidInstallments}/${updated.totalInstallments}`);
    } else {
      toast(`Parcela revertida: "${desc}" (${updated.paidInstallments}/${updated.totalInstallments})`, 'info');
      logAdd('payment', `Parcela revertida em "${desc}": ${updated.paidInstallments}/${updated.totalInstallments}`);
    }
  } catch (error) {
    toast(error.message, 'error');
    logAdd('error', `Erro ao atualizar parcela de "${desc}": ${error.message}`);
  }
}

async function deleteWallet() {
  const wallet = state.wallets.find((w) => w.id === state.currentWalletId);
  if (!wallet) return;

  const count = state.debts.length;
  const msg = count > 0
    ? `Excluir a carteira "${wallet.name}" e suas ${count} divida(s)? Esta acao nao pode ser desfeita.`
    : `Excluir a carteira "${wallet.name}"? Esta acao nao pode ser desfeita.`;

  const confirmed = await customConfirm(msg);
  if (!confirmed) return;

  try {
    await request(`/api/wallets/${state.currentWalletId}`, { method: 'DELETE' });
    logAdd('wallet', `Carteira excluida: "${wallet.name}"${count > 0 ? ` (${count} divida(s) removida(s))` : ''}`);
    state.currentWalletId = '';
    await loadWallets();
    await loadDebtsAndSummary();
    toast(`Carteira "${wallet.name}" excluida.`, 'success');
  } catch (error) {
    toast(error.message, 'error');
    logAdd('error', `Erro ao excluir carteira "${wallet.name}": ${error.message}`);
  }
}

function shareOnWhatsApp() {
  const wallet = state.wallets.find((w) => w.id === state.currentWalletId);
  if (wallet) logAdd('share', `Carteira "${wallet.name}" compartilhada via WhatsApp.`);
  if (!wallet) return;

  const summary = {
    totalMonthToPay: parseFloat(dom.monthlyTotal.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0,
    totalRemainingDebt: parseFloat(dom.remainingTotal.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0,
    monthsToFinish: parseInt(dom.monthsToFinish.textContent, 10) || 0
  };

  const lines = [];

  lines.push(`💼 *CARTEIRA: ${wallet.name}*`);
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('📊 *RESUMO FINANCEIRO*');
  lines.push(`💰 Total do mês: *${brl.format(summary.totalMonthToPay)}*`);
  lines.push(`💳 Dívida restante: *${brl.format(summary.totalRemainingDebt)}*`);
  lines.push(`📅 Meses para quitar: *${summary.monthsToFinish}*`);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━');

  if (state.debts.length > 0) {
    lines.push('');
    lines.push('📋 *PARCELAMENTOS*');
    lines.push('');

    const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

    state.debts.forEach((debt, index) => {
      const num = emojis[index] || `${index + 1}.`;
      const pct = debt.totalInstallments > 0
        ? Math.round((debt.paidInstallments / debt.totalInstallments) * 100)
        : 0;
      const bar = buildProgressBar(pct);

      lines.push(`${num} *${debt.description}*`);
      lines.push(`   💵 Parcela mensal: *${brl.format(debt.installmentValue)}*`);
      lines.push(`   📦 Parcelas: ${debt.paidInstallments}/${debt.totalInstallments} pagas`);
      lines.push(`   ${bar} ${pct}%`);
      lines.push(`   💸 Restante: *${brl.format(debt.remainingAmount)}*`);
      if (debt.remainingInstallments === 0) {
        lines.push('   ✅ *QUITADA!*');
      }
      lines.push('');
    });
  } else {
    lines.push('');
    lines.push('📭 Nenhuma divida cadastrada nesta carteira.');
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('📲 _Gerado pelo Gerenciador de Dividas_');

  const text = lines.join('\n');
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function buildProgressBar(pct) {
  const total = 8;
  const filled = Math.round((pct / 100) * total);
  const empty = total - filled;
  return '🟩'.repeat(filled) + '⬜'.repeat(empty);
}

async function createWallet(event) {
  event.preventDefault();
  const name = dom.walletNameInput.value.trim();

  if (name.length < 2) {
    toast('Informe um nome de carteira valido.', 'warning');
    return;
  }

  try {
    await request('/api/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    dom.walletDialog.close();
    dom.walletForm.reset();
    await loadWallets();
    await loadDebtsAndSummary();
    toast(`Carteira "${name}" criada.`, 'success');
    logAdd('wallet', `Nova carteira criada: "${name}"`);
  } catch (error) {
    toast(error.message, 'error');
    logAdd('error', `Erro ao criar carteira "${name}": ${error.message}`);
  }
}

function setupEvents() {
  dom.walletSelect.addEventListener('change', async (event) => {
    state.currentWalletId = event.target.value;
    dom.debtWallet.value = state.currentWalletId;
    await loadDebtsAndSummary();
  });

  dom.addDebtFloating.addEventListener('click', () => openDebtModal());
  dom.addDebtInline.addEventListener('click', () => openDebtModal());
  dom.newWalletButton.addEventListener('click', () => dom.walletDialog.showModal());
  dom.deleteWalletButton.addEventListener('click', deleteWallet);
  dom.shareWalletButton.addEventListener('click', shareOnWhatsApp);

  dom.debtForm.addEventListener('submit', saveDebt);
  dom.walletForm.addEventListener('submit', createWallet);

  document.querySelector('[data-close-debt]').addEventListener('click', closeDebtModal);
  document.querySelector('[data-close-wallet]').addEventListener('click', () => dom.walletDialog.close());
}

// ─── PWA Install ─────────────────────────────────────────────────────────────

function setupInstall() {
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    dom.installButton.hidden = false;
    dom.installButton.classList.add('btn-install--visible');
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    dom.installButton.hidden = true;
    toast('Aplicativo instalado com sucesso!', 'success');
    logAdd('wallet', 'Aplicativo instalado no dispositivo.');
  });

  dom.installButton.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      toast('Instalando aplicativo…', 'info');
    } else {
      toast('Instalacao cancelada.', 'warning');
    }
    deferredPrompt = null;
    dom.installButton.hidden = true;
  });
}

function setupLog() {
  let logOpen = false;

  dom.logToggle.addEventListener('click', () => {
    logOpen = !logOpen;
    dom.logBody.classList.toggle('log-body--open', logOpen);
    dom.logChevron.textContent = logOpen ? '▼' : '▲';
  });

  dom.logClear.addEventListener('click', logClear);
  logRender();
}

function setupStars() {
  const canvas = document.getElementById('starsCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let stars = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    buildStars();
  }

  function buildStars() {
    const count = Math.floor((canvas.width * canvas.height) / 4200);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.2 + 0.2,
      alpha: Math.random() * 0.6 + 0.2,
      speed: Math.random() * 0.4 + 0.08,
      drift: (Math.random() - 0.5) * 0.08,
      twinkleOffset: Math.random() * Math.PI * 2,
    }));
  }

  let raf;
  let t = 0;
  function draw() {
    t += 0.016;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of stars) {
      const twinkle = s.alpha * (0.6 + 0.4 * Math.sin(t * 1.4 + s.twinkleOffset));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,210,255,${twinkle})`;
      ctx.fill();
      s.y += s.speed;
      s.x += s.drift;
      if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
      if (s.x < 0) s.x = canvas.width;
      if (s.x > canvas.width) s.x = 0;
    }
    raf = requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  draw();
}

async function start() {
  setupStars();
  setupEvents();
  setupLog();
  setupInstall();

  try {
    await loadWallets();
    await loadDebtsAndSummary();
  } catch (error) {
    toast(error.message, 'error');
    logAdd('error', `Erro ao iniciar app: ${error.message}`);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

start();
