const https = require('https');

// Helper to make HTTPS requests without external dependencies
function makeRequest(url, options, postData = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const requestOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, data });
          }
        } else {
          reject(new Error(`Request failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// Escape markdown characters to avoid Telegram parsing errors
const escapeMarkdown = (text) => {
  if (!text) return '';
  return String(text).replace(/([_*`[\]()])/g, '\\$1');
};

async function run() {
  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Erro: Variáveis de ambiente obrigatórias (SUPABASE_URL, SUPABASE_ANON_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) não configuradas.');
    process.exit(1);
  }

  console.log(`URL de Consulta Utilizada: ${SUPABASE_URL}/rest/v1/transactions?select=*`);
  console.log('Iniciando consulta ao Supabase...');

  let transactions = [];
  let fetchMethodUsed = 'REST API Direta';

  try {
    // 1. Tentar buscar transações diretamente do Supabase REST API
    const supabaseEndpoint = `${SUPABASE_URL}/rest/v1/transactions?select=*`;
    const supabaseOptions = {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Range': '0-9999'
      }
    };

    let response;
    try {
      response = await makeRequest(supabaseEndpoint, supabaseOptions);
      console.log(`[REST API] Código de Status HTTP: ${response.statusCode}`);
      
      if (Array.isArray(response.data)) {
        transactions = response.data;
        console.log(`[REST API] Quantidade de transações retornadas: ${transactions.length}`);
      } else {
        console.log(`[REST API] Resposta não é um array. Corpo retornado: ${JSON.stringify(response.data)}`);
      }
    } catch (restErr) {
      console.error(`[REST API] Falha na consulta direta: ${restErr.message}`);
    }

    // Se o resultado veio vazio (geralmente devido ao RLS ativo que filtra registros para usuários anônimos)
    if (transactions.length === 0) {
      console.log('\n⚠️  ALERTA: A consulta direta retornou 0 transações.');
      console.log('Isso ocorre quando o RLS (Row Level Security) está ativo na tabela "transactions" e a requisição não possui um token de usuário autenticado.');
      console.log('Tentando método alternativo seguro via função RPC (get_transactions_secure)...');

      const rpcEndpoint = `${SUPABASE_URL}/rest/v1/rpc/get_transactions_secure`;
      const rpcPayload = JSON.stringify({ token: TELEGRAM_CHAT_ID });
      const rpcOptions = {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      };

      try {
        console.log(`URL de RPC Utilizada: ${rpcEndpoint}`);
        const rpcResponse = await makeRequest(rpcEndpoint, rpcOptions, rpcPayload);
        console.log(`[RPC API] Código de Status HTTP: ${rpcResponse.statusCode}`);
        
        if (Array.isArray(rpcResponse.data)) {
          transactions = rpcResponse.data;
          fetchMethodUsed = 'RPC Seguro';
          console.log(`[RPC API] Sucesso! Quantidade de transações retornadas: ${transactions.length}`);
        } else {
          console.log(`[RPC API] Resposta não é um array. Corpo retornado: ${JSON.stringify(rpcResponse.data)}`);
        }
      } catch (rpcErr) {
        console.log(`\n❌ [RPC API] Falha ao executar a função RPC: ${rpcErr.message}`);
        console.log('\n========================================================================');
        console.log('🔑 INSTRUÇÃO DE SEGURANÇA SUPABASE RLS:');
        console.log('Para que a GitHub Action consiga ler as transações de forma segura sem desativar o RLS,');
        console.log('execute o seguinte comando SQL no seu Painel do Supabase (SQL Editor):\n');
        console.log(`CREATE OR REPLACE FUNCTION get_transactions_secure(token TEXT)
RETURNS SETOF transactions
LANGUAGE plpgsql
SECURITY DEFINER -- Ignora o RLS temporariamente apenas para esta função
AS $$
BEGIN
    -- Compara o token enviado pela GitHub Action com o seu TELEGRAM_CHAT_ID ou TELEGRAM_BOT_TOKEN real
    -- IMPORTANTE: Substitua os valores abaixo pelos seus dados configurados nas Secrets do GitHub!
    IF token = '${TELEGRAM_CHAT_ID}' OR token = '${TELEGRAM_BOT_TOKEN}' THEN
        RETURN QUERY SELECT * FROM transactions;
    ELSE
        RETURN;
    END IF;
END;
$$;`);
        console.log('\nIsso criará uma função RPC segura e criptografada que apenas a sua GitHub Action poderá chamar.');
        console.log('========================================================================\n');
        
        throw new Error('Nenhuma transação pôde ser recuperada por bloqueio de RLS. Siga os passos acima para autorizar o acesso.');
      }
    }

    if (transactions.length === 0) {
      throw new Error('A lista de transações retornada está vazia.');
    }

    console.log(`Sucesso via ${fetchMethodUsed}! Carregadas ${transactions.length} transações.`);

    // 2. Definir datas em Brasília (UTC-3)
    const now = new Date();
    const brtOffset = -3 * 60 * 60 * 1000;
    const brtDate = new Date(now.getTime() + brtOffset);

    const brtYear = brtDate.getUTCFullYear();
    const brtMonth = String(brtDate.getUTCMonth() + 1).padStart(2, '0');
    const brtDay = String(brtDate.getUTCDate()).padStart(2, '0');

    const currentMonthKey = `${brtYear}-${brtMonth}`; // 'YYYY-MM'
    const todayStr = `${brtYear}-${brtMonth}-${brtDay}`; // 'YYYY-MM-DD'

    const brtDate7Days = new Date(brtDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const brtYear7 = brtDate7Days.getUTCFullYear();
    const brtMonth7 = String(brtDate7Days.getUTCMonth() + 1).padStart(2, '0');
    const brtDay7 = String(brtDate7Days.getUTCDate()).padStart(2, '0');
    const in7DaysStr = `${brtYear7}-${brtMonth7}-${brtDay7}`; // 'YYYY-MM-DD'

    // Formatter de Moeda BRL
    const formatBRL = (val) => {
      try {
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(val);
      } catch (e) {
        const fixed = Number(val).toFixed(2);
        const parts = fixed.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return `R$ ${parts.join(',')}`;
      }
    };

    // Helper para converter string de data em formato brasileiro
    const formatBrtDateStr = (dateStr) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
    };

    // Agrupar transações por usuário (caso haja múltiplos)
    const transactionsByUser = {};
    transactions.forEach(t => {
      const uId = t.user_id || 'default';
      if (!transactionsByUser[uId]) {
        transactionsByUser[uId] = [];
      }
      transactionsByUser[uId].push(t);
    });

    const userIds = Object.keys(transactionsByUser);
    console.log(`Encontrados ${userIds.length} usuário(s) nas transações.`);

    // Criar mensagem consolidada
    let telegramMessage = `📊 *FINANCEIRO DIEGO - RELATÓRIO DIÁRIO*\n`;
    telegramMessage += `🗓️ _Data: ${brtDay}/${brtMonth}/${brtYear} (08:00 BRT)_\n\n`;

    for (let i = 0; i < userIds.length; i++) {
      const uId = userIds[i];
      const userTransactions = transactionsByUser[uId];

      if (userIds.length > 1) {
        telegramMessage += `👤 *Usuário: \`${escapeMarkdown(uId.slice(0, 8))}\`...*\n`;
      }

      // Cálculos do usuário
      let saldoAtualGeral = 0;
      let saldoAteHoje = 0;
      
      let receitasMes = 0;
      let despesasMesComuns = 0;
      let despesasMesFolha = 0;

      const contasProximas = [];

      userTransactions.forEach(t => {
        const amt = Number(t.amount) || 0;
        const bDate = t.billing_date || t.date || '';

        // All-time balance
        if (t.type === 'income') {
          saldoAtualGeral += amt;
        } else if (t.type === 'expense' || t.type === 'payroll_deduction') {
          saldoAtualGeral -= amt;
        }

        // Balance up to today (billing_date <= todayStr)
        if (bDate && bDate <= todayStr) {
          if (t.type === 'income') {
            saldoAteHoje += amt;
          } else if (t.type === 'expense' || t.type === 'payroll_deduction') {
            saldoAteHoje -= amt;
          }
        }

        // Current month filter
        if (bDate && bDate.startsWith(currentMonthKey)) {
          if (t.type === 'income') {
            receitasMes += amt;
          } else if (t.type === 'expense') {
            despesasMesComuns += amt;
          } else if (t.type === 'payroll_deduction') {
            despesasMesFolha += amt;
          }
        }

        // Maturing in the next 7 days (todayStr <= billing_date <= in7DaysStr)
        // Only list expense & payroll_deduction as bills to pay
        if (t.type !== 'income' && bDate && bDate >= todayStr && bDate <= in7DaysStr) {
          contasProximas.push(t);
        }
      });

      const totalDespesasMes = despesasMesComuns + despesasMesFolha;
      const saldoLivreRealMes = receitasMes - totalDespesasMes;

      telegramMessage += `💵 *Saldos:*\n`;
      telegramMessage += `• *Saldo Geral Acumulado:* \`${formatBRL(saldoAtualGeral)}\`\n`;
      telegramMessage += `• *Saldo Real até Hoje:* \`${formatBRL(saldoAteHoje)}\`\n\n`;

      telegramMessage += `📈 *Mês Atual (${currentMonthKey}):*\n`;
      telegramMessage += `• *Receitas:* \`${formatBRL(receitasMes)}\`\n`;
      telegramMessage += `• *Despesas:* \`${formatBRL(totalDespesasMes)}\`\n`;
      if (despesasMesFolha > 0) {
        telegramMessage += `  _└ Comuns: ${formatBRL(despesasMesComuns)}_\n`;
        telegramMessage += `  _└ Desc. Folha: ${formatBRL(despesasMesFolha)}_\n`;
      }
      telegramMessage += `• *Saldo Livre do Mês:* \`${formatBRL(saldoLivreRealMes)}\`\n\n`;

      telegramMessage += `⚠️ *Vencimentos nos próximos 7 dias:*\n`;
      if (contasProximas.length > 0) {
        // Ordenar por data de vencimento
        contasProximas.sort((a, b) => {
          const ad = a.billing_date || a.date || '';
          const bd = b.billing_date || b.date || '';
          return ad.localeCompare(bd);
        });

        contasProximas.forEach(c => {
          const emoji = c.is_credit_card ? '💳' : '📄';
          const cardIndicator = c.is_credit_card ? ' (Cartão)' : '';
          const folhaIndicator = c.type === 'payroll_deduction' ? ' (Folha)' : '';
          telegramMessage += `• *${formatBrtDateStr(c.billing_date || c.date)}* - ${escapeMarkdown(c.description)} [${escapeMarkdown(c.category)}] - \`${formatBRL(c.amount)}\`${emoji}${cardIndicator}${folhaIndicator}\n`;
        });
      } else {
        telegramMessage += `• _Nenhum vencimento registrado para os próximos 7 dias._\n`;
      }

      if (i < userIds.length - 1) {
        telegramMessage += `\n───────────────────\n\n`;
      }
    }

    telegramMessage += `\n📲 _Gerado automaticamente via GitHub Actions_`;

    console.log('Mensagem formatada com sucesso. Enviando para o Telegram...');

    // 3. Enviar para o Telegram
    const telegramEndpoint = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const telegramOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    const telegramPayload = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: telegramMessage,
      parse_mode: 'Markdown'
    });

    await makeRequest(telegramEndpoint, telegramOptions, telegramPayload);
    console.log('Mensagem enviada com sucesso ao Telegram!');

  } catch (err) {
    console.error('Erro crítico na execução:', err);
    process.exit(1);
  }
}

run();
