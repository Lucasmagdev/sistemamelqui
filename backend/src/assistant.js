import fs from "node:fs/promises";
import path from "node:path";

const INDEXABLE_EXTENSIONS = new Set([".js", ".ts", ".tsx", ".sql", ".md", ".json"]);
const INDEXABLE_PATHS = [
  "src",
  "backend/src",
  "banco de dados",
  "README.md",
  "DOCUMENTACAO_ATUAL.md",
  "CHECKLIST_GO_LIVE.md",
  "TUTORIAL_ZAPI_BACKEND.md",
];
const INDEX_CACHE_TTL_MS = 60 * 1000;
const CHUNK_SIZE_LINES = 40;
const CHUNK_OVERLAP_LINES = 8;
const MAX_FILE_SIZE_BYTES = 350 * 1024;
const MAX_SNIPPET_CHARS = 1200;
const STOPWORDS = new Set([
  "a",
  "o",
  "os",
  "as",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "para",
  "por",
  "com",
  "sem",
  "na",
  "no",
  "nas",
  "nos",
  "uma",
  "um",
  "umas",
  "uns",
  "que",
  "como",
  "quais",
  "qual",
  "quais",
  "onde",
  "quando",
  "sobre",
  "tudo",
  "isso",
  "essa",
  "esse",
  "meu",
  "minha",
  "meus",
  "minhas",
  "pra",
  "pro",
  "sao",
  "ser",
  "ter",
  "tem",
  "mais",
  "menos",
  "dos",
  "das",
  "the",
  "and",
  "for",
  "with",
]);

const TABLE_CONFIG = {
  orders: {
    aliases: ["orders", "order", "pedido", "pedidos"],
    orderColumn: "data_pedido",
  },
  order_items: {
    aliases: ["order_items", "item pedido", "itens do pedido", "itens pedido"],
    orderColumn: "id",
  },
  clients: {
    aliases: ["clients", "client", "cliente", "clientes"],
    orderColumn: "id",
  },
  products: {
    aliases: ["products", "product", "produto", "produtos", "item", "itens"],
    orderColumn: "id",
  },
  batches: {
    aliases: ["batches", "batch", "lote", "lotes"],
    orderColumn: "id",
  },
  store_sales: {
    aliases: ["store_sales", "venda presencial", "vendas presenciais", "venda loja", "loja"],
    orderColumn: "sale_datetime",
  },
  expenses: {
    aliases: ["expenses", "expense", "despesa", "despesas", "gasto", "gastos"],
    orderColumn: "posted_at",
  },
  employees: {
    aliases: ["employees", "employee", "funcionario", "funcionarios", "colaborador", "colaboradores"],
    orderColumn: "id",
  },
  employee_payments: {
    aliases: ["employee_payments", "pagamento funcionario", "pagamentos funcionarios", "folha", "salario", "salarios"],
    orderColumn: "paid_at",
  },
  users: {
    aliases: ["users", "user", "usuario", "usuarios"],
    orderColumn: "id",
  },
  stock_entries: {
    aliases: ["stock_entries", "entrada estoque", "entradas estoque"],
    orderColumn: "created_at",
  },
  stock_movements: {
    aliases: ["stock_movements", "movimento estoque", "movimentos estoque"],
    orderColumn: "created_at",
  },
  invoices: {
    aliases: ["invoices", "invoice", "nota", "nota fiscal", "notas"],
    orderColumn: "created_at",
  },
};

const DOMAIN_TABLES = {
  pedidos: ["orders", "order_items", "clients"],
  vendas: ["orders", "store_sales", "products"],
  estoque: ["products", "batches", "stock_entries", "stock_movements"],
  financeiro: ["expenses", "store_sales", "orders"],
  funcionarios: ["employees", "employee_payments"],
};

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clipText(value, maxLength = MAX_SNIPPET_CHARS) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function sanitizeValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length > 220) return `${value.slice(0, 217)}...`;
    if (value.startsWith("data:")) return "[data-url removida]";
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (depth >= 2) return `[${value.length} itens]`;
    return value.slice(0, 5).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    if (depth >= 2) return "[objeto]";
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 12)
        .map(([key, current]) => [key, sanitizeValue(current, depth + 1)]),
    );
  }
  return String(value);
}

function buildTokens(normalizeSearchText, text) {
  const normalized = normalizeSearchText(text);
  return unique(
    normalized
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !STOPWORDS.has(token)),
  );
}

function scoreTextMatch(normalizedText, tokens, fullQuestion) {
  let score = 0;

  for (const token of tokens) {
    if (!normalizedText.includes(token)) continue;
    score += token.length >= 6 ? 6 : token.length >= 4 ? 4 : 2;
  }

  if (fullQuestion && normalizedText.includes(fullQuestion)) score += 10;
  return score;
}

async function collectFiles(repoRoot) {
  const files = [];
  const queue = [...INDEXABLE_PATHS];

  while (queue.length > 0) {
    const relativePath = queue.shift();
    const absolutePath = path.join(repoRoot, relativePath);

    let stats;
    try {
      stats = await fs.stat(absolutePath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });
      for (const entry of entries) {
        if ([".git", "node_modules", "dist"].includes(entry.name)) continue;
        queue.push(path.join(relativePath, entry.name));
      }
      continue;
    }

    const extension = path.extname(relativePath).toLowerCase();
    if (!INDEXABLE_EXTENSIONS.has(extension)) continue;
    if (stats.size > MAX_FILE_SIZE_BYTES) continue;
    files.push(relativePath);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function chunkContent({ relativePath, content }) {
  const lines = String(content || "").split(/\r?\n/);
  const kind = relativePath.endsWith(".sql")
    ? "schema"
    : relativePath.endsWith(".md")
      ? "doc"
      : "code";
  const chunks = [];

  for (let start = 0; start < lines.length; start += CHUNK_SIZE_LINES - CHUNK_OVERLAP_LINES) {
    const end = Math.min(lines.length, start + CHUNK_SIZE_LINES);
    const slice = lines.slice(start, end).join("\n").trim();
    if (!slice) continue;
    chunks.push({
      kind,
      relativePath,
      startLine: start + 1,
      endLine: end,
      content: clipText(slice, 1600),
    });
    if (end >= lines.length) break;
  }

  return chunks;
}

function getSchemaEntry(schemaMap, tableName) {
  const normalizedName = String(tableName || "")
    .trim()
    .replace(/"/g, "")
    .split(".")
    .pop()
    .toLowerCase();
  if (!normalizedName) return null;

  if (!schemaMap.has(normalizedName)) {
    schemaMap.set(normalizedName, {
      table: normalizedName,
      columns: new Set(),
      sources: new Set(),
    });
  }

  return schemaMap.get(normalizedName);
}

function parseSqlSchema(relativePath, content, schemaMap) {
  const createRegex = /create\s+table(?:\s+if\s+not\s+exists)?\s+("?[\w.]+"?)\s*\(([\s\S]*?)\);/gi;
  const alterRegex = /alter\s+table(?:\s+if\s+exists)?\s+("?[\w.]+"?)\s+add\s+column(?:\s+if\s+not\s+exists)?\s+"?([a-zA-Z_][\w]*)"?/gi;

  for (const match of content.matchAll(createRegex)) {
    const entry = getSchemaEntry(schemaMap, match[1]);
    if (!entry) continue;

    entry.sources.add(relativePath);

    const body = String(match[2] || "");
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.replace(/--.*$/, "").trim().replace(/,$/, "");
      if (!line) continue;
      if (/^(constraint|primary|foreign|unique|check|index)\b/i.test(line)) continue;
      const columnMatch = line.match(/^"?(?<column>[a-zA-Z_][\w]*)"?\s+/);
      if (columnMatch?.groups?.column) {
        entry.columns.add(columnMatch.groups.column);
      }
    }
  }

  for (const match of content.matchAll(alterRegex)) {
    const entry = getSchemaEntry(schemaMap, match[1]);
    if (!entry) continue;
    entry.sources.add(relativePath);
    entry.columns.add(match[2]);
  }
}

async function buildKnowledgeBase({ repoRoot, normalizeSearchText }) {
  const relativePaths = await collectFiles(repoRoot);
  const chunks = [];
  const schemaMap = new Map();

  for (const relativePath of relativePaths) {
    const absolutePath = path.join(repoRoot, relativePath);
    let content = "";

    try {
      content = await fs.readFile(absolutePath, "utf8");
    } catch {
      continue;
    }

    chunks.push(
      ...chunkContent({ relativePath, content }).map((chunk) => ({
        ...chunk,
        normalizedContent: normalizeSearchText(chunk.content),
      })),
    );

    if (relativePath.endsWith(".sql")) {
      parseSqlSchema(relativePath, content, schemaMap);
    }
  }

  const schemaTables = Array.from(schemaMap.values())
    .map((entry) => ({
      table: entry.table,
      columns: Array.from(entry.columns).sort((left, right) => left.localeCompare(right)),
      sources: Array.from(entry.sources).sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.table.localeCompare(right.table));

  return {
    indexedAt: Date.now(),
    chunks,
    schemaTables,
  };
}

function searchChunks({ chunks, normalizeSearchText, question, kind, limit = 4 }) {
  const normalizedQuestion = normalizeSearchText(question);
  const tokens = buildTokens(normalizeSearchText, question);

  return chunks
    .filter((chunk) => !kind || chunk.kind === kind)
    .map((chunk) => ({
      ...chunk,
      score: scoreTextMatch(chunk.normalizedContent, tokens, normalizedQuestion),
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((chunk) => ({
      relativePath: chunk.relativePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      kind: chunk.kind,
      content: chunk.content,
      score: chunk.score,
    }));
}

function detectRelevantTables({ question, domain, schemaTables, normalizeSearchText }) {
  const normalizedQuestion = normalizeSearchText(question);
  const detected = [];

  for (const [tableName, config] of Object.entries(TABLE_CONFIG)) {
    if (normalizedQuestion.includes(tableName.replace(/_/g, " "))) {
      detected.push(tableName);
      continue;
    }

    if ((config.aliases || []).some((alias) => normalizedQuestion.includes(normalizeSearchText(alias)))) {
      detected.push(tableName);
    }
  }

  for (const domainTable of DOMAIN_TABLES[domain] || []) {
    detected.push(domainTable);
  }

  const existingTables = new Set(schemaTables.map((item) => item.table));
  return unique(detected).filter((tableName) => existingTables.has(tableName) || TABLE_CONFIG[tableName]).slice(0, 4);
}

async function fetchTablePreview(supabase, tableName) {
  const config = TABLE_CONFIG[tableName] || {};
  let query = supabase.from(tableName).select("*").limit(5);
  if (config.orderColumn) {
    query = query.order(config.orderColumn, { ascending: false });
  }

  const [{ data, error }, countResult] = await Promise.all([
    query,
    supabase.from(tableName).select("*", { head: true, count: "exact" }),
  ]);

  if (error) {
    return {
      table: tableName,
      error: error.message,
      totalRows: countResult.error ? null : countResult.count ?? null,
      rows: [],
    };
  }

  return {
    table: tableName,
    totalRows: countResult.error ? null : countResult.count ?? null,
    rows: (data || []).map((row) => sanitizeValue(row)),
    error: null,
  };
}

function formatJsonBlock(value) {
  return clipText(JSON.stringify(value, null, 2), 2200);
}

function buildContextSummary({ codeMatches, docMatches, schemaSummaries, tablePreviews }) {
  return {
    code_matches: codeMatches.map((item) => ({
      file: item.relativePath,
      lines: `${item.startLine}-${item.endLine}`,
    })),
    doc_matches: docMatches.map((item) => ({
      file: item.relativePath,
      lines: `${item.startLine}-${item.endLine}`,
    })),
    schema_tables: schemaSummaries.map((item) => item.table),
    live_tables: tablePreviews.map((item) => item.table),
  };
}

function buildPrompt({
  question,
  domain,
  report,
  codeMatches,
  docMatches,
  schemaSummaries,
  tablePreviews,
}) {
  const sections = [
    "Voce e um assistente tecnico read-only do Imperial Flow Gold.",
    "Responda em portugues do Brasil.",
    "Nao invente dados, nao proponha UPDATE/DELETE/INSERT automatico e deixe claro quando algo foi inferido.",
    `Dominio principal detectado: ${domain}.`,
    "Se a pergunta envolver codigo, cite arquivo e linha.",
    "Se envolver banco, cite tabela e colunas relevantes.",
    "Se a informacao nao estiver suficiente, diga o que falta.",
    "",
    "Resumo operacional:",
    formatJsonBlock({
      range: report.range,
      summary: report.summary,
      sales_by_payment: report.sales_by_payment,
      orders_by_status: report.orders_by_status,
      expenses_by_category: report.expenses_by_category,
      payroll_by_employee: report.payroll_by_employee,
      stock_alerts: report.stock_alerts.slice(0, 8),
    }),
    "",
    "Schema relevante:",
    formatJsonBlock(schemaSummaries),
    "",
    "Amostras read-only do banco:",
    formatJsonBlock(tablePreviews),
    "",
    "Trechos de codigo/documentacao relevantes:",
    formatJsonBlock(
      [...codeMatches, ...docMatches].map((item) => ({
        file: item.relativePath,
        lines: `${item.startLine}-${item.endLine}`,
        kind: item.kind,
        snippet: item.content,
      })),
    ),
    "",
    "Pergunta do usuario:",
    question,
    "",
    "Formato esperado:",
    "1. Resposta objetiva com 4 a 8 linhas.",
    "2. Em seguida escreva 'Fontes:' e liste de 2 a 6 fontes curtas.",
  ];

  return sections.join("\n");
}

function buildFallbackAnswer({ question, domain, report, codeMatches, docMatches, schemaSummaries, tablePreviews }) {
  const normalizedQuestion = question.toLowerCase();
  const lines = [];

  if (schemaSummaries.length > 0 && /(coluna|colunas|campo|campos|schema|estrutura|tabela|banco)/.test(normalizedQuestion)) {
    for (const table of schemaSummaries.slice(0, 3)) {
      lines.push(`Tabela ${table.table}: ${table.columns.slice(0, 12).join(", ")}${table.columns.length > 12 ? ", ..." : ""}`);
    }
  }

  if (tablePreviews.length > 0 && /(quant|total|registro|linha|linhas|dados|amostra|exemplo|ultimo|ultimos|recent)/.test(normalizedQuestion)) {
    for (const table of tablePreviews.slice(0, 2)) {
      const rowsLabel = table.totalRows === null ? "total desconhecido" : `${table.totalRows} registro(s)`;
      lines.push(`Tabela ${table.table}: ${rowsLabel}.`);
      if (table.rows[0]) {
        lines.push(`Exemplo em ${table.table}: ${formatJsonBlock(table.rows[0])}`);
      }
    }
  }

  if (codeMatches.length > 0) {
    const firstMatch = codeMatches[0];
    lines.push(
      `No codigo, o trecho mais relacionado esta em ${firstMatch.relativePath}:${firstMatch.startLine}-${firstMatch.endLine}.`,
    );
  }

  if (docMatches.length > 0) {
    const firstDoc = docMatches[0];
    lines.push(`A documentacao relevante aparece em ${firstDoc.relativePath}:${firstDoc.startLine}-${firstDoc.endLine}.`);
  }

  if (lines.length === 0) {
    lines.push(`Dominio detectado: ${domain}.`);
    lines.push(`Resumo atual: vendas totais ${report.summary ? report.summary.total_sales : "n/d"}, pedidos ${report.summary ? report.summary.orders_count : "n/d"}.`);
  }

  const sources = [];
  for (const item of codeMatches.slice(0, 2)) sources.push(`- arquivo ${item.relativePath}:${item.startLine}-${item.endLine}`);
  for (const item of docMatches.slice(0, 2)) sources.push(`- documento ${item.relativePath}:${item.startLine}-${item.endLine}`);
  for (const item of schemaSummaries.slice(0, 2)) sources.push(`- tabela ${item.table}`);

  return `${lines.join("\n")}\n\nFontes:\n${sources.join("\n")}`;
}

function buildSources({ codeMatches, docMatches, schemaSummaries, tablePreviews }) {
  return [
    ...codeMatches.map((item) => ({
      type: "file",
      label: `${item.relativePath}:${item.startLine}-${item.endLine}`,
      path: item.relativePath,
      lineStart: item.startLine,
      lineEnd: item.endLine,
    })),
    ...docMatches.map((item) => ({
      type: "file",
      label: `${item.relativePath}:${item.startLine}-${item.endLine}`,
      path: item.relativePath,
      lineStart: item.startLine,
      lineEnd: item.endLine,
    })),
    ...schemaSummaries.map((item) => ({
      type: "table",
      label: item.table,
      table: item.table,
      columns: item.columns,
    })),
    ...tablePreviews.map((item) => ({
      type: "table_data",
      label: item.table,
      table: item.table,
      totalRows: item.totalRows,
    })),
  ].slice(0, 10);
}

export function createAssistantService({
  supabase,
  repoRoot,
  normalizeSearchText,
  buildOperationalReport,
  resolveAssistantDomain,
  callGeminiText,
}) {
  let knowledgeCache = null;

  async function loadKnowledgeBase() {
    if (knowledgeCache && Date.now() - knowledgeCache.indexedAt < INDEX_CACHE_TTL_MS) {
      return knowledgeCache;
    }

    knowledgeCache = await buildKnowledgeBase({ repoRoot, normalizeSearchText });
    return knowledgeCache;
  }

  async function answerQuestion({ question, range = {} }) {
    const trimmedQuestion = String(question || "").trim();
    if (!trimmedQuestion) {
      throw new Error("question obrigatoria.");
    }

    const knowledgeBase = await loadKnowledgeBase();
    const domain = resolveAssistantDomain(trimmedQuestion);
    const report = await buildOperationalReport(range);
    const relevantTables = detectRelevantTables({
      question: trimmedQuestion,
      domain,
      schemaTables: knowledgeBase.schemaTables,
      normalizeSearchText,
    });
    const tablePreviews = (
      await Promise.all(relevantTables.map((tableName) => fetchTablePreview(supabase, tableName)))
    ).filter(Boolean);

    const schemaSummaries = relevantTables
      .map((tableName) => knowledgeBase.schemaTables.find((item) => item.table === tableName))
      .filter(Boolean)
      .map((item) => ({
        table: item.table,
        columns: item.columns.slice(0, 20),
        sources: item.sources.slice(0, 4),
      }));

    const codeMatches = searchChunks({
      chunks: knowledgeBase.chunks.filter((item) => item.kind === "code"),
      normalizeSearchText,
      question: trimmedQuestion,
      limit: 4,
    });

    const docMatches = searchChunks({
      chunks: knowledgeBase.chunks.filter((item) => item.kind !== "code"),
      normalizeSearchText,
      question: trimmedQuestion,
      limit: 3,
    });

    const prompt = buildPrompt({
      question: trimmedQuestion,
      domain,
      report,
      codeMatches,
      docMatches,
      schemaSummaries,
      tablePreviews,
    });

    let answer = buildFallbackAnswer({
      question: trimmedQuestion,
      domain,
      report,
      codeMatches,
      docMatches,
      schemaSummaries,
      tablePreviews,
    });

    try {
      const llmAnswer = await callGeminiText({
        prompt,
        temperature: 0.1,
        maxOutputTokens: 1400,
      });
      if (llmAnswer) answer = llmAnswer;
    } catch {
      // fallback local
    }

    return {
      ok: true,
      domain,
      answer,
      report_summary: report.summary,
      context_summary: buildContextSummary({
        codeMatches,
        docMatches,
        schemaSummaries,
        tablePreviews,
      }),
      sources: buildSources({
        codeMatches,
        docMatches,
        schemaSummaries,
        tablePreviews,
      }),
    };
  }

  return {
    answerQuestion,
  };
}
