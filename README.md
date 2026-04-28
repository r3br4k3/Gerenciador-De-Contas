# Gerenciador de Dividas (Node.js + PWA)

Aplicativo web responsivo para organizar dividas por carteiras, com resumo financeiro mensal e acompanhamento de parcelas.

## Funcionalidades

- Tema escuro moderno e responsivo
- Seletor de carteiras de dividas
- Cadastro de nova divida com:
  - Descricao
  - Valor total
  - Parcelas
  - Vencimento
  - Foto/icone
- Lista de parcelamentos com:
  - Controle `+` e `-` de parcelas pagas
  - Edicao da divida
  - Exclusao da divida
- Resumo da carteira selecionada:
  - Total do mes a pagar
  - Total de divida restante
  - Quantos meses faltam para quitar tudo
- PWA (manifesto e service worker)

## Como executar

1. Instale dependencias:

npm install

2. Rode em desenvolvimento:

npm run dev

ou em modo producao:

npm start

3. Abra no navegador:

http://localhost:3000

## Estrutura

- `server.js`: API Node.js/Express e servidor estatico
- `public/`: frontend PWA
- `uploads/`: imagens enviadas
- `data/db.json`: base local em JSON

## Deploy na Hostinger

1. Suba o projeto para um repositorio Git.
2. No painel da Hostinger (Node.js), conecte o repositorio.
3. Configure:
   - Build/install: `npm install`
   - Start command: `npm start`
   - Porta: use a variavel de ambiente `PORT` (o app ja suporta).
4. Publique.
