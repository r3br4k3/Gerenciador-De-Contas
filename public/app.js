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
  walletDialog: document.querySelector('#walletDialog'),
  walletForm: document.querySelector('#walletForm'),
  walletNameInput: document.querySelector('#walletNameInput'),
  debtTemplate: document.querySelector('#debtItemTemplate')
};

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

function notify(message) {
  window.alert(message);
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

function formatDate(value) {
  if (!value) return '--';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('pt-BR');
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
    node.querySelector('.debt-meta').textContent = `Vencimento: ${formatDate(debt.dueDate)}`;
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
    document.querySelector('#debtDueDate').value = debt.dueDate;
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

  if (!id) formData.delete('debtId');

  const isEditing = Boolean(id);
  const url = isEditing ? `/api/debts/${id}` : '/api/debts';
  const method = isEditing ? 'PUT' : 'POST';

  try {
    await request(url, {
      method,
      body: formData
    });

    closeDebtModal();
    await loadDebtsAndSummary();
  } catch (error) {
    notify(error.message);
  }
}

async function removeDebt(id) {
  if (!window.confirm('Deseja excluir esta divida?')) return;

  try {
    await request(`/api/debts/${id}`, { method: 'DELETE' });
    await loadDebtsAndSummary();
  } catch (error) {
    notify(error.message);
  }
}

async function changeInstallment(id, action) {
  try {
    await request(`/api/debts/${id}/installments`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });

    await loadDebtsAndSummary();
  } catch (error) {
    notify(error.message);
  }
}

async function createWallet(event) {
  event.preventDefault();
  const name = dom.walletNameInput.value.trim();

  if (name.length < 2) {
    notify('Informe um nome de carteira valido.');
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
  } catch (error) {
    notify(error.message);
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

  dom.debtForm.addEventListener('submit', saveDebt);
  dom.walletForm.addEventListener('submit', createWallet);

  document.querySelector('[data-close-debt]').addEventListener('click', closeDebtModal);
  document.querySelector('[data-close-wallet]').addEventListener('click', () => dom.walletDialog.close());
}

async function start() {
  setupEvents();

  try {
    await loadWallets();
    await loadDebtsAndSummary();
  } catch (error) {
    notify(error.message);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

start();
