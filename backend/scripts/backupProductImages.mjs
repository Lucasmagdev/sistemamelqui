import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");

const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const bucket = "produtos";

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend/.env antes de rodar o backup.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function parseArgs(argv) {
  const options = {
    limit: null,
    productId: null,
    concurrency: 4,
  };

  for (const arg of argv) {
    if (arg.startsWith("--limit=")) options.limit = Number.parseInt(arg.split("=")[1], 10) || null;
    else if (arg.startsWith("--product-id=")) options.productId = Number.parseInt(arg.split("=")[1], 10) || null;
    else if (arg.startsWith("--concurrency=")) options.concurrency = Math.max(1, Number.parseInt(arg.split("=")[1], 10) || 4);
  }

  return options;
}

function sanitizeFileName(fileName) {
  return String(fileName || "produto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "produto";
}

function inferExtensionFromMimeType(mimeType = "") {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  return "jpg";
}

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fetchProducts({ limit, productId }) {
  let query = supabase
    .from("products")
    .select("id, nome, categoria, foto_url")
    .not("foto_url", "is", null)
    .order("id", { ascending: true });

  if (productId) query = query.eq("id", productId);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar products: ${error.message}`);

  return (data || []).filter((product) => String(product.foto_url || "").trim());
}

async function downloadImage(fileUrl) {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!buffer.length) {
    throw new Error("Imagem vazia.");
  }

  return {
    buffer,
    mimeType: response.headers.get("content-type") || "image/jpeg",
  };
}

async function uploadBackup(product, image) {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const extension = inferExtensionFromMimeType(image.mimeType);
  const safeName = sanitizeFileName(product.nome || `produto-${product.id}`);
  const filePath = `products/backups/${yyyy}/${mm}/${Date.now()}-${product.id}-${safeName}.${extension}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, image.buffer, {
    contentType: image.mimeType,
    upsert: false,
  });

  if (uploadError) {
    throw new Error(`Falha no upload do backup: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return {
    bucket,
    filePath,
    fileUrl: publicUrlData?.publicUrl || null,
    mimeType: image.mimeType,
    size: image.buffer.length,
  };
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const reportDir = path.join(backendDir, "reports");
  await ensureDirectory(reportDir);

  const products = await fetchProducts(options);
  if (!products.length) {
    console.log("Nenhum produto com foto_url encontrado para backup.");
    return;
  }

  console.log(`Produtos encontrados para backup: ${products.length}`);

  const startedAt = new Date().toISOString();
  const results = await runWithConcurrency(products, options.concurrency, async (product, index) => {
    const prefix = `[${index + 1}/${products.length}] #${product.id} ${product.nome}`;
    console.log(`${prefix} -> iniciando backup`);

    try {
      const original = await downloadImage(product.foto_url);
      const upload = await uploadBackup(product, original);

      if (!upload.fileUrl) {
        throw new Error("Nao foi possivel gerar URL publica do backup.");
      }

      console.log(`${prefix} -> backup ok`);
      return {
        status: "ok",
        product_id: product.id,
        nome: product.nome,
        categoria: product.categoria || null,
        original_url: product.foto_url,
        backup_url: upload.fileUrl,
        backup_path: upload.filePath,
        mime_type: upload.mimeType,
        size: upload.size,
      };
    } catch (error) {
      console.error(`${prefix} -> erro: ${error.message}`);
      return {
        status: "error",
        product_id: product.id,
        nome: product.nome,
        categoria: product.categoria || null,
        original_url: product.foto_url,
        backup_url: null,
        error: error.message,
      };
    }
  });

  const summary = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    options,
    total: results.length,
    ok: results.filter((item) => item.status === "ok").length,
    failed: results.filter((item) => item.status !== "ok").length,
  };

  const report = { summary, results };
  const reportFile = path.join(reportDir, `product-image-backup-${Date.now()}.json`);
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2), "utf8");

  console.log(`Relatorio salvo em: ${reportFile}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
