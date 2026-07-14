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
  let categories = [];
  let monthlyBudgets = [];

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

    // 1b. Buscar categorias do Supabase REST API usando a Service Role Key
    const categoriesEndpoint = `${SUPABASE_URL}/rest/v1/categories?select=*`;
    const categoriesOptions = {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Range': '0-9999'
      }
    };
    try {
      const catResponse = await makeRequest(categoriesEndpoint, categoriesOptions);
      if (Array.isArray(catResponse.data)) {
        categories = catResponse.data;
        console.log(`[REST API] Carregadas ${categories.length} categorias.`);
      }
    } catch (e) {
      console.warn(`[REST API] Erro ao carregar categorias: ${e.message}`);
    }

    // 1c. Buscar monthly_budgets do Supabase REST API usando a Service Role Key
    const budgetsEndpoint = `${SUPABASE_URL}/rest/v1/monthly_budgets?select=*`;
    const budgetsOptions = {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Range': '0-9999'
      }
    };
    try {
      const budgetResponse = await makeRequest(budgetsEndpoint, budgetsOptions);
      if (Array.isArray(budgetResponse.data)) {
        monthlyBudgets = budgetResponse.data;
        console.log(`[REST API] Carregados ${monthlyBudgets.length} orçamentos mensais.`);
      }
    } catch (e) {
      console.warn(`[REST API] Erro ao carregar orçamentos mensais: ${e.message}`);
    }

    console.log(`Sucesso! Dados carregados: ${transactions.length} transações, ${categories.length} categorias, ${monthlyBudgets.length} orçamentos.`);

    // 2. Definir datas em Brasília (UTC-3)
    const now = new Date();
    const brtOffset = -3 * 60 * 60 * 1000;
    const brtDate = new Date(now.getTime() + brtOffset);

    const brtYear = brtDate.getUTCFullYear();
    const brtMonth = String(brtDate.getUTCMonth() + 1).padStart(2, '0');
    const brtDay = String(brtDate.getUTCDate()).padStart(2, '0');

    const todayStr = `${brtYear}-${brtMonth}-${brtDay}`; // 'YYYY-MM-DD'

    // De acordo com a regra do App.tsx (linha 34), currentDate inicia no mês seguinte por padrão.
    // Adicionamos 1 mês para encontrar o mês de referência padrão do sistema.
    const refDate = new Date(brtDate);
    refDate.setUTCMonth(refDate.getUTCMonth() + 1);

    const refYear = refDate.getUTCFullYear();
    const refMonth = String(refDate.getUTCMonth() + 1).padStart(2, '0');
    const refMonthKey = `${refYear}-${refMonth}`; // 'YYYY-MM'

    const monthsPt = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    const refMonthName = `${monthsPt[refDate.getUTCMonth()]} de ${refYear}`;

    // Normalização matemática de valores decimais
    const normalizeCurrency = (value) => {
      return Math.round((value + Number.EPSILON) * 100) / 100;
    };

    // Formatter de Moeda BRL idêntico ao utilitário do sistema
    const formatBRL = (val) => {
      try {
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(normalizeCurrency(val));
      } catch (e) {
        const fixed = Number(normalizeCurrency(val)).toFixed(2);
        const parts = fixed.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return `R$ ${parts.join(',')}`;
      }
    };

    // Mapear transações exatamente como o App.tsx trata no carregamento
    const mappedTransactions = transactions.map(t => {
      const amountParsed = parseFloat(t.amount) || 0;
      const bDate = t.billing_date || t.date || todayStr;
      return {
        id: t.id,
        groupId: t.group_id,
        description: t.description || 'SEM DESCRIÇÃO',
        amount: amountParsed,
        type: t.type,
        category: t.category || 'OUTROS',
        date: t.date || todayStr,
        billingDate: bDate,
        recurrenceType: t.recurrence_type || 'single',
        installmentCurrent: t.installment_current,
        installmentTotal: t.installment_total,
        isCreditCard: !!t.is_credit_card,
        user_id: t.user_id || 'default'
      };
    });

    // Agrupar transações mapeadas por usuário
    const transactionsByUser = {};
    mappedTransactions.forEach(t => {
      const uId = t.user_id;
      if (!transactionsByUser[uId]) {
        transactionsByUser[uId] = [];
      }
      transactionsByUser[uId].push(t);
    });

    const userIds = Object.keys(transactionsByUser);
    console.log(`Encontrados ${userIds.length} usuário(s) nas transações.`);

    // Criar mensagem consolidada
    let telegramMessage = `💰 *FINANCEIRO DIEGO*\n\n`;

    for (let i = 0; i < userIds.length; i++) {
      const uId = userIds[i];
      const userTransactions = transactionsByUser[uId];

      if (userIds.length > 1) {
        telegramMessage += `👤 *Usuário: \`${escapeMarkdown(uId.slice(0, 8))}\`...*\n`;
      }

      // Filtrar as transações do mês de referência (que começam com refMonthKey)
      const userMonthTransactions = userTransactions.filter(t => t.billingDate.startsWith(refMonthKey));

      // 1. Calcular Receitas Reais + Descontos em Folha (Receita Bruta)
      const incomes = userMonthTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => normalizeCurrency(sum + t.amount), 0);

      const payrollDeductions = userMonthTransactions
        .filter(t => t.type === 'payroll_deduction')
        .reduce((sum, t) => normalizeCurrency(sum + t.amount), 0);

      const grossIncome = normalizeCurrency(incomes + payrollDeductions);

      // 2. Calcular Total apenas em Cartão de Crédito para visualização
      const creditCardTotal = userMonthTransactions
        .filter(t => t.type === 'expense' && t.isCreditCard === true)
        .reduce((sum, t) => normalizeCurrency(sum + t.amount), 0);

      // 3. Mapear gastos reais por categoria (incluindo descontos em folha)
      const expensesMap = userMonthTransactions
        .filter(t => t.type === 'expense' || t.type === 'payroll_deduction')
        .reduce((acc, t) => {
          acc[t.category] = normalizeCurrency((acc[t.category] || 0) + t.amount);
          return acc;
        }, {});

      // 4. ALGORITMO DE COMPROMETIMENTO (REGRA DE NEGÓCIO CRUCIAL DO SISTEMA)
      // O comprometimento é a soma do maior valor entre (Meta) e (Gasto Real) para cada categoria.
      let committedExpense = 0;
      const processedCategories = new Set();

      const userCategories = categories.filter(cat => cat.user_id === uId || (!cat.user_id && uId === 'default'));
      const userBudgets = monthlyBudgets.filter(mb => mb.user_id === uId || (!mb.user_id && uId === 'default'));

      userCategories.forEach(cat => {
        const specificBudget = userBudgets.find(mb => mb.category_id === cat.id && mb.month_year === refMonthKey);
        const budgetRaw = specificBudget ? specificBudget.amount : cat.budget;
        const budget = normalizeCurrency(parseFloat(budgetRaw) || 0);
        const actual = normalizeCurrency(expensesMap[cat.name] || 0);
        
        committedExpense = normalizeCurrency(committedExpense + Math.max(budget, actual));
        processedCategories.add(cat.name);
      });

      // Adicionar categorias "avulsas" que não estão no cadastro oficial mas têm lançamentos reais
      Object.keys(expensesMap).forEach(catName => {
        if (!processedCategories.has(catName)) {
          committedExpense = normalizeCurrency(committedExpense + expensesMap[catName]);
        }
      });

      const balance = normalizeCurrency(grossIncome - committedExpense);

      telegramMessage += `📅 *Mês de referência:* ${refMonthName}\n\n`;
      telegramMessage += `📈 *Receita Bruta:* \`${formatBRL(grossIncome)}\` _(incluindo desconto em folha)_\n`;
      telegramMessage += `📉 *Total Comprometido:* \`${formatBRL(committedExpense)}\` _(meta ou real)_\n`;
      telegramMessage += `💳 *Total comprometido em cartão:* \`${formatBRL(creditCardTotal)}\`\n`;
      telegramMessage += `💰 *Saldo Livre:* \`${formatBRL(balance)}\`\n\n`;
      telegramMessage += `📊 *Quantidade total de lançamentos do mês:* ${userMonthTransactions.length}\n`;

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
