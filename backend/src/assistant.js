const ASSISTANT_TIMEZONE = process.env.ASSISTANT_TIMEZONE || "America/Sao_Paulo";
const DEFAULT_AGGREGATE_PERIOD_DAYS = Number(process.env.ASSISTANT_DEFAULT_PERIOD_DAYS || 30);
const CLARIFICATION_TTL_MS = 10 * 60 * 1000;
const MAX_LIST_ROWS = 20;
const MAX_CLARIFICATION_OPTIONS = 5;

const TOOL_TO_DOMAIN = {
  count_orders: "pedidos",
  sum_order_revenue: "vendas",
  get_max_order: "pedidos",
  get_orders_by_status: "pedidos",
  sum_store_sales: "vendas",
  sum_total_sales: "vendas",
  count_total_sales: "vendas",
  sum_employee_payments: "funcionarios",
  list_employee_payments: "funcionarios",
  sum_expenses: "financeiro",
  group_expenses_by_category: "financeiro",
  get_top_clients: "clientes",
  get_client_order_summary: "clientes",
};

const SUPPORTED_TOOLS = new Set(Object.keys(TOOL_TO_DOMAIN));

const TOOL_DEFAULT_PERIOD = {
  count_orders: "last_30_days",
  sum_order_revenue: "last_30_days",
  get_orders_by_status: "last_30_days",
  sum_store_sales: "last_30_days",
  sum_total_sales: "last_30_days",
  count_total_sales: "last_30_days",
  sum_employee_payments: "last_30_days",
  sum_expenses: "last_30_days",
  group_expenses_by_category: "last_30_days",
  get_top_clients: "last_30_days",
  get_max_order: "all_time",
  list_employee_payments: "all_time",
  get_client_order_summary: "all_time",
};

const STATUS_ALIASES = [
  { value: 5, labels: ["concluido", "concluidos", "concluida", "concluidas", "finalizado", "finalizados"] },
  { value: 4, labels: ["entrega", "em entrega", "saiu para entrega"] },
  { value: 3, labels: ["pronto", "prontos", "pronta", "prontas"] },
  { value: 2, labels: ["preparo", "preparacao", "preparação", "em preparo", "em preparacao"] },
  { value: 1, labels: ["confirmado", "confirmados", "confirmada", "confirmadas", "aceito", "aceitos"] },
  { value: 0, labels: ["recebido", "recebidos", "recebida", "recebidas", "aberto", "abertos", "pendente", "pendentes"] },
];

const PAYMENT_METHOD_ALIASES = [
  { value: "pix", labels: ["pix"] },
  { value: "cartao", labels: ["cartao", "cartão", "card", "credito", "crédito", "debito", "débito"] },
  { value: "dinheiro", labels: ["dinheiro", "cash"] },
];

const EXPENSE_CATEGORY_ALIASES = [
  { value: "carne", labels: ["carne", "compra de carne"] },
  { value: "limpeza", labels: ["limpeza", "material de limpeza"] },
  { value: "aluguel", labels: ["aluguel"] },
  { value: "outras", labels: ["outras", "outros", "diversas", "diversos"] },
];

const clarificationStore = new Map();

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clipText(value, maxLength = 500) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function parseNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundMoney(value) {
  return Number(parseNumber(value, 0).toFixed(2));
}

function formatMoney(value) {
  return Number(parseNumber(value, 0)).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDateShort(value, timeZone = ASSISTANT_TIMEZONE) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function normalizeFilterValue(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim();
}

function getTimeZoneParts(date, timeZone = ASSISTANT_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const values = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: values.weekday,
  };
}

function getWeekdayIndex(dateParts) {
  return new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 12, 0, 0)).getUTCDay();
}

function shiftDateParts(dateParts, days) {
  const shifted = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day + days, 12, 0, 0));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function toDateKey(dateParts) {
  return [
    String(dateParts.year).padStart(4, "0"),
    String(dateParts.month).padStart(2, "0"),
    String(dateParts.day).padStart(2, "0"),
  ].join("-");
}

function zonedDateTimeToUtc(dateParts, hour, minute, second, millisecond, timeZone = ASSISTANT_TIMEZONE) {
  const utcGuess = new Date(Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    hour,
    minute,
    second,
    millisecond,
  ));
  const actualParts = getTimeZoneParts(utcGuess, timeZone);
  const targetUtcMillis = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, hour, minute, second, millisecond);
  const actualUtcMillis = Date.UTC(
    actualParts.year,
    actualParts.month - 1,
    actualParts.day,
    actualParts.hour,
    actualParts.minute,
    actualParts.second,
    0,
  );
  const offsetDiff = targetUtcMillis - actualUtcMillis;
  return new Date(utcGuess.getTime() + offsetDiff);
}

function buildPeriodBounds(startDateParts, endDateParts, label) {
  const start = zonedDateTimeToUtc(startDateParts, 0, 0, 0, 0);
  const nextDay = shiftDateParts(endDateParts, 1);
  const end = new Date(zonedDateTimeToUtc(nextDay, 0, 0, 0, 0).getTime() - 1);
  return {
    label,
    start: start.toISOString(),
    end: end.toISOString(),
    startDate: toDateKey(startDateParts),
    endDate: toDateKey(endDateParts),
    timezone: ASSISTANT_TIMEZONE,
    allTime: false,
  };
}

function buildAllTimePeriod(label = "todo o historico disponivel") {
  return {
    label,
    start: null,
    end: null,
    startDate: null,
    endDate: null,
    timezone: ASSISTANT_TIMEZONE,
    allTime: true,
  };
}

function parseDateToken(token, now = new Date()) {
  const raw = String(token || "").trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    };
  }

  const brMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (brMatch) {
    const nowParts = getTimeZoneParts(now);
    let year = brMatch[3] ? Number(brMatch[3]) : nowParts.year;
    if (year < 100) year += 2000;
    return {
      year,
      month: Number(brMatch[2]),
      day: Number(brMatch[1]),
    };
  }

  return null;
}

function resolveExplicitPeriod(question, now = new Date()) {
  const rawQuestion = String(question || "");
  const betweenMatch = rawQuestion.match(/(?:entre|de)\s+(\d{1,4}[/-]\d{1,2}(?:[/-]\d{1,4})?)\s+(?:e|ate|até)\s+(\d{1,4}[/-]\d{1,2}(?:[/-]\d{1,4})?)/i);
  if (betweenMatch) {
    const start = parseDateToken(betweenMatch[1], now);
    const end = parseDateToken(betweenMatch[2], now);
    if (start && end) {
      return buildPeriodBounds(start, end, `${toDateKey(start)} ate ${toDateKey(end)}`);
    }
  }

  const tokenMatches = rawQuestion.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/g) || [];
  const parsedDates = tokenMatches
    .map((token) => parseDateToken(token, now))
    .filter(Boolean);

  if (parsedDates.length >= 2) {
    return buildPeriodBounds(parsedDates[0], parsedDates[1], `${toDateKey(parsedDates[0])} ate ${toDateKey(parsedDates[1])}`);
  }

  if (parsedDates.length === 1) {
    return buildPeriodBounds(parsedDates[0], parsedDates[0], `dia ${toDateKey(parsedDates[0])}`);
  }

  return null;
}

function resolveQuestionPeriod(question, normalizeSearchText, now = new Date()) {
  const explicit = resolveExplicitPeriod(question, now);
  if (explicit) return explicit;

  const normalized = normalizeSearchText(question);
  const todayParts = getTimeZoneParts(now);
  const today = { year: todayParts.year, month: todayParts.month, day: todayParts.day };
  const weekdayIndex = getWeekdayIndex(today);
  const mondayOffset = (weekdayIndex + 6) % 7;

  if (/\bhoje\b/.test(normalized)) {
    return buildPeriodBounds(today, today, "hoje");
  }

  if (/\bontem\b/.test(normalized)) {
    const yesterday = shiftDateParts(today, -1);
    return buildPeriodBounds(yesterday, yesterday, "ontem");
  }

  if (/(semana passada|ultima semana)/.test(normalized)) {
    const start = shiftDateParts(today, -mondayOffset - 7);
    const end = shiftDateParts(start, 6);
    return buildPeriodBounds(start, end, "semana passada");
  }

  if (/(esta semana|nessa semana|semana atual)/.test(normalized)) {
    const start = shiftDateParts(today, -mondayOffset);
    return buildPeriodBounds(start, today, "esta semana");
  }

  if (/(mes passado|ultimo mes)/.test(normalized)) {
    const monthStart = { year: today.year, month: today.month, day: 1 };
    const lastMonthEnd = shiftDateParts(monthStart, -1);
    const lastMonthStart = { year: lastMonthEnd.year, month: lastMonthEnd.month, day: 1 };
    return buildPeriodBounds(lastMonthStart, lastMonthEnd, "mes passado");
  }

  if (/(este mes|nesse mes|mes atual)/.test(normalized)) {
    const monthStart = { year: today.year, month: today.month, day: 1 };
    return buildPeriodBounds(monthStart, today, "este mes");
  }

  const lastDaysMatch = normalized.match(/ultim(?:o|a|os|as)\s+(\d{1,3})\s+dias?/);
  if (lastDaysMatch) {
    const days = Number(lastDaysMatch[1]);
    if (Number.isFinite(days) && days > 0) {
      const start = shiftDateParts(today, -(days - 1));
      return buildPeriodBounds(start, today, `ultimos ${days} dias`);
    }
  }

  return null;
}

function resolveDefaultPeriod(tool, now = new Date()) {
  const strategy = TOOL_DEFAULT_PERIOD[tool] || "last_30_days";
  const todayParts = getTimeZoneParts(now);
  const today = { year: todayParts.year, month: todayParts.month, day: todayParts.day };

  if (strategy === "all_time") {
    return buildAllTimePeriod();
  }

  const start = shiftDateParts(today, -(DEFAULT_AGGREGATE_PERIOD_DAYS - 1));
  return buildPeriodBounds(start, today, `ultimos ${DEFAULT_AGGREGATE_PERIOD_DAYS} dias`);
}

function findAliasValue(aliases, normalizedQuestion) {
  for (const entry of aliases) {
    if (entry.labels.some((label) => normalizedQuestion.includes(label))) {
      return entry.value;
    }
  }
  return null;
}

function extractQuotedEntity(question) {
  const match = String(question || "").match(/["“](.+?)["”]/);
  return match ? clipText(match[1], 80) : null;
}

function trimEntityCandidate(value) {
  return clipText(
    String(value || "")
      .replace(/\b(hoje|ontem|esta semana|semana passada|este mes|mes passado|ultimos \d+ dias)\b/gi, "")
      .replace(/\b(em|no|na|nos|nas|entre|de|do|da|dos|das|com|por|para|durante)\b.*$/i, "")
      .replace(/[?.!,;:]+$/g, "")
      .trim(),
    80,
  );
}

function extractNamedEntity(question, kind) {
  const quoted = extractQuotedEntity(question);
  if (quoted) return quoted;

  const patterns = kind === "employee"
    ? [
        /funcion[aá]ri[oa]\s+([a-zA-ZÀ-ÿ0-9' -]{2,80})/i,
        /pagament[oa]s?\s+(?:de|do|da|para)\s+([a-zA-ZÀ-ÿ0-9' -]{2,80})/i,
        /pago\s+(?:a|ao|para)\s+([a-zA-ZÀ-ÿ0-9' -]{2,80})/i,
      ]
    : [
        /cliente\s+([a-zA-ZÀ-ÿ0-9' -]{2,80})/i,
        /compras?\s+(?:de|do|da)\s+([a-zA-ZÀ-ÿ0-9' -]{2,80})/i,
        /resumo\s+(?:de|do|da)\s+([a-zA-ZÀ-ÿ0-9' -]{2,80})/i,
      ];

  for (const pattern of patterns) {
    const match = String(question || "").match(pattern);
    if (match?.[1]) {
      const candidate = trimEntityCandidate(match[1]);
      if (candidate) return candidate;
    }
  }

  return null;
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;

  try {
    return JSON.parse(candidate);
  } catch {
    const match = candidate.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function classifyWithModel({ question, normalizeSearchText, callGeminiText }) {
  if (typeof callGeminiText !== "function") return null;

  const result = await callGeminiText({
    prompt: [
      "Classifique a pergunta do usuario em uma ferramenta administrativa read-only.",
      "Responda somente JSON valido, sem markdown.",
      'Campo "tool" permitido: "count_orders", "sum_order_revenue", "get_max_order", "get_orders_by_status", "sum_store_sales", "sum_total_sales", "count_total_sales", "sum_employee_payments", "list_employee_payments", "sum_expenses", "group_expenses_by_category", "get_top_clients", "get_client_order_summary", ou null.',
      'Campo "status" permitido: 0,1,2,3,4,5 ou null.',
      'Campo "payment_method" permitido: "pix", "cartao", "dinheiro", "vemo", "zelle" ou null.',
      'Campo "source" permitido: "delivery", "store" ou null.',
      'Campo "expense_category" permitido: "carne", "limpeza", "aluguel", "outras" ou null.',
      'Campos opcionais: "client_name", "employee_name".',
      "Nao invente dados nem SQL.",
      `Pergunta normalizada: ${normalizeSearchText(question)}`,
      `Pergunta original: ${question}`,
    ].join("\n"),
    temperature: 0,
    maxOutputTokens: 250,
  });

  const payload = extractJsonObject(result);
  if (!payload || typeof payload !== "object") return null;

  const tool = SUPPORTED_TOOLS.has(payload.tool) ? payload.tool : null;
  if (!tool) return null;

  return {
    tool,
    status: Number.isInteger(payload.status) ? payload.status : null,
    paymentMethod: normalizeFilterValue(payload.payment_method),
    source: normalizeFilterValue(payload.source),
    expenseCategory: normalizeFilterValue(payload.expense_category),
    clientName: normalizeFilterValue(payload.client_name),
    employeeName: normalizeFilterValue(payload.employee_name),
  };
}

function classifyHeuristically({ question, normalizeSearchText }) {
  const normalized = normalizeSearchText(question);
  const detectedPaymentMethod =
    normalized.includes("zelle")
      ? "zelle"
      : normalized.includes("vemo") || normalized.includes("veo")
        ? "vemo"
        : findAliasValue(PAYMENT_METHOD_ALIASES, normalized);
  const asksCount = /(quantos?|quantas?|qtd|quantidade|numero de|numero total|contagem|foram feitos|houve|tivemos)/.test(normalized);
  const asksRevenue = /(quanto vendeu|quanto vendemos|faturamento|receita|total vendido|valor vendido|quanto foi vendido)/.test(normalized);
  const asksList = /(listar|liste|mostre|mostrar|quais foram|quais sao|quais são)/.test(normalized);
  const asksMostExpensive = /(mais caro|maior valor|maior pedido)/.test(normalized);
  const asksTopClient = /(cliente que mais comprou|clientes que mais compraram|top clientes|ranking de clientes)/.test(normalized);
  const asksClientSummary = /(resumo de compras|historico de compras|hist[óo]rico de compras|compras do cliente)/.test(normalized);
  const asksStatus = /(status|pendentes|concluidos|confirmados|em preparo|prontos|entrega)/.test(normalized);
  const asksOrders = /(pedido|pedidos|orders)/.test(normalized);
  const asksStore = /(presencial|loja|balcao|caixa|store sales|store_sales)/.test(normalized);
  const asksDelivery = /(delivery|entrega|site|online)/.test(normalized);
  const asksSales = /(venda|vendas|vendeu|vendemos)/.test(normalized);
  const asksEmployeePayment = /(pagamento|pagamentos|folha|salario|salarios|funcionario|funcionarios)/.test(normalized);
  const asksExpense = /(despesa|despesas|gasto|gastos|categoria de despesa|financeiro)/.test(normalized);

  if (asksTopClient) return { tool: "get_top_clients" };
  if (asksClientSummary) return { tool: "get_client_order_summary", clientName: extractNamedEntity(question, "client") };
  if (asksMostExpensive && asksOrders) return { tool: "get_max_order" };

  if (asksEmployeePayment) {
    if (asksList) {
      return { tool: "list_employee_payments", employeeName: extractNamedEntity(question, "employee") };
    }
    return { tool: "sum_employee_payments", employeeName: extractNamedEntity(question, "employee") };
  }

  if (asksExpense) {
    if (/(por categoria|categorias|categoria)/.test(normalized)) {
      return { tool: "group_expenses_by_category", expenseCategory: findAliasValue(EXPENSE_CATEGORY_ALIASES, normalized) };
    }
    return { tool: "sum_expenses", expenseCategory: findAliasValue(EXPENSE_CATEGORY_ALIASES, normalized) };
  }

  if (asksOrders && asksStatus && !asksRevenue) {
    return { tool: asksCount ? "count_orders" : "get_orders_by_status", status: findAliasValue(STATUS_ALIASES, normalized) };
  }

  if (asksCount && asksOrders) {
    return {
      tool: "count_orders",
      status: findAliasValue(STATUS_ALIASES, normalized),
      paymentMethod: detectedPaymentMethod,
      source: asksStore ? "store" : asksDelivery ? "delivery" : null,
      clientName: extractNamedEntity(question, "client"),
    };
  }

  if (asksCount && asksSales) {
    if (asksStore && !asksDelivery) return { tool: "count_total_sales", source: "store" };
    if (asksDelivery && !asksStore) return { tool: "count_total_sales", source: "delivery" };
    return { tool: "count_total_sales" };
  }

  if (asksRevenue || asksSales) {
    if (asksStore && !asksDelivery) {
      return { tool: "sum_store_sales", paymentMethod: detectedPaymentMethod };
    }
    if (asksDelivery && !asksStore) {
      return {
        tool: "sum_order_revenue",
        paymentMethod: detectedPaymentMethod,
        source: "delivery",
        clientName: extractNamedEntity(question, "client"),
      };
    }
    if (asksOrders && !asksStore) {
      return {
        tool: "sum_order_revenue",
        paymentMethod: detectedPaymentMethod,
        status: findAliasValue(STATUS_ALIASES, normalized),
        clientName: extractNamedEntity(question, "client"),
      };
    }
    return { tool: "sum_total_sales", paymentMethod: detectedPaymentMethod };
  }

  return null;
}

async function planIntent({ question, normalizeSearchText, callGeminiText }) {
  try {
    const modelPlan = await classifyWithModel({ question, normalizeSearchText, callGeminiText });
    if (modelPlan?.tool) return modelPlan;
  } catch {
    // fallback heuristico
  }

  return classifyHeuristically({ question, normalizeSearchText });
}

function normalizePlannedFilters(plan, question, normalizeSearchText) {
  const normalizedQuestion = normalizeSearchText(question);
  const detectedPaymentMethod =
    normalizedQuestion.includes("zelle")
      ? "zelle"
      : normalizedQuestion.includes("vemo") || normalizedQuestion.includes("veo")
        ? "vemo"
        : findAliasValue(PAYMENT_METHOD_ALIASES, normalizedQuestion);
  return {
    tool: plan.tool,
    domain: TOOL_TO_DOMAIN[plan.tool] || "central",
    status: Number.isInteger(plan.status) ? plan.status : findAliasValue(STATUS_ALIASES, normalizedQuestion),
    paymentMethod: normalizeFilterValue(plan.paymentMethod || plan.payment_method || detectedPaymentMethod),
    source: normalizeFilterValue(plan.source || (normalizedQuestion.includes("delivery") ? "delivery" : normalizedQuestion.includes("loja") || normalizedQuestion.includes("presencial") ? "store" : null)),
    expenseCategory: normalizeFilterValue(plan.expenseCategory || plan.expense_category || findAliasValue(EXPENSE_CATEGORY_ALIASES, normalizedQuestion)),
    clientName: normalizeFilterValue(plan.clientName || plan.client_name || extractNamedEntity(question, "client")),
    employeeName: normalizeFilterValue(plan.employeeName || plan.employee_name || extractNamedEntity(question, "employee")),
  };
}

function applyPeriodToQuery(query, column, period) {
  if (period?.allTime) return query;
  if (period?.start) query = query.gte(column, period.start);
  if (period?.end) query = query.lte(column, period.end);
  return query;
}

function buildPeriodResponse(period) {
  return {
    label: period.label,
    startDate: period.startDate,
    endDate: period.endDate,
    timezone: period.timezone,
    allTime: Boolean(period.allTime),
  };
}

function buildAppliedFilters(filters, extras = []) {
  const chips = [];
  if (filters.period?.label) chips.push({ label: "Periodo", value: filters.period.label });
  if (filters.clientNameResolved) chips.push({ label: "Cliente", value: filters.clientNameResolved });
  if (filters.employeeNameResolved) chips.push({ label: "Funcionario", value: filters.employeeNameResolved });
  if (normalizeFilterValue(filters.paymentMethod)) chips.push({ label: "Pagamento", value: filters.paymentMethod });
  if (normalizeFilterValue(filters.source)) chips.push({ label: "Origem", value: filters.source === "store" ? "presencial" : "delivery" });
  if (filters.statusLabel) chips.push({ label: "Status", value: filters.statusLabel });
  if (normalizeFilterValue(filters.expenseCategory)) chips.push({ label: "Categoria", value: filters.expenseCategory });
  return [...chips, ...extras];
}

function getStatusLabel(status) {
  const match = STATUS_ALIASES.find((entry) => entry.value === Number(status));
  return match ? match.labels[0] : `status ${status}`;
}

function extractClientId(order) {
  return order?.cliente_id || order?.client_id || null;
}

function extractOrderCode(order) {
  const raw = order?.codigo_pedido || order?.numero_pedido || order?.codigo || order?.id;
  return raw ? `IMP${String(raw).replace(/^IMP/i, "")}` : null;
}

function getClarificationRecord(conversationId) {
  if (!conversationId) return null;
  const record = clarificationStore.get(conversationId) || null;
  if (!record) return null;
  if (record.expiresAt < Date.now()) {
    clarificationStore.delete(conversationId);
    return null;
  }
  return record;
}

function setClarificationRecord(conversationId, payload) {
  if (!conversationId) return;
  clarificationStore.set(conversationId, {
    ...payload,
    expiresAt: Date.now() + CLARIFICATION_TTL_MS,
  });
}

function clearClarificationRecord(conversationId) {
  if (!conversationId) return;
  clarificationStore.delete(conversationId);
}

async function resolveClientFilter({ supabase, clientName, filters, question, conversationId, confirmation }) {
  if (!clientName) return { filters };

  const activeConfirmation = confirmation?.type === "client" ? String(confirmation.selectedId || "") : null;
  let query = supabase.from("clients").select("id, nome, email, telefone");
  query = query.ilike("nome", `%${clientName}%`).limit(MAX_CLARIFICATION_OPTIONS);
  const { data, error } = await query;

  if (error) {
    throw new Error(`Erro ao buscar cliente: ${error.message}`);
  }

  const candidates = data || [];
  if (activeConfirmation) {
    const selected = candidates.find((candidate) => String(candidate.id) === activeConfirmation);
    if (selected) {
      return {
        filters: {
          ...filters,
          clientId: Number(selected.id),
          clientNameResolved: selected.nome,
        },
      };
    }
  }

  if (candidates.length === 0) {
    return {
      answer: {
        ok: true,
        mode: "answer",
        domain: "clientes",
        answer: `Nao encontrei cliente com nome parecido com "${clientName}".`,
        sources: [{ type: "table", label: "clients" }],
        applied_filters: buildAppliedFilters(filters),
        period: buildPeriodResponse(filters.period),
      },
    };
  }

  if (candidates.length === 1) {
    return {
      filters: {
        ...filters,
        clientId: Number(candidates[0].id),
        clientNameResolved: candidates[0].nome,
      },
    };
  }

  setClarificationRecord(conversationId, {
    type: "client",
    question,
    pendingFilters: filters,
    rawName: clientName,
    options: candidates.map((candidate) => ({
      id: String(candidate.id),
      label: candidate.nome,
      description: [candidate.email, candidate.telefone].filter(Boolean).join(" | ") || `ID ${candidate.id}`,
    })),
  });

  return {
    answer: {
      ok: true,
      mode: "clarification",
      domain: "clientes",
      clarification: `Encontrei ${candidates.length} clientes parecidos com "${clientName}". Escolha o cliente correto.`,
      options: candidates.map((candidate) => ({
        id: String(candidate.id),
        label: candidate.nome,
        description: [candidate.email, candidate.telefone].filter(Boolean).join(" | ") || `ID ${candidate.id}`,
      })),
      pending_intent: {
        type: "client",
        raw_name: clientName,
        tool: filters.tool,
      },
    },
  };
}

async function resolveEmployeeFilter({ supabase, employeeName, filters, question, conversationId, confirmation }) {
  if (!employeeName) return { filters };

  const activeConfirmation = confirmation?.type === "employee" ? String(confirmation.selectedId || "") : null;
  let query = supabase.from("employees").select("id, name, email, role_title, active");
  query = query.ilike("name", `%${employeeName}%`).limit(MAX_CLARIFICATION_OPTIONS);
  const { data, error } = await query;

  if (error) {
    throw new Error(`Erro ao buscar funcionario: ${error.message}`);
  }

  const candidates = data || [];
  if (activeConfirmation) {
    const selected = candidates.find((candidate) => String(candidate.id) === activeConfirmation);
    if (selected) {
      return {
        filters: {
          ...filters,
          employeeId: Number(selected.id),
          employeeNameResolved: selected.name,
        },
      };
    }
  }

  if (candidates.length === 0) {
    return {
      answer: {
        ok: true,
        mode: "answer",
        domain: "funcionarios",
        answer: `Nao encontrei funcionario com nome parecido com "${employeeName}".`,
        sources: [{ type: "table", label: "employees" }],
        applied_filters: buildAppliedFilters(filters),
        period: buildPeriodResponse(filters.period),
      },
    };
  }

  if (candidates.length === 1) {
    return {
      filters: {
        ...filters,
        employeeId: Number(candidates[0].id),
        employeeNameResolved: candidates[0].name,
      },
    };
  }

  setClarificationRecord(conversationId, {
    type: "employee",
    question,
    pendingFilters: filters,
    rawName: employeeName,
    options: candidates.map((candidate) => ({
      id: String(candidate.id),
      label: candidate.name,
      description: [candidate.role_title, candidate.email].filter(Boolean).join(" | ") || `ID ${candidate.id}`,
    })),
  });

  return {
    answer: {
      ok: true,
      mode: "clarification",
      domain: "funcionarios",
      clarification: `Encontrei ${candidates.length} funcionarios parecidos com "${employeeName}". Escolha o funcionario correto.`,
      options: candidates.map((candidate) => ({
        id: String(candidate.id),
        label: candidate.name,
        description: [candidate.role_title, candidate.email].filter(Boolean).join(" | ") || `ID ${candidate.id}`,
      })),
      pending_intent: {
        type: "employee",
        raw_name: employeeName,
        tool: filters.tool,
      },
    },
  };
}

async function resolveClarificationFlow({ conversationId, confirmation }) {
  const record = getClarificationRecord(conversationId);
  if (!record) {
    return {
      ok: true,
      mode: "answer",
      domain: "central",
      answer: "A confirmacao expirou. Reenvie a pergunta para continuar.",
      sources: [],
      applied_filters: [],
      period: buildPeriodResponse(buildAllTimePeriod()),
    };
  }

  if (!confirmation || !confirmation.type || !confirmation.selectedId || confirmation.type !== record.type) {
    return {
      ok: true,
      mode: "clarification",
      domain: TOOL_TO_DOMAIN[record.pendingFilters?.tool] || "central",
      clarification: "Escolha uma das opcoes abaixo para eu continuar.",
      options: record.options,
      pending_intent: {
        type: record.type,
        tool: record.pendingFilters?.tool || null,
      },
    };
  }

  return { record };
}

function applyOrderFilters(query, filters) {
  query = applyPeriodToQuery(query, "data_pedido", filters.period);
  if (filters.clientId) query = query.eq("cliente_id", filters.clientId);
  if (Number.isInteger(filters.status)) query = query.eq("status", filters.status);
  if (filters.paymentMethod) query = query.eq("payment_method", filters.paymentMethod);
  if (filters.source) query = query.eq("source", filters.source);
  return query;
}

function applyStoreSalesFilters(query, filters) {
  query = applyPeriodToQuery(query, "sale_datetime", filters.period);
  if (filters.paymentMethod) query = query.eq("payment_method", filters.paymentMethod);
  return query;
}

function applyExpensesFilters(query, filters) {
  if (!filters.period?.allTime) {
    if (filters.period?.startDate) query = query.gte("competency_date", filters.period.startDate);
    if (filters.period?.endDate) query = query.lte("competency_date", filters.period.endDate);
  }
  if (filters.expenseCategory) query = query.eq("category", filters.expenseCategory);
  return query;
}

function applyEmployeePaymentsFilters(query, filters) {
  query = applyPeriodToQuery(query, "paid_at", filters.period);
  if (filters.employeeId) query = query.eq("employee_id", filters.employeeId);
  return query;
}

async function fetchClientNamesMap(supabase, orders) {
  const clientIds = unique((orders || []).map((order) => extractClientId(order)).map((value) => Number(value)).filter(Boolean));
  if (!clientIds.length) return new Map();

  const { data, error } = await supabase.from("clients").select("id, nome").in("id", clientIds);
  if (error) return new Map();
  return new Map((data || []).map((client) => [Number(client.id), client.nome]));
}

async function executeTool({ supabase, tool, filters }) {
  if (tool === "count_orders") {
    const { count, error } = await applyOrderFilters(
      supabase.from("orders").select("*", { head: true, count: "exact" }),
      filters,
    );
    if (error) throw new Error(error.message);

    return {
      domain: "pedidos",
      answer: `Foram feitos ${Number(count || 0)} pedido(s) em ${filters.period.label}.`,
      sources: [{ type: "table", label: "orders.data_pedido" }],
      appliedFilters: buildAppliedFilters({
        ...filters,
        statusLabel: Number.isInteger(filters.status) ? getStatusLabel(filters.status) : null,
      }),
      toolsUsed: ["count_orders"],
    };
  }

  if (tool === "sum_order_revenue") {
    const { data, error } = await applyOrderFilters(
      supabase.from("orders").select("valor_total, status, data_pedido, payment_method, source"),
      filters,
    );
    if (error) throw new Error(error.message);

    const total = roundMoney((data || [])
      .filter((row) => Number(row.status) === 5)
      .reduce((sum, row) => sum + parseNumber(row.valor_total, 0), 0));

    return {
      domain: "vendas",
      answer: `O faturamento de pedidos/delivery em ${filters.period.label} foi ${formatMoney(total)}.`,
      sources: [
        { type: "table", label: "orders.valor_total" },
        { type: "table", label: "orders.status" },
      ],
      appliedFilters: buildAppliedFilters({
        ...filters,
        source: filters.source || "delivery",
        statusLabel: "concluido",
      }),
      toolsUsed: ["sum_order_revenue"],
    };
  }

  if (tool === "get_max_order") {
    const { data, error } = await applyOrderFilters(
      supabase.from("orders").select("*").order("valor_total", { ascending: false }).limit(10),
      filters,
    );
    if (error) throw new Error(error.message);

    const rows = data || [];
    const top = rows[0];
    if (!top) {
      return {
        domain: "pedidos",
        answer: `Nao encontrei pedidos no periodo ${filters.period.label}.`,
        sources: [{ type: "table", label: "orders" }],
        appliedFilters: buildAppliedFilters(filters),
        toolsUsed: ["get_max_order"],
      };
    }

    const clientNameMap = await fetchClientNamesMap(supabase, [top]);
    const clientName = clientNameMap.get(Number(extractClientId(top))) || "Cliente nao identificado";

    return {
      domain: "pedidos",
      answer: [
        `O pedido mais caro em ${filters.period.label} foi ${extractOrderCode(top) || `#${top.id}`}, no valor de ${formatMoney(top.valor_total)}.`,
        `Cliente: ${clientName}.`,
        `Data do pedido: ${formatDateShort(top.data_pedido) || "nao informada"}.`,
        `Status: ${getStatusLabel(top.status)}.`,
      ].join("\n"),
      sources: [
        { type: "table", label: "orders.valor_total" },
        { type: "table", label: "clients.nome" },
      ],
      appliedFilters: buildAppliedFilters(filters),
      toolsUsed: ["get_max_order"],
    };
  }

  if (tool === "get_orders_by_status") {
    const { data, error } = await applyOrderFilters(
      supabase.from("orders").select("status, data_pedido"),
      filters,
    );
    if (error) throw new Error(error.message);

    const totals = new Map();
    for (const row of data || []) {
      const key = Number(row.status);
      totals.set(key, (totals.get(key) || 0) + 1);
    }

    const lines = Array.from(totals.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([status, count]) => `- ${getStatusLabel(status)}: ${count}`);

    return {
      domain: "pedidos",
      answer: lines.length
        ? `Pedidos por status em ${filters.period.label}:\n${lines.join("\n")}`
        : `Nao encontrei pedidos no periodo ${filters.period.label}.`,
      sources: [{ type: "table", label: "orders.status" }],
      appliedFilters: buildAppliedFilters(filters),
      toolsUsed: ["get_orders_by_status"],
    };
  }

  if (tool === "sum_store_sales") {
    const { data, error } = await applyStoreSalesFilters(
      supabase.from("store_sales").select("total_amount, sale_datetime, payment_method"),
      filters,
    );
    if (error) throw new Error(error.message);

    const total = roundMoney((data || []).reduce((sum, row) => sum + parseNumber(row.total_amount, 0), 0));
    return {
      domain: "vendas",
      answer: `O faturamento presencial em ${filters.period.label} foi ${formatMoney(total)}.`,
      sources: [{ type: "table", label: "store_sales.total_amount" }],
      appliedFilters: buildAppliedFilters({ ...filters, source: "store" }),
      toolsUsed: ["sum_store_sales"],
    };
  }

  if (tool === "sum_total_sales") {
    const [{ data: orders, error: ordersError }, { data: storeSales, error: storeError }] = await Promise.all([
      applyOrderFilters(
        supabase.from("orders").select("valor_total, status, data_pedido, payment_method, source"),
        { ...filters, source: "delivery" },
      ),
      filters.clientId
        ? Promise.resolve({ data: [], error: null })
        : applyStoreSalesFilters(
            supabase.from("store_sales").select("total_amount, sale_datetime, payment_method"),
            filters,
          ),
    ]);

    if (ordersError) throw new Error(ordersError.message);
    if (storeError) throw new Error(storeError.message);

    const deliveryTotal = roundMoney((orders || [])
      .filter((row) => Number(row.status) === 5)
      .reduce((sum, row) => sum + parseNumber(row.valor_total, 0), 0));
    const storeTotal = roundMoney((storeSales || []).reduce((sum, row) => sum + parseNumber(row.total_amount, 0), 0));
    const total = roundMoney(deliveryTotal + storeTotal);

    return {
      domain: "vendas",
      answer: [
        `O faturamento total em ${filters.period.label} foi ${formatMoney(total)}.`,
        `Delivery: ${formatMoney(deliveryTotal)}.`,
        `Presencial: ${formatMoney(storeTotal)}.`,
      ].join("\n"),
      sources: [
        { type: "table", label: "orders.valor_total" },
        { type: "table", label: "store_sales.total_amount" },
      ],
      appliedFilters: buildAppliedFilters(filters),
      toolsUsed: ["sum_order_revenue", "sum_store_sales", "sum_total_sales"],
    };
  }

  if (tool === "count_total_sales") {
    const [{ count: ordersCount, error: ordersError }, { count: storeCount, error: storeError }] = await Promise.all([
      filters.source === "store"
        ? Promise.resolve({ count: 0, error: null })
        : applyOrderFilters(
            supabase.from("orders").select("*", { head: true, count: "exact" }),
            filters,
          ),
      filters.source === "delivery" || filters.clientId
        ? Promise.resolve({ count: 0, error: null })
        : applyStoreSalesFilters(
            supabase.from("store_sales").select("*", { head: true, count: "exact" }),
            filters,
          ),
    ]);

    if (ordersError) throw new Error(ordersError.message);
    if (storeError) throw new Error(storeError.message);

    const deliveryCount = Number(ordersCount || 0);
    const storeSaleCount = Number(storeCount || 0);
    const total = deliveryCount + storeSaleCount;
    const scopeLabel = filters.source === "delivery" ? "de delivery" : filters.source === "store" ? "presenciais" : "";

    return {
      domain: "vendas",
      answer: [
        `Foram registradas ${total} venda(s) ${scopeLabel} em ${filters.period.label}.`.replace(/\s+/g, " ").trim(),
        filters.source ? null : `Delivery/pedidos: ${deliveryCount}.`,
        filters.source ? null : `Presencial: ${storeSaleCount}.`,
      ].filter(Boolean).join("\n"),
      sources: [
        { type: "table", label: "orders.data_pedido" },
        { type: "table", label: "store_sales.sale_datetime" },
      ],
      appliedFilters: buildAppliedFilters(filters),
      toolsUsed: ["count_orders", "count_total_sales"],
    };
  }

  if (tool === "sum_employee_payments") {
    const { data, error } = await applyEmployeePaymentsFilters(
      supabase.from("employee_payments").select("amount, paid_at, employee_id"),
      filters,
    );
    if (error) throw new Error(error.message);

    const total = roundMoney((data || []).reduce((sum, row) => sum + parseNumber(row.amount, 0), 0));
    const employeeLabel = filters.employeeNameResolved || "funcionarios filtrados";

    return {
      domain: "funcionarios",
      answer: `O total pago para ${employeeLabel} em ${filters.period.label} foi ${formatMoney(total)}.`,
      sources: [{ type: "table", label: "employee_payments.amount" }],
      appliedFilters: buildAppliedFilters(filters),
      toolsUsed: ["sum_employee_payments"],
    };
  }

  if (tool === "list_employee_payments") {
    const { data, error } = await applyEmployeePaymentsFilters(
      supabase.from("employee_payments").select("*").order("paid_at", { ascending: false }).limit(MAX_LIST_ROWS),
      filters,
    );
    if (error) throw new Error(error.message);

    const rows = data || [];
    if (!rows.length) {
      return {
        domain: "funcionarios",
        answer: `Nao encontrei pagamentos para ${filters.employeeNameResolved || "o funcionario"} em ${filters.period.label}.`,
        sources: [{ type: "table", label: "employee_payments" }],
        appliedFilters: buildAppliedFilters(filters),
        toolsUsed: ["list_employee_payments"],
      };
    }

    const total = roundMoney(rows.reduce((sum, row) => sum + parseNumber(row.amount, 0), 0));
    const lines = rows.slice(0, 8).map((row) => `- ${formatDateShort(row.paid_at)}: ${formatMoney(row.amount)}`);

    return {
      domain: "funcionarios",
      answer: [
        `Encontrei ${rows.length} pagamento(s) para ${filters.employeeNameResolved || "o funcionario"} em ${filters.period.label}.`,
        `Total no periodo: ${formatMoney(total)}.`,
        "Lancamentos recentes:",
        ...lines,
      ].join("\n"),
      sources: [{ type: "table", label: "employee_payments.paid_at" }],
      appliedFilters: buildAppliedFilters(filters),
      toolsUsed: ["list_employee_payments"],
    };
  }

  if (tool === "sum_expenses") {
    const { data, error } = await applyExpensesFilters(
      supabase.from("expenses").select("amount, competency_date, category"),
      filters,
    );
    if (error) throw new Error(error.message);

    const total = roundMoney((data || []).reduce((sum, row) => sum + parseNumber(row.amount, 0), 0));
    return {
      domain: "financeiro",
      answer: `O total de despesas em ${filters.period.label} foi ${formatMoney(total)}.`,
      sources: [{ type: "table", label: "expenses.amount" }],
      appliedFilters: buildAppliedFilters(filters),
      toolsUsed: ["sum_expenses"],
    };
  }

  if (tool === "group_expenses_by_category") {
    const { data, error } = await applyExpensesFilters(
      supabase.from("expenses").select("category, amount, competency_date"),
      filters,
    );
    if (error) throw new Error(error.message);

    const totals = new Map();
    for (const row of data || []) {
      const category = row.category || "outras";
      totals.set(category, roundMoney((totals.get(category) || 0) + parseNumber(row.amount, 0)));
    }

    const lines = Array.from(totals.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([category, total]) => `- ${category}: ${formatMoney(total)}`);

    return {
      domain: "financeiro",
      answer: lines.length
        ? `Despesas por categoria em ${filters.period.label}:\n${lines.join("\n")}`
        : `Nao encontrei despesas no periodo ${filters.period.label}.`,
      sources: [{ type: "table", label: "expenses.category" }],
      appliedFilters: buildAppliedFilters(filters),
      toolsUsed: ["group_expenses_by_category"],
    };
  }

  if (tool === "get_top_clients") {
    const { data, error } = await applyOrderFilters(
      supabase.from("orders").select("cliente_id, valor_total, status, data_pedido"),
      filters,
    );
    if (error) throw new Error(error.message);

    const concluded = (data || []).filter((row) => Number(row.status) === 5 && extractClientId(row));
    const totals = new Map();
    for (const row of concluded) {
      const clientId = Number(extractClientId(row));
      if (!clientId) continue;
      const current = totals.get(clientId) || { total: 0, count: 0 };
      current.total = roundMoney(current.total + parseNumber(row.valor_total, 0));
      current.count += 1;
      totals.set(clientId, current);
    }

    const clientMap = await fetchClientNamesMap(supabase, concluded);
    const ranking = Array.from(totals.entries())
      .map(([clientId, summary]) => ({
        clientId,
        nome: clientMap.get(clientId) || `Cliente ${clientId}`,
        total: summary.total,
        count: summary.count,
      }))
      .sort((left, right) => right.total - left.total)
      .slice(0, 5);

    if (!ranking.length) {
      return {
        domain: "clientes",
        answer: `Nao encontrei compras concluidas em ${filters.period.label}.`,
        sources: [{ type: "table", label: "orders.valor_total" }],
        appliedFilters: buildAppliedFilters(filters),
        toolsUsed: ["get_top_clients"],
      };
    }

    const lines = ranking.map((row, index) => `${index + 1}. ${row.nome} - ${formatMoney(row.total)} em ${row.count} pedido(s)`);
    return {
      domain: "clientes",
      answer: `Top clientes em ${filters.period.label}:\n${lines.join("\n")}`,
      sources: [
        { type: "table", label: "orders.valor_total" },
        { type: "table", label: "clients.nome" },
      ],
      appliedFilters: buildAppliedFilters(filters),
      toolsUsed: ["get_top_clients"],
    };
  }

  throw new Error(`Ferramenta nao suportada: ${tool}`);
}

async function executeClientOrderSummary({ supabase, filters }) {
  const { data, error } = await applyOrderFilters(
    supabase.from("orders").select("*").order("data_pedido", { ascending: false }).limit(MAX_LIST_ROWS),
    filters,
  );
  if (error) throw new Error(error.message);

  const rows = data || [];
  if (!rows.length) {
    return {
      domain: "clientes",
      answer: `Nao encontrei pedidos para ${filters.clientNameResolved || "o cliente"} em ${filters.period.label}.`,
      sources: [{ type: "table", label: "orders" }],
      appliedFilters: buildAppliedFilters(filters),
      toolsUsed: ["get_client_order_summary"],
    };
  }

  const totalSpent = roundMoney(rows
    .filter((row) => Number(row.status) === 5)
    .reduce((sum, row) => sum + parseNumber(row.valor_total, 0), 0));

  const lastOrder = rows[0];
  const highestOrder = rows.slice().sort((left, right) => parseNumber(right.valor_total, 0) - parseNumber(left.valor_total, 0))[0];

  return {
    domain: "clientes",
    answer: [
      `Resumo de compras de ${filters.clientNameResolved || "cliente"} em ${filters.period.label}:`,
      `- Pedidos encontrados: ${rows.length}.`,
      `- Total gasto em pedidos concluidos: ${formatMoney(totalSpent)}.`,
      `- Ultimo pedido: ${formatDateShort(lastOrder.data_pedido) || "nao informado"}.`,
      `- Maior pedido: ${formatMoney(highestOrder.valor_total)}.`,
    ].join("\n"),
    sources: [
      { type: "table", label: "orders.valor_total" },
      { type: "table", label: "orders.data_pedido" },
    ],
    appliedFilters: buildAppliedFilters(filters),
    toolsUsed: ["get_client_order_summary"],
  };
}

function isMissingRelationError(error, relationName) {
  const message = String(error?.message || "");
  return message.includes(`Could not find the table '${relationName}'`) || message.includes(`relation "${relationName}" does not exist`);
}

async function persistAuditLog(supabase, entry) {
  const payload = {
    conversation_id: entry.conversationId || null,
    admin_auth_user_id: entry.actor?.authUserId || null,
    admin_profile_id: entry.actor?.profileId || null,
    admin_email: entry.actor?.email || null,
    question: entry.question || null,
    resolved_intent: entry.resolvedIntent || {},
    tools_used: entry.toolsUsed || [],
    status: entry.status || "answer",
    detail: entry.detail || {},
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("assistant_audit_logs").insert([payload]);
  if (error && !isMissingRelationError(error, "assistant_audit_logs")) {
    console.error("Falha ao registrar assistant_audit_logs", error.message);
  }
}

async function buildFallbackBusinessAnswer({ question, buildOperationalReport }) {
  if (typeof buildOperationalReport !== "function") {
    return "No momento eu cubro perguntas administrativas sobre pedidos, vendas, financeiro, funcionarios e clientes.";
  }

  const report = await buildOperationalReport({});
  return [
    `Nao consegui classificar a pergunta "${clipText(question, 120)}" com seguranca.`,
    "Posso responder melhor sobre pedidos, vendas, financeiro, funcionarios e clientes.",
    `Resumo atual: vendas totais ${formatMoney(report.summary?.total_sales || 0)}, pedidos ${report.summary?.orders_count || 0}, despesas ${formatMoney(report.summary?.expenses_total || 0)}.`,
  ].join("\n");
}

export function createAssistantService({
  supabase,
  normalizeSearchText,
  buildOperationalReport,
  callGeminiText,
}) {
  async function answerQuestion({ question, conversationId, confirmation, actor }) {
    const trimmedQuestion = String(question || "").trim();
    if (!trimmedQuestion) {
      throw new Error("question obrigatoria.");
    }

    let plannedFilters = null;
    let toolsUsed = [];

    try {
      if (confirmation?.selectedId) {
        const clarificationResolution = await resolveClarificationFlow({ conversationId, confirmation });
        if (clarificationResolution.record) {
          plannedFilters = {
            ...clarificationResolution.record.pendingFilters,
            tool: clarificationResolution.record.pendingFilters.tool,
          };
          if (clarificationResolution.record.type === "client") plannedFilters.clientName = clarificationResolution.record.rawName;
          if (clarificationResolution.record.type === "employee") plannedFilters.employeeName = clarificationResolution.record.rawName;
        } else {
          await persistAuditLog(supabase, {
            conversationId,
            actor,
            question: trimmedQuestion,
            status: clarificationResolution.mode || "answer",
            resolvedIntent: {},
            detail: clarificationResolution,
          });
          return clarificationResolution;
        }
      }

      if (!plannedFilters) {
        const rawPlan = await planIntent({
          question: trimmedQuestion,
          normalizeSearchText,
          callGeminiText,
        });

        if (!rawPlan?.tool) {
          const fallbackAnswer = await buildFallbackBusinessAnswer({
            question: trimmedQuestion,
            buildOperationalReport,
          });

          const payload = {
            ok: true,
            mode: "answer",
            domain: "central",
            answer: fallbackAnswer,
            sources: [],
            applied_filters: [],
            period: buildPeriodResponse(buildAllTimePeriod()),
            conversationId,
          };

          await persistAuditLog(supabase, {
            conversationId,
            actor,
            question: trimmedQuestion,
            status: "answer",
            resolvedIntent: { tool: null, domain: "central" },
            detail: payload,
          });

          return payload;
        }

        plannedFilters = normalizePlannedFilters(rawPlan, trimmedQuestion, normalizeSearchText);
        plannedFilters.tool = rawPlan.tool;
      }

      const explicitPeriod = resolveQuestionPeriod(trimmedQuestion, normalizeSearchText);
      plannedFilters.period = explicitPeriod || resolveDefaultPeriod(plannedFilters.tool);
      plannedFilters.defaultedPeriod = !explicitPeriod;

      if (plannedFilters.tool === "get_client_order_summary" && !plannedFilters.clientName) {
        const payload = {
          ok: true,
          mode: "answer",
          domain: "clientes",
          answer: "Para montar o resumo de compras, informe o nome do cliente.",
          sources: [{ type: "table", label: "clients.nome" }],
          applied_filters: buildAppliedFilters(plannedFilters),
          period: buildPeriodResponse(plannedFilters.period),
          conversationId,
        };

        await persistAuditLog(supabase, {
          conversationId,
          actor,
          question: trimmedQuestion,
          status: "answer",
          resolvedIntent: { tool: plannedFilters.tool, domain: plannedFilters.domain },
          detail: payload,
        });

        return payload;
      }

      const clientResolution = await resolveClientFilter({
        supabase,
        clientName: plannedFilters.clientName,
        filters: plannedFilters,
        question: trimmedQuestion,
        conversationId,
        confirmation,
      });

      if (clientResolution.answer) {
        await persistAuditLog(supabase, {
          conversationId,
          actor,
          question: trimmedQuestion,
          status: clientResolution.answer.mode,
          resolvedIntent: { tool: plannedFilters.tool, domain: plannedFilters.domain, clientName: plannedFilters.clientName },
          detail: clientResolution.answer,
        });
        return {
          ...clientResolution.answer,
          conversationId,
        };
      }
      plannedFilters = clientResolution.filters;

      const employeeResolution = await resolveEmployeeFilter({
        supabase,
        employeeName: plannedFilters.employeeName,
        filters: plannedFilters,
        question: trimmedQuestion,
        conversationId,
        confirmation,
      });

      if (employeeResolution.answer) {
        await persistAuditLog(supabase, {
          conversationId,
          actor,
          question: trimmedQuestion,
          status: employeeResolution.answer.mode,
          resolvedIntent: { tool: plannedFilters.tool, domain: plannedFilters.domain, employeeName: plannedFilters.employeeName },
          detail: employeeResolution.answer,
        });
        return {
          ...employeeResolution.answer,
          conversationId,
        };
      }
      plannedFilters = employeeResolution.filters;

      let execution;
      if (plannedFilters.tool === "get_client_order_summary") {
        execution = await executeClientOrderSummary({ supabase, filters: plannedFilters });
      } else {
        execution = await executeTool({ supabase, tool: plannedFilters.tool, filters: plannedFilters });
      }

      toolsUsed = execution.toolsUsed || [plannedFilters.tool];
      clearClarificationRecord(conversationId);

      const payload = {
        ok: true,
        mode: "answer",
        domain: execution.domain,
        answer: execution.answer,
        sources: execution.sources,
        applied_filters: execution.appliedFilters,
        period: buildPeriodResponse(plannedFilters.period),
        conversationId,
      };

      await persistAuditLog(supabase, {
        conversationId,
        actor,
        question: trimmedQuestion,
        status: "answer",
        resolvedIntent: {
          tool: plannedFilters.tool,
          domain: plannedFilters.domain,
          filters: plannedFilters,
        },
        toolsUsed,
        detail: { period: payload.period, applied_filters: payload.applied_filters },
      });

      return payload;
    } catch (error) {
      await persistAuditLog(supabase, {
        conversationId,
        actor,
        question: trimmedQuestion,
        status: "error",
        resolvedIntent: plannedFilters ? { tool: plannedFilters.tool, domain: plannedFilters.domain } : {},
        toolsUsed,
        detail: { message: error?.message || "Erro interno no assistente." },
      });
      throw error;
    }
  }

  return {
    answerQuestion,
  };
}
