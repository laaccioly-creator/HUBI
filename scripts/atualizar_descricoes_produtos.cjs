const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eylpiwynsbnmcacmwiqg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_SNuv08eSyBClEQWGF3Z3oQ_28nI--9P';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const normalize = (s) => (s ? s.trim().toLowerCase().replace(/\s+/g, ' ') : '');

async function main() {
  console.log('🚀 Iniciando atualização das descrições dos produtos a partir do Excel...');

  const excelPath = path.resolve(__dirname, '../IMPORTAR/HUBI_Modelo_Importacao_Produtos (1).xlsx');
  if (!fs.existsSync(excelPath)) {
    console.error(`❌ Arquivo Excel não encontrado em: ${excelPath}`);
    process.exit(1);
  }

  const wb = xlsx.readFile(excelPath);
  const sheet = wb.Sheets['Produtos'] || wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);

  console.log(`📊 Total de linhas na planilha Excel: ${rows.length}`);

  const excelMap = new Map();
  for (const r of rows) {
    const nome = r['Nome do Produto *'];
    const desc = r['Descrição'];
    if (nome && desc && String(desc).trim().length > 0) {
      excelMap.set(normalize(nome), {
        nomeOriginal: nome,
        descricao: String(desc).trim()
      });
    }
  }

  console.log(`📝 Produtos no Excel com descrição preenchida: ${excelMap.size}`);

  // Buscar todos os produtos do Supabase
  const { data: dbProducts, error: errFetch } = await supabase
    .from('produtos')
    .select('id, nome, descricao');

  if (errFetch) {
    console.error('❌ Erro ao buscar produtos no Supabase:', errFetch);
    process.exit(1);
  }

  console.log(`🗄️ Total de produtos no banco de dados: ${dbProducts.length}`);

  let atualizados = 0;
  let erros = 0;
  let semDescricaoNoExcel = 0;

  for (let i = 0; i < dbProducts.length; i++) {
    const prod = dbProducts[i];
    const norm = normalize(prod.nome);

    if (excelMap.has(norm)) {
      const { descricao, nomeOriginal } = excelMap.get(norm);

      const { error: errUpdate } = await supabase
        .from('produtos')
        .update({
          descricao,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', prod.id);

      if (errUpdate) {
        console.error(`❌ Erro ao atualizar "${prod.nome}" (ID: ${prod.id}):`, errUpdate.message);
        erros++;
      } else {
        atualizados++;
        if (atualizados % 25 === 0 || atualizados === excelMap.size) {
          console.log(`✅ [${atualizados}/${excelMap.size}] Atualizado: "${prod.nome}"`);
        }
      }
    } else {
      semDescricaoNoExcel++;
    }
  }

  console.log('\n========================================');
  console.log('🎉 RESUMO DA ATUALIZAÇÃO:');
  console.log(`✔️ Produtos com descrição atualizada: ${atualizados}`);
  console.log(`⚠️ Produtos no banco sem descrição no Excel: ${semDescricaoNoExcel}`);
  console.log(`❌ Erros durante a atualização: ${erros}`);
  console.log('========================================');
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
