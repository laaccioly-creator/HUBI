const supabaseUrl = 'https://eylpiwynsbnmcacmwiqg.supabase.co';
const supabaseAnonKey = 'sb_publishable_SNuv08eSyBClEQWGF3Z3oQ_28nI--9P';

const UFS_MAP = {
  'AC': 'AC', 'AL': 'AL', 'AP': 'AP', 'AM': 'AM', 'BA': 'BA', 'CE': 'CE', 'DF': 'DF', 'ES': 'ES',
  'GO': 'GO', 'MA': 'MA', 'MT': 'MT', 'MS': 'MS', 'MG': 'MG', 'PA': 'PA', 'PB': 'PB', 'PR': 'PR',
  'PE': 'PE', 'PI': 'PI', 'RJ': 'RJ', 'RN': 'RN', 'RS': 'RS', 'RO': 'RO', 'RR': 'RR', 'SC': 'SC',
  'SP': 'SP', 'SE': 'SE', 'TO': 'TO',
  'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAZONAS': 'AM', 'BAHIA': 'BA', 'CEARA': 'CE', 'CEARÁ': 'CE',
  'ESPIRITO SANTO': 'ES', 'ESPÍRITO SANTO': 'ES', 'GOIAS': 'GO', 'GOIÁS': 'GO', 'MARANHAO': 'MA', 'MARANHÃO': 'MA',
  'MATO GROSSO': 'MT', 'MINAS GERAIS': 'MG', 'PARA': 'PA', 'PARÁ': 'PA', 'PARAIBA': 'PB', 'PARAÍBA': 'PB',
  'PARANA': 'PR', 'PARANÁ': 'PR', 'PERNAMBUCO': 'PE', 'PIAUI': 'PI', 'PIAUÍ': 'PI', 'RIO DE JANEIRO': 'RJ',
  'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', 'RONDONIA': 'RO', 'RONDÔNIA': 'RO',
  'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', 'SÃO PAULO': 'SP', 'SERGIPE': 'SE', 'TOCANTINS': 'TO'
};

function extrairEnderecoEstruturado(texto) {
  if (!texto || !texto.trim()) {
    return { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' };
  }

  let limpo = texto.trim().replace(/\r\n/g, '\n');
  let cep = '';
  let estado = '';
  let numero = '';
  let complemento = '';
  let bairro = '';
  let cidade = '';
  let rua = '';

  // 1. Extrair CEP
  const matchCep = limpo.match(/(?:CEP:?\s*)?(\d{5}-?\d{3})/i);
  if (matchCep) {
    const rawCep = matchCep[1].replace(/\D/g, '');
    cep = `${rawCep.slice(0, 5)}-${rawCep.slice(5)}`;
    limpo = limpo.replace(matchCep[0], '').trim();
  }

  // 2. Extrair Estado / UF
  for (const [nomeUf, sigla] of Object.entries(UFS_MAP)) {
    const regexUf = new RegExp(`(?:,|\\/|-|•|\\s)\\s*\\b${nomeUf}\\b(?:$|\\s|,|\\/|-|•)`, 'i');
    if (regexUf.test(limpo)) {
      estado = sigla;
      limpo = limpo.replace(regexUf, ' ').trim();
      break;
    }
  }

  // 3. Extrair linhas de complemento
  const linhas = limpo.split('\n').map(l => l.trim()).filter(Boolean);
  if (linhas.length > 1) {
    complemento = linhas.slice(1).join(' - ');
    limpo = linhas[0];
  }

  // 4. Analisar partes
  const partes = limpo.split(/[,•]/).map(p => p.trim()).filter(Boolean);

  if (partes.length >= 2) {
    rua = partes[0];
    for (let i = 1; i < partes.length; i++) {
      const parte = partes[i];
      const matchNum = parte.match(/^(?:n[ºo°\.]?\s*)?(\d+[A-Za-z]?)$/i);
      if (matchNum && !numero) {
        numero = matchNum[1];
        continue;
      }
      if (i === 1 && !numero && parte.match(/\d+/)) {
        const m = parte.match(/^(?:n[ºo°\.]?\s*)?(\d+[A-Za-z]?)(.*)$/i);
        if (m) {
          numero = m[1];
          if (m[2] && m[2].trim()) {
            complemento = complemento ? `${complemento} - ${m[2].trim()}` : m[2].trim();
          }
          continue;
        }
      }
      if (!bairro && i < partes.length - 1) {
        bairro = parte;
      } else if (!cidade) {
        cidade = parte;
      } else {
        complemento = complemento ? `${complemento}, ${parte}` : parte;
      }
    }
  } else {
    const matchNumFinal = limpo.match(/^(.*?)[,\s]+(?:n[ºo°\.]?\s*)?(\d+[A-Za-z]?)(.*)$/i);
    if (matchNumFinal) {
      rua = matchNumFinal[1].trim();
      numero = matchNumFinal[2].trim();
      const resto = matchNumFinal[3].trim().replace(/^[,-\s]+/, '');
      if (resto) {
        if (!bairro) bairro = resto;
        else complemento = complemento ? `${complemento} - ${resto}` : resto;
      }
    } else {
      rua = limpo;
    }
  }

  if (rua && !numero) {
    const mRua = rua.match(/^(.*?)[,\s]+(?:n[ºo°\.]?\s*)?(\d+[A-Za-z]?)$/i);
    if (mRua) {
      rua = mRua[1].trim();
      numero = mRua[2].trim();
    }
  }

  rua = rua.replace(/[,-\/]+$/, '').trim();
  numero = numero.replace(/[,-\/]+$/, '').trim();
  bairro = bairro.replace(/[,-\/]+$/, '').trim();
  cidade = cidade.replace(/[,-\/]+$/, '').trim();
  complemento = complemento.replace(/[,-\/]+$/, '').trim();

  return { cep, rua, numero, complemento, bairro, cidade, estado };
}

async function main() {
  console.log('Buscando clientes no Supabase...');
  const res = await fetch(`${supabaseUrl}/rest/v1/clientes?select=id,nome,endereco_principal,endereco_logradouro,endereco_numero,endereco_complemento,endereco_bairro,endereco_cidade,endereco_estado,endereco_cep&limit=500`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` }
  });

  const clientes = await res.json();
  const precisamAtualizar = clientes.filter(c => c.endereco_principal && !c.endereco_logradouro);
  console.log(`Total de clientes que possuem endereco_principal mas sem endereco_logradouro: ${precisamAtualizar.length}`);

  let atualizados = 0;
  for (const c of precisamAtualizar) {
    const parsed = extrairEnderecoEstruturado(c.endereco_principal);
    const payload = {
      endereco_logradouro: parsed.rua || c.endereco_principal,
      endereco_numero: parsed.numero || null,
      endereco_complemento: parsed.complemento || null,
      endereco_bairro: parsed.bairro || null,
      endereco_cidade: parsed.cidade || null,
      endereco_estado: parsed.estado || null,
      endereco_cep: parsed.cep || null
    };

    const patchRes = await fetch(`${supabaseUrl}/rest/v1/clientes?id=eq.${c.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (patchRes.ok) {
      atualizados++;
      console.log(`✓ [${atualizados}/${precisamAtualizar.length}] Atualizado: ${c.nome} -> Rua: "${payload.endereco_logradouro}", Nº: "${payload.endereco_numero || 'S/N'}", Bairro: "${payload.endereco_bairro || '-'}", Cidade: "${payload.endereco_cidade || '-'}", UF: "${payload.endereco_estado || '-'}"`);
    } else {
      console.error(`✗ Erro ao atualizar ${c.nome}:`, await patchRes.text());
    }
  }

  console.log(`\nConcluído! ${atualizados} clientes atualizados no banco com sucesso.`);
}

main().catch(console.error);
