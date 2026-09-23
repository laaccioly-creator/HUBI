import { createClient } from '@supabase/supabase-js';

const url = 'https://eylpiwynsbnmcacmwiqg.supabase.co';
const key = 'sb_publishable_SNuv08eSyBClEQWGF3Z3oQ_28nI--9P';
const sb = createClient(url, key);

async function testAccount() {
  const { data: configs } = await sb.from('loja_shipping_configs').select('*').limit(1);
  const token = configs[0].melhor_envio_token;
  const baseUrl = configs[0].melhor_envio_sandbox_mode ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';

  console.log('--- CONSULTANDO CONTA NO MELHOR ENVIO ---');

  const meRes = await fetch(`${baseUrl}/api/v2/me`, {
    headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
  });
  const me = await meRes.json();
  console.log('Me:', JSON.stringify({
    id: me.id,
    firstname: me.firstname,
    lastname: me.lastname,
    email: me.email,
    document: me.document,
    balance: me.balance,
    status: me.status,
    phone: me.phone,
    address: me.address,
    company: me.company
  }, null, 2));

  // Consulta serviços
  const sRes = await fetch(`${baseUrl}/api/v2/me/shipment/services`, {
    headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
  });
  if (sRes.ok) {
    const sJson = await sRes.json();
    console.log('Serviços disponíveis:', sJson.map(s => `${s.id}: ${s.name} (${s.company?.name}) - status: ${s.status}`));
  }
}

testAccount().catch(console.error);
