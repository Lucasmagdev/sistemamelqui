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

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend/.env antes de rodar a exportacao.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function parseArgs(argv) {
  const options = {
    limit: null,
    productId: null,
    concurrency: 4,
    outDir: path.join(backendDir, "exports", "produtos-com-foto"),
  };

  for (const arg of argv) {
    if (arg.startsWith("--limit=")) options.limit = Number.parseInt(arg.split("=")[1], 10) || null;
    else if (arg.startsWith("--product-id=")) options.productId = Number.parseInt(arg.split("=")[1], 10) || null;
    else if (arg.startsWith("--concurrency=")) options.concurrency = Math.max(1, Number.parseInt(arg.split("=")[1], 10) || 4);
    else if (arg.startsWith("--out=")) {
      const inputPath = arg.slice("--out=".length).trim();
      if (inputPath) {
        options.outDir = path.isAbsolute(inputPath) ? inputPath : path.resolve(backendDir, inputPath);
      }
    }
  }

  return options;
}

function sanitizeFileName(value) {
  return String(value || "produto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "produto";
}

function extensionFromMimeType(mimeType = "") {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("avif")) return "avif";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  return null;
}

function extensionFromUrl(fileUrl = "") {
  try {
    const pathname = new URL(fileUrl).pathname;
    const ext = path.extname(pathname || "").replace(".", "").toLowerCase();
    return ext || null;
  } catch {
    return null;
  }
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
  if (error) {
    throw new Error(`Falha ao carregar products: ${error.message}`);
  }

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
    mimeType: response.headers.get("content-type") || "",
  };
}

function createUniqueFileName(product, extension, usedNames) {
  const baseName = sanitizeFileName(product.nome || `produto-${product.id}`);
  const safeExtension = sanitizeFileName(extension || "jpg");
  let candidate = `${baseName}.${safeExtension}`;
  let attempt = 1;

  while (usedNames.has(candidate.toLowerCase())) {
    attempt += 1;
    candidate = `${baseName}_${product.id}_${attempt}.${safeExtension}`;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
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
  await ensureDirectory(options.outDir);

  const products = await fetchProducts(options);
  if (!products.length) {
    console.log("Nenhum produto com foto_url encontrado para exportar.");
    return;
  }

  console.log(`Produtos encontrados para exportacao: ${products.length}`);
  console.log(`Pasta de destino: ${options.outDir}`);

  const usedNames = new Set();
  const startedAt = new Date().toISOString();

  const results = await runWithConcurrency(products, options.concurrency, async (product, index) => {
    const prefix = `[${index + 1}/${products.length}] #${product.id} ${product.nome}`;
    console.log(`${prefix} -> baixando`);

    try {
      const image = await downloadImage(product.foto_url);
      const extension =
        extensionFromMimeType(image.mimeType) ||
        extensionFromUrl(product.foto_url) ||
        "jpg";

      const fileName = createUniqueFileName(product, extension, usedNames);
      const filePath = path.join(options.outDir, fileName);

      await fs.writeFile(filePath, image.buffer);

      console.log(`${prefix} -> salvo em ${fileName}`);
      return {
        status: "ok",
        product_id: product.id,
        nome: product.nome,
        categoria: product.categoria || null,
        original_url: product.foto_url,
        file_name: fileName,
        file_path: filePath,
        mime_type: image.mimeType || null,
        size: image.buffer.length,
      };
    } catch (error) {
      console.error(`${prefix} -> erro: ${error.message}`);
      return {
        status: "error",
        product_id: product.id,
        nome: product.nome,
        categoria: product.categoria || null,
        original_url: product.foto_url,
        error: error.message,
      };
    }
  });

  const manifest = {
    summary: {
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      out_dir: options.outDir,
      total: results.length,
      ok: results.filter((item) => item.status === "ok").length,
      failed: results.filter((item) => item.status !== "ok").length,
    },
    results,
  };

  const manifestPath = path.join(options.outDir, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Manifest salvo em: ${manifestPath}`);
  console.log(JSON.stringify(manifest.summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
