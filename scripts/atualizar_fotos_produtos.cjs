const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://eylpiwynsbnmcacmwiqg.supabase.co';
const supabaseAnonKey = 'sb_publishable_SNuv08eSyBClEQWGF3Z3oQ_28nI--9P';
const dirFotosBase = 'C:\\Users\\User\\Documents\\Fotos';

// 1. Coletar arquivos recursivamente
function getFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      getFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

// 2. Normalizar texto para comparação
function normalizar(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extrairNomeModeloLimpo(baseName) {
  const norm = normalizar(baseName);
  return norm
    .replace(/\b(15\s*ML|30\s*ML|100\s*ML|4\s*GR|4\s*G|15|4|V01|V02|V03|V1|V2|V3|150X150|600X600|001|002|003)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 3. Extrair códigos de referência (ex: DI-018, 015V, BW-007006GC, 7167, PA010, etc.)
function extrairCodigosRef(nome) {
  const codigos = [];
  const matches = nome.match(/\b([A-Z]{1,4}[-_]?[0-9]{2,6}[A-Z0-9]*|[0-9]{3,5}[A-Z]?)\b/gi);
  if (matches) {
    matches.forEach(m => {
      const limpo = m.replace(/[-_]/g, '').toUpperCase();
      // Desconsiderar unidades comuns
      if (limpo.length >= 3 && !['15ML', '30ML', '100ML', '4GR', '4G', '2UN', '3UN', '4UN'].includes(limpo)) {
        codigos.push(limpo);
      }
    });
  }
  return codigos;
}

// 4. Determinar MimeType a partir da extensão
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

// 5. Casamento inteligente Produto <-> Foto
function casarProduto(prod, fotosAjustadas, outrasFotos) {
  const normProd = normalizar(prod.nome);
  const codsProd = extrairCodigosRef(prod.nome);

  if (prod.codigo_interno) {
    const c = prod.codigo_interno.replace(/[-_]/g, '').toUpperCase();
    if (c.length >= 3 && !codsProd.includes(c)) codsProd.push(c);
  }

  // A. Tenta casar primeiro com FOTOS AJUSTADAS (Prioridade Máxima)
  const matchAjustada = buscarMelhorFoto(normProd, codsProd, fotosAjustadas, true);
  if (matchAjustada) {
    return {
      foto: matchAjustada,
      origem: 'FOTOS AJUSTADAS (Prioritária)',
      motivo: matchAjustada.motivo
    };
  }

  // B. Se não encontrou ajustada, busca nas OUTRAS PASTAS
  const matchOutra = buscarMelhorFoto(normProd, codsProd, outrasFotos, false);
  if (matchOutra) {
    return {
      foto: matchOutra,
      origem: 'OUTRAS PASTAS (Secundária)',
      motivo: matchOutra.motivo
    };
  }

  return null;
}

function buscarMelhorFoto(normProd, codsProd, listaFotos, isAjustada) {
  // Regra 1: Código de referência exato (ex: DI-018, 015V, PA010, 7167)
  for (const cod of codsProd) {
    if (cod.length >= 3) {
      const achado = listaFotos.find(f => {
        return f.codigosRef.includes(cod) || f.normName.startsWith(cod) || f.normName.includes(` ${cod} `) || f.normName.includes(`_${cod}_`);
      });
      if (achado) return { ...achado, motivo: `Código Ref: ${cod}` };
    }
  }

  // Palavras proibidas de casarem sozinhas ou em conjunto puramente genérico
  const palavrasGenericas = new Set([
    'VIBRADOR', 'VIBRO', 'VIBRA', 'PROTESE', 'PROT', 'LUBRIFICANTE', 'LUB', 'GEL', 'OLEO', 'SPRAY', 'BEIJAVEL', 
    'MASSAGEM', 'FUNCIONAL', 'BOLINHA', 'ANEL', 'CAPA', 'PENIS', 'PN', 'MASTURBADOR', 'FANTASIA',
    'SILICONE', 'REALISTICO', 'REAL', 'TEXTURIZADA', 'RECARREGAVEL', 'VIBRACOES', 'PRETO', 'ROSA', 'BEGE', 'TRANSP', 'TRANSPARENTE',
    'MACICO', 'VENTOSA', 'SEM', 'COM', 'PARA', 'ESC', '15ML', '30ML', '100ML', '4GR', '4G', '2UN', '3UN', '4UN'
  ]);

  // Regra 2: Match por nome composto completo ou modelo contido (ex: "CHIBATA MAOZINHA", "KIT ENFERMEIRA", "APERTADINHA FRESH", "VENDA COURO")
  for (const f of listaFotos) {
    const alvo = f.modeloLimpo || f.normName;
    const palavrasAlvo = alvo.split(' ').filter(w => w.length > 0);
    if (palavrasAlvo.length === 0 || palavrasAlvo.every(w => palavrasGenericas.has(w))) {
      continue; // Ignora se o nome da foto só tiver termos genéricos (ex: "PENIS REALISTICO VIBRO")
    }

    if (alvo.length >= 4 && !palavrasGenericas.has(alvo)) {
      if (normProd === alvo || normProd.startsWith(alvo) || normProd.includes(alvo)) {
        if (!alvo.match(/^([0-9]+|15\s*V[0-9]+)$/)) {
          return { ...f, motivo: `Modelo Contido: "${alvo}"` };
        }
      }
    }
  }

  // Regra 3: Combinação de Palavras-Chave Específicas (ex: "XANA LOUCA", "TREME TREME", "BEIJO GREGO MORANGO", "ELETRIC BOMB MENTA", "LOVE LUB FRESH")
  const palavrasProd = normProd.split(' ').filter(w => w.length >= 3 && !palavrasGenericas.has(w));

  for (const f of listaFotos) {
    const alvo = f.modeloLimpo || f.normName;
    const palavrasFoto = alvo.split(' ').filter(w => w.length >= 3 && !palavrasGenericas.has(w));
    if (palavrasFoto.length >= 2) {
      const todasPresentes = palavrasFoto.every(wf => palavrasProd.includes(wf));
      if (todasPresentes) {
        return { ...f, motivo: `Termos-chave: ${palavrasFoto.join(' ')}` };
      }
    } else if (palavrasFoto.length === 1 && palavrasFoto[0].length >= 5) {
      // Termo forte e exclusivo (ex: "APERTADINHA", "VOLUMAO", "ANUKET", "CRONOS", "RETARDE", "VULCANO")
      if (palavrasProd.includes(palavrasFoto[0])) {
        return { ...f, motivo: `Termo Forte: ${palavrasFoto[0]}` };
      }
    }
  }

  return null;
}

// 6. Upload de imagem para o Supabase Storage
async function uploadFotoSupabase(lojaId, filePath, nomeArquivoDestino) {
  const fileBuffer = fs.readFileSync(filePath);
  const mimeType = getMimeType(filePath);
  const objectKey = `${lojaId}/${nomeArquivoDestino}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/produtos/${objectKey}`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': mimeType,
      'x-upsert': 'true'
    },
    body: fileBuffer
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Falha no upload Storage (${res.status}): ${errText}`);
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/produtos/${objectKey}`;
  return publicUrl;
}

// 7. Atualizar produto no banco Supabase
async function atualizarProdutoFotos(produtoId, fotosUrls) {
  const patchUrl = `${supabaseUrl}/rest/v1/produtos?id=eq.${produtoId}`;
  const res = await fetch(patchUrl, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fotos_urls: fotosUrls
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Falha ao atualizar produto (${res.status}): ${errText}`);
  }
}

async function main() {
  const executarUpload = process.argv.includes('--exec');

  console.log(`=======================================================`);
  console.log(`  HUBI - VINCULAÇÃO E UPLOAD DE FOTOS DOS PRODUTOS`);
  console.log(`  Modo: ${executarUpload ? 'EXECUÇÃO REAL (Upload + Gravação)' : 'DRY-RUN (Simulação e Relatório)'}`);
  console.log(`=======================================================\n`);

  console.log(`1. Indexando fotos em ${dirFotosBase}...`);
  const todosArquivos = getFiles(dirFotosBase);
  const fotosAjustadas = [];
  const outrasFotos = [];

  for (const f of todosArquivos) {
    const ext = path.extname(f).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue;

    const baseName = path.basename(f, ext);
    const item = {
      fullPath: f,
      fileName: path.basename(f),
      baseName,
      ext,
      normName: normalizar(baseName),
      modeloLimpo: extrairNomeModeloLimpo(baseName),
      codigosRef: extrairCodigosRef(baseName),
      isAjustada: f.toLowerCase().includes('ajustada')
    };

    if (item.isAjustada) {
      fotosAjustadas.push(item);
    } else {
      outrasFotos.push(item);
    }
  }

  console.log(`✓ Total de fotos válidas indexadas: ${fotosAjustadas.length + outrasFotos.length}`);
  console.log(`  - Fotos Ajustadas (Prioridade 1): ${fotosAjustadas.length}`);
  console.log(`  - Demais Fotos (Prioridade 2): ${outrasFotos.length}\n`);

  console.log(`2. Carregando produtos cadastrados no HUBI...`);
  let produtos = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${supabaseUrl}/rest/v1/produtos?select=id,nome,codigo_interno,codigo_barras,fotos_urls,loja_id&limit=200&offset=${offset}`, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    const batch = await res.json();
    if (!batch || batch.length === 0) break;
    produtos.push(...batch);
    if (batch.length < 200) break;
    offset += 200;
  }
  console.log(`✓ Total de produtos carregados: ${produtos.length}\n`);

  console.log(`3. Analisando correspondências de fotos...`);
  const linhasRelatorio = [
    'ID Produto;Nome Produto;SKU;Status;Origem da Foto;Arquivo Foto;Pasta de Origem;Motivo'
  ];

  const casadosAjustadas = [];
  const casadosOutras = [];
  const semFotos = [];

  for (const p of produtos) {
    const match = casarProduto(p, fotosAjustadas, outrasFotos);
    if (match) {
      const pastaRel = path.dirname(match.foto.fullPath).replace('C:\\Users\\User\\Documents\\Fotos', '');
      const itemMatch = {
        produto: p,
        foto: match.foto,
        origem: match.origem,
        motivo: match.motivo,
        pastaRel
      };

      if (match.origem.includes('AJUSTADAS')) {
        casadosAjustadas.push(itemMatch);
      } else {
        casadosOutras.push(itemMatch);
      }

      linhasRelatorio.push(`"${p.id}";"${p.nome.replace(/"/g, '""')}";"${p.codigo_interno || ''}";"FOTO ENCONTRADA";"${match.origem}";"${match.foto.fileName}";"${pastaRel.replace(/"/g, '""')}";"${match.motivo}"`);
    } else {
      semFotos.push(p);
      linhasRelatorio.push(`"${p.id}";"${p.nome.replace(/"/g, '""')}";"${p.codigo_interno || ''}";"SEM FOTO";"-";"-";"-";"-"`);
    }
  }

  // Salvar relatório CSV
  const pathRelatorio = 'C:\\Users\\User\\Documents\\relatorio_fotos_produtos.csv';
  fs.writeFileSync(pathRelatorio, '\uFEFF' + linhasRelatorio.join('\r\n'), 'utf8');
  console.log(`✓ Relatório de conferência salvo em: ${pathRelatorio}\n`);

  const totalComFoto = casadosAjustadas.length + casadosOutras.length;
  console.log(`--- RESUMO DO MAPEAMENTO ---`);
  console.log(`Total de Produtos: ${produtos.length}`);
  console.log(`✓ Fotos Ajustadas vinculadas (Prioridade 1): ${casadosAjustadas.length}`);
  console.log(`✓ Outras Pastas vinculadas (Prioridade 2): ${casadosOutras.length}`);
  console.log(`✓ Total de Produtos com Foto: ${totalComFoto} (${Math.round((totalComFoto / produtos.length) * 100)}%)`);
  console.log(`✗ Produtos ainda sem foto: ${semFotos.length}\n`);

  if (!executarUpload) {
    console.log(`[!] Modo Simulação finalizado. Nenhuma foto foi enviada ainda.`);
    console.log(`Para realizar o upload definitivo e atualizar o banco de dados, execute:`);
    console.log(`  node scripts/atualizar_fotos_produtos.cjs --exec\n`);
    return;
  }

  // 4. Execução do Upload e Atualização
  console.log(`4. Iniciando upload para o Supabase Storage e atualização do banco...`);
  const todosCasados = [...casadosAjustadas, ...casadosOutras];
  let sucessoCount = 0;
  let erroCount = 0;

  for (let i = 0; i < todosCasados.length; i++) {
    const item = todosCasados[i];
    const lojaId = item.produto.loja_id || 'bbae8c88-347e-46c4-a12a-3abd341a83dc';
    const ext = item.foto.ext.replace('.', '') || 'jpg';
    const safeBaseName = item.foto.baseName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
    const destFileName = `${Date.now()}_${i}_${safeBaseName}.${ext}`;

    const progresso = Math.round(((i + 1) / todosCasados.length) * 100);

    try {
      // A. Upload no Storage
      const publicUrl = await uploadFotoSupabase(lojaId, item.foto.fullPath, destFileName);

      // B. Atualizar no Banco
      await atualizarProdutoFotos(item.produto.id, [publicUrl]);

      sucessoCount++;
      process.stdout.write(`\r[${progresso}%] (${i + 1}/${todosCasados.length}) Foto associada: ${item.produto.nome.substring(0, 35)}... `);
    } catch (err) {
      erroCount++;
      console.error(`\nErro ao processar produto "${item.produto.nome}":`, err.message);
    }
  }

  console.log(`\n\n=======================================================`);
  console.log(`  PROCESSO CONCLUÍDO COM SUCESSO!`);
  console.log(`  - Produtos atualizados com foto: ${sucessoCount}`);
  console.log(`  - Falhas de upload: ${erroCount}`);
  console.log(`=======================================================\n`);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
