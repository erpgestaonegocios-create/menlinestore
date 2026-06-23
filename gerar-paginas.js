#!/usr/bin/env node
/*
 * gerar-paginas.js  —  Men Line Store
 * ------------------------------------------------------------------
 * Gera uma página por produto em /p/<id>/index.html com as meta tags
 * Open Graph que o Facebook/Instagram leem ao validar o link.
 *
 * Por que existe:
 *   O site é uma página única e usa #produto-<id> (hash). O robô da
 *   Meta NÃO executa JavaScript e ignora o que vem depois do "#",
 *   então via hash ela só enxerga a home genérica. Estas páginas dão
 *   a ela uma URL real e legível por produto: /p/<id>/.
 *
 * Cada página:
 *   - tem og:title, og:description, og:image, og:url, product:price...
 *   - redireciona um visitante humano para a loja: /#produto-<id>
 *
 * Roda no build (GitHub Actions), lendo os produtos ATIVOS direto do
 * Supabase. Assim, sempre reflete o estado atual do banco — produto
 * novo cadastrado pelo sistema vira página automaticamente.
 * ------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

// ── Configuração (via variáveis de ambiente no GitHub Actions) ──────
const SUPA_URL = process.env.SUPA_URL || 'https://uqigoyedyaltwjmfysnu.supabase.co';
const SUPA_KEY = process.env.SUPA_KEY;                 // secret no Actions
const PERFIL   = process.env.PERFIL   || 'lojista';
const SITE     = process.env.SITE_URL || 'https://menlinestore.com.br';
const OG_IMAGE = process.env.OG_IMAGE || (SITE + '/logo.png'); // logo da loja

if (!SUPA_KEY) {
  console.error('ERRO: variável de ambiente SUPA_KEY não definida.');
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function precoFinal(p) {
  return parseFloat(p.preco_venda || 0).toFixed(2);
}

async function fetchProdutos() {
  const url = SUPA_URL + '/rest/v1/produtos?select=*&perfil_codigo=eq.' +
    encodeURIComponent(PERFIL) + '&ativo=eq.true&order=nome.asc';
  const res = await fetch(url, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }
  });
  if (!res.ok) {
    throw new Error('Falha ao buscar produtos: ' + res.status + ' ' + (await res.text()));
  }
  return res.json();
}

function paginaProduto(p) {
  const id = p.id;
  const titulo = escapeHtml(p.nome || ('Produto ' + id));
  const descRaw = (p.descricao || p.obs_site ||
    ('Confira ' + (p.nome || 'este produto') + ' na Men Line Store.')).trim();
  const desc = escapeHtml(descRaw.slice(0, 200));
  const preco = precoFinal(p);
  const urlProduto = SITE + '/p/' + id + '/';
  const destino = SITE + '/#produto-' + id;
  const estoque = parseFloat(p.estoque_atual || 0);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titulo} — Men Line Store</title>
<meta name="description" content="${desc}">

<!-- Open Graph (Facebook / Instagram) -->
<meta property="og:type" content="product">
<meta property="og:site_name" content="Men Line Store">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:url" content="${urlProduto}">
<meta property="product:price:amount" content="${preco}">
<meta property="product:price:currency" content="BRL">
<meta property="product:availability" content="${estoque > 0 ? 'in stock' : 'out of stock'}">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${titulo}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${OG_IMAGE}">

<link rel="canonical" href="${urlProduto}">

<!-- Visitante humano é redirecionado para a loja no produto certo.
     O robô da Meta lê as tags acima e ignora o redirect. -->
<script>window.location.replace(${JSON.stringify(destino)});</script>
<meta http-equiv="refresh" content="0; url=${destino}">
</head>
<body style="font-family:Arial,sans-serif;background:#0d0d0d;color:#fff;text-align:center;padding:60px 20px">
  <h1>${titulo}</h1>
  <p>Redirecionando para a loja…</p>
  <p><a href="${destino}" style="color:#c9a84c">Clique aqui se não for redirecionado</a></p>
</body>
</html>`;
}

async function main() {
  const produtos = await fetchProdutos();
  console.log('Produtos ativos encontrados: ' + produtos.length);

  const outDir = path.join(process.cwd(), 'p');
  if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const linhas = [];
  for (const p of produtos) {
    const dir = path.join(outDir, String(p.id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), paginaProduto(p), 'utf8');
    linhas.push({ id: p.id, nome: p.nome, link: SITE + '/p/' + p.id + '/' });
    console.log('  gerado: /p/' + p.id + '/  → ' + p.nome);
  }

  // índice com os links, para copiar fácil ao cadastrar na Meta
  const indexLinks = linhas.map(l =>
    `<tr><td>${l.id}</td><td>${escapeHtml(l.nome)}</td><td><a href="${l.link}">${l.link}</a></td></tr>`
  ).join('\n');
  fs.writeFileSync(path.join(outDir, 'index.html'),
`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="robots" content="noindex">
<title>Links de produtos — Men Line Store</title></head>
<body style="font-family:Arial,sans-serif;padding:30px;max-width:900px;margin:auto">
<h1>Links de produtos para o catálogo da Meta</h1>
<p>Ao cadastrar cada produto no Gerenciador de Comércio, use o link da última coluna no campo <b>"Link do produto"</b>.</p>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%">
<tr style="background:#eee"><th>ID</th><th>Nome</th><th>Link (cole na Meta)</th></tr>
${indexLinks}
</table></body></html>`, 'utf8');

  console.log('\nConcluído: ' + linhas.length + ' páginas em /p/');
  console.log('Veja a lista de links em: ' + SITE + '/p/');
}

main().catch(e => { console.error(e); process.exit(1); });
