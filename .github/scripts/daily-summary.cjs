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
    SUPABASE_SERVICE_ROLE_KEY,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Erro: Variáveis de ambiente obrigatórias (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) não configuradas.');
    process.exit(1);
  }

  console.log(`URL de Consulta Utilizada: ${SUPABASE_URL}/rest/v1/transactions?select=*`);
  console.log('Iniciando consulta ao Supabase com a Service Role Key (Bypass RLS)...');

  let transactions = [];

  try {
    // 1. Buscar transações do Supabase REST API usando a Service Role Key (Bypassa RLS com segurança no backend)
    const supabaseEndpoint = `${SUPABASE_URL}/rest/v1/transactions?select=*`;
    const supabaseOptions = {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Range': '0-9999'
      }
    };

    const response = await makeRequest(supabaseEndpoint, supabaseOptions);
    console.log(`[REST API] Código de Status HTTP: ${response.statusCode}`);
    
    if (Array.isArray(response.data)) {
      transactions = response.data;
      console.log(`[REST API] Sucesso! Quantidade de transações retornadas: ${transactions.length}`);
    } else {
      console.log(`[REST API] Resposta não é um array. Corpo retornado: ${JSON.stringify(response.data)}`);
    }

    if (transactions.length === 0) {
      throw new Error('A lista de transações retornada está vazia ou não pôde ser acessada.');
    }

    console.log(`Sucesso! Carregadas ${transactions.length} transações.`);

    // 2. Definir datas em Brasília (UTC-3)
    const now = new Date();
    const brtOffset = -3 * 60 * 60 * 1000;
    const brtDate = new Date(now.getTime() + brtOffset);

    const brtYear = brtDate.getUTCFullYear();
    const brtMonth = String(brtDate.getUTCMonth() + 1).padStart(2, '0');
    const brtDay = String(brtDate.getUTCDate()).padStart(2, '0');

    const currentMonthKey = `${brtYear}-${brtMonth}`; // 'YYYY-MM'
    const todayStr = `${brtYear}-${brtMonth}-${brtDay}`; // 'YYYY-MM-DD'

    let nextMonthYear = brtYear;
    let nextMonthNum = brtDate.getUTCMonth() + 2; // getUTCMonth is 0-indexed, so next month is +2
    if (nextMonthNum > 12) {
      nextMonthNum = 1;
      nextMonthYear += 1;
    }
    const nextMonthKey = `${nextMonthYear}-${String(nextMonthNum).padStart(2, '0')}`; // 'YYYY-MM'

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
    let telegramMessage = `💰 *FINANCEIRO DIEGO*\n\n`;
    telegramMessage += `📅 *Data:* ${brtDay}/${brtMonth}/${brtYear}\n\n`;

    for (let i = 0; i < userIds.length; i++) {
      const uId = userIds[i];
      const userTransactions = transactionsByUser[uId];

      if (userIds.length > 1) {
        telegramMessage += `👤 *Usuário: \`${escapeMarkdown(uId.slice(0, 8))}\`...*\n`;
      }

      // Cálculos do usuário
      let receitasMes = 0;
      let despesasMes = 0;
      let lancamentosMesCount = 0;

      let receitasProximoMes = 0;
      let despesasProximoMesVal = 0;
      let lancamentosProximoMesCount = 0;

      userTransactions.forEach(t => {
        const amt = Number(t.amount) || 0;
        const bDate = t.billing_date || t.date || '';

        // Current month filter
        if (bDate && bDate.startsWith(currentMonthKey)) {
          lancamentosMesCount++;
          if (t.type === 'income') {
            receitasMes += amt;
          } else if (t.type === 'expense' || t.type === 'payroll_deduction') {
            despesasMes += amt;
          }
        }

        // Next month filter
        if (bDate && bDate.startsWith(nextMonthKey)) {
          lancamentosProximoMesCount++;
          if (t.type === 'income') {
            receitasProximoMes += amt;
          } else if (t.type === 'expense' || t.type === 'payroll_deduction') {
            despesasProximoMesVal += amt;
          }
        }
      });

      const saldoMes = receitasMes - despesasMes;
      const saldoProximoMes = receitasProximoMes - despesasProximoMesVal;

      telegramMessage += `📈 *Mês atual (${currentMonthKey})*\n\n`;
      telegramMessage += `• *Receitas:* \`${formatBRL(receitasMes)}\`\n`;
      telegramMessage += `• *Despesas:* \`${formatBRL(despesasMes)}\`\n`;
      telegramMessage += `• *Saldo do mês:* \`${formatBRL(saldoMes)}\`\n\n`;

      telegramMessage += `📆 *Próximo mês (${nextMonthKey})*\n\n`;
      telegramMessage += `• *Total de receitas previstas:* \`${formatBRL(receitasProximoMes)}\`\n`;
      telegramMessage += `• *Total de despesas previstas:* \`${formatBRL(despesasProximoMesVal)}\`\n`;
      telegramMessage += `• *Saldo previsto:* \`${formatBRL(saldoProximoMes)}\`\n\n`;

      telegramMessage += `📊 *Quantidade de lançamentos do mês atual:* ${lancamentosMesCount}\n`;
      telegramMessage += `📊 *Quantidade de lançamentos do próximo mês:* ${lancamentosProximoMesCount}\n`;

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
