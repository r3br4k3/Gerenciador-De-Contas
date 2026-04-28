const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const fssync = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');
const dbPath = path.join(dataDir, 'db.json');

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(publicDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});
const upload = multer({ storage });

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function enrichDebt(debt) {
  const totalAmount = toNumber(debt.totalAmount, 0);
  const totalInstallments = Math.max(1, Math.floor(toNumber(debt.totalInstallments, 1)));
  const paidInstallments = Math.max(0, Math.min(totalInstallments, Math.floor(toNumber(debt.paidInstallments, 0))));
  const installmentValue = roundCurrency(totalAmount / totalInstallments);
  const remainingInstallments = Math.max(0, totalInstallments - paidInstallments);
  const remainingAmount = roundCurrency(remainingInstallments * installmentValue);

  return {
    ...debt,
    totalAmount,
    totalInstallments,
    paidInstallments,
    installmentValue,
    remainingInstallments,
    remainingAmount
  };
}

function summarizeDebts(debts) {
  const enriched = debts.map(enrichDebt);
  const totalMonthToPay = roundCurrency(
    enriched.reduce((acc, debt) => acc + (debt.remainingInstallments > 0 ? debt.installmentValue : 0), 0)
  );
  const totalRemainingDebt = roundCurrency(enriched.reduce((acc, debt) => acc + debt.remainingAmount, 0));
  const monthsToFinish = enriched.reduce((max, debt) => Math.max(max, debt.remainingInstallments), 0);

  return {
    totalMonthToPay,
    totalRemainingDebt,
    monthsToFinish
  };
}

async function ensureStorage() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });

  if (!fssync.existsSync(dbPath)) {
    const defaultDb = {
      wallets: [
        {
          id: 'wallet-default',
          name: 'Carteira Principal',
          createdAt: new Date().toISOString()
        }
      ],
      debts: []
    };
    await fs.writeFile(dbPath, JSON.stringify(defaultDb, null, 2));
  }
}

async function readDb() {
  const raw = await fs.readFile(dbPath, 'utf8');
  const parsed = JSON.parse(raw);
  parsed.wallets = Array.isArray(parsed.wallets) ? parsed.wallets : [];
  parsed.debts = Array.isArray(parsed.debts) ? parsed.debts : [];
  return parsed;
}

async function writeDb(data) {
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
}

app.get('/api/wallets', async (_req, res) => {
  try {
    const db = await readDb();
    res.json(db.wallets);
  } catch (error) {
    res.status(500).json({ error: 'Falha ao listar carteiras.' });
  }
});

app.post('/api/wallets', async (req, res) => {
  try {
    const db = await readDb();
    const name = String(req.body?.name || '').trim();

    if (!name) {
      return res.status(400).json({ error: 'Nome da carteira e obrigatorio.' });
    }

    const wallet = {
      id: `wallet-${crypto.randomUUID()}`,
      name,
      createdAt: new Date().toISOString()
    };

    db.wallets.push(wallet);
    await writeDb(db);
    return res.status(201).json(wallet);
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao criar carteira.' });
  }
});

app.put('/api/wallets/:id', async (req, res) => {
  try {
    const db = await readDb();
    const name = String(req.body?.name || '').trim();

    if (!name) {
      return res.status(400).json({ error: 'Nome da carteira e obrigatorio.' });
    }

    const wallet = db.wallets.find((item) => item.id === req.params.id);

    if (!wallet) {
      return res.status(404).json({ error: 'Carteira nao encontrada.' });
    }

    wallet.name = name;
    await writeDb(db);
    return res.json(wallet);
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao editar carteira.' });
  }
});

app.delete('/api/wallets/:id', async (req, res) => {
  try {
    const db = await readDb();
    const index = db.wallets.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Carteira nao encontrada.' });
    }

    if (db.wallets.length === 1) {
      return res.status(400).json({ error: 'Nao e possivel excluir a ultima carteira.' });
    }

    // Remove a carteira e todas as dividas vinculadas a ela
    const debtFilesToRemove = db.debts
      .filter((d) => d.walletId === req.params.id)
      .map((d) => d.iconUrl)
      .filter(Boolean);

    db.debts = db.debts.filter((d) => d.walletId !== req.params.id);
    db.wallets.splice(index, 1);
    await writeDb(db);

    // Remove arquivos de upload orfaos em background
    debtFilesToRemove.forEach((url) => {
      const filename = url.replace('/uploads/', '');
      fs.unlink(path.join(uploadsDir, filename)).catch(() => {});
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao excluir carteira.' });
  }
});

app.get('/api/debts', async (req, res) => {
  try {
    const db = await readDb();
    const walletId = String(req.query.walletId || '').trim();
    const filtered = walletId ? db.debts.filter((debt) => debt.walletId === walletId) : db.debts;
    const result = filtered
      .map(enrichDebt)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Falha ao listar dividas.' });
  }
});

app.get('/api/summary', async (req, res) => {
  try {
    const db = await readDb();
    const walletId = String(req.query.walletId || '').trim();
    const filtered = walletId ? db.debts.filter((debt) => debt.walletId === walletId) : db.debts;
    res.json(summarizeDebts(filtered));
  } catch (error) {
    res.status(500).json({ error: 'Falha ao calcular resumo.' });
  }
});

app.post('/api/debts', upload.single('icon'), async (req, res) => {
  try {
    const db = await readDb();
    const description = String(req.body?.description || '').trim();
    const walletId = String(req.body?.walletId || '').trim();
    const totalAmount = toNumber(req.body?.totalAmount, NaN);
    const totalInstallments = Math.floor(toNumber(req.body?.totalInstallments, NaN));

    if (!description || !walletId || !Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isFinite(totalInstallments) || totalInstallments <= 0) {
      if (req.file?.filename) {
        await fs.unlink(path.join(uploadsDir, req.file.filename)).catch(() => {});
      }
      return res.status(400).json({ error: 'Preencha descricao, valor e parcelas corretamente.' });
    }

    const walletExists = db.wallets.some((wallet) => wallet.id === walletId);
    if (!walletExists) {
      if (req.file?.filename) {
        await fs.unlink(path.join(uploadsDir, req.file.filename)).catch(() => {});
      }
      return res.status(400).json({ error: 'Carteira invalida.' });
    }

    const debt = {
      id: `debt-${crypto.randomUUID()}`,
      walletId,
      description,
      totalAmount: roundCurrency(totalAmount),
      totalInstallments,
      paidInstallments: Math.max(0, Math.min(totalInstallments, Math.floor(toNumber(req.body?.paidInstallments, 0)))),
      iconUrl: req.file?.filename ? `/uploads/${req.file.filename}` : '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.debts.push(debt);
    await writeDb(db);
    return res.status(201).json(enrichDebt(debt));
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao criar divida.' });
  }
});

app.put('/api/debts/:id', upload.single('icon'), async (req, res) => {
  try {
    const db = await readDb();
    const debt = db.debts.find((item) => item.id === req.params.id);

    if (!debt) {
      if (req.file?.filename) {
        await fs.unlink(path.join(uploadsDir, req.file.filename)).catch(() => {});
      }
      return res.status(404).json({ error: 'Divida nao encontrada.' });
    }

    const description = String(req.body?.description || debt.description).trim();
    const walletId = String(req.body?.walletId || debt.walletId).trim();
    const totalAmount = toNumber(req.body?.totalAmount, debt.totalAmount);
    const totalInstallments = Math.floor(toNumber(req.body?.totalInstallments, debt.totalInstallments));

    if (!description || !walletId || !Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isFinite(totalInstallments) || totalInstallments <= 0) {
      if (req.file?.filename) {
        await fs.unlink(path.join(uploadsDir, req.file.filename)).catch(() => {});
      }
      return res.status(400).json({ error: 'Campos invalidos para atualizacao da divida.' });
    }

    const walletExists = db.wallets.some((wallet) => wallet.id === walletId);
    if (!walletExists) {
      if (req.file?.filename) {
        await fs.unlink(path.join(uploadsDir, req.file.filename)).catch(() => {});
      }
      return res.status(400).json({ error: 'Carteira invalida.' });
    }

    if (req.file?.filename && debt.iconUrl) {
      const oldFilename = debt.iconUrl.replace('/uploads/', '');
      await fs.unlink(path.join(uploadsDir, oldFilename)).catch(() => {});
    }

    debt.description = description;
    debt.walletId = walletId;
    debt.totalAmount = roundCurrency(totalAmount);
    debt.totalInstallments = totalInstallments;
    debt.paidInstallments = Math.max(0, Math.min(totalInstallments, Math.floor(toNumber(req.body?.paidInstallments, debt.paidInstallments))));
    debt.iconUrl = req.file?.filename ? `/uploads/${req.file.filename}` : debt.iconUrl;
    debt.updatedAt = new Date().toISOString();

    await writeDb(db);
    return res.json(enrichDebt(debt));
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao editar divida.' });
  }
});

app.patch('/api/debts/:id/installments', async (req, res) => {
  try {
    const db = await readDb();
    const debt = db.debts.find((item) => item.id === req.params.id);

    if (!debt) {
      return res.status(404).json({ error: 'Divida nao encontrada.' });
    }

    const action = String(req.body?.action || '').toLowerCase();
    const currentPaid = Math.floor(toNumber(debt.paidInstallments, 0));

    if (action === 'inc') {
      debt.paidInstallments = Math.min(debt.totalInstallments, currentPaid + 1);
    } else if (action === 'dec') {
      debt.paidInstallments = Math.max(0, currentPaid - 1);
    } else {
      return res.status(400).json({ error: 'Acao invalida. Use inc ou dec.' });
    }

    debt.updatedAt = new Date().toISOString();
    await writeDb(db);
    return res.json(enrichDebt(debt));
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao atualizar parcelas pagas.' });
  }
});

app.delete('/api/debts/:id', async (req, res) => {
  try {
    const db = await readDb();
    const index = db.debts.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Divida nao encontrada.' });
    }

    const [removed] = db.debts.splice(index, 1);

    if (removed.iconUrl) {
      const filename = removed.iconUrl.replace('/uploads/', '');
      await fs.unlink(path.join(uploadsDir, filename)).catch(() => {});
    }

    await writeDb(db);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao remover divida.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

ensureStorage()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Falha ao iniciar servidor:', error);
    process.exit(1);
  });
