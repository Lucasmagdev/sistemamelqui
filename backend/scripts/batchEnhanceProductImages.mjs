import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");

const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const bucket = "produtos";

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend/.env antes de rodar o lote.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function parseArgs(argv) {
  const options = {
    apply: false,
    limit: null,
    productId: null,
    concurrency: 3,
    maxWidth: 1600,
    jpegQuality: 88,
  };

  for (const arg of argv) {
    if (arg === "--apply") options.apply = true;
    else if (arg.startsWith("--limit=")) options.limit = Number.parseInt(arg.split("=")[1], 10) || null;
    else if (arg.startsWith("--product-id=")) options.productId = Number.parseInt(arg.split("=")[1], 10) || null;
    else if (arg.startsWith("--concurrency=")) options.concurrency = Math.max(1, Number.parseInt(arg.split("=")[1], 10) || 3);
    else if (arg.startsWith("--max-width=")) options.maxWidth = Math.max(600, Number.parseInt(arg.split("=")[1], 10) || 1600);
    else if (arg.startsWith("--jpeg-quality=")) options.jpegQuality = Math.min(95, Math.max(70, Number.parseInt(arg.split("=")[1], 10) || 88));
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

function inferMimeTypeFromUrl(fileUrl = "") {
  const normalized = String(fileUrl || "").toLowerCase().trim();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
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
    mimeType: response.headers.get("content-type") || inferMimeTypeFromUrl(fileUrl),
  };
}

async function enhanceImage(buffer, { maxWidth, jpegQuality }) {
  const metadata = await sharp(buffer, { failOn: "none" }).rotate().metadata();

  const pipeline = sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: maxWidth,
      fit: "inside",
      withoutEnlargement: true,
    })
    .normalise()
    .modulate({
      brightness: 1.02,
      saturation: 1.05,
    })
    .sharpen({
      sigma: 1.05,
      m1: 0.8,
      m2: 2.2,
      x1: 2,
      y2: 10,
      y3: 20,
    });

  if (metadata.hasAlpha) {
    const output = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    return { buffer: output, mimeType: "image/png", extension: "png" };
  }

  const output = await pipeline.jpeg({ quality: jpegQuality, mozjpeg: true, progressive: true }).toBuffer();
  return { buffer: output, mimeType: "image/jpeg", extension: "jpg" };
}

async function uploadEnhancedImage(product, enhancedImage) {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeName = sanitizeFileName(product.nome || `produto-${product.id}`);
  const filePath = `products/batch-enhanced/${yyyy}/${mm}/${Date.now()}-${product.id}-${safeName}.${enhancedImage.extension}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, enhancedImage.buffer, {
    contentType: enhancedImage.mimeType,
    upsert: false,
  });

  if (uploadError) {
    throw new Error(`Falha no upload para o Storage: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return {
    bucket,
    filePath,
    fileUrl: publicUrlData?.publicUrl || null,
  };
}

async function updateProductPhoto(productId, photoUrl) {
  const { error } = await supabase
    .from("products")
    .update({ foto_url: photoUrl })
    .eq("id", productId);

  if (error) {
    throw new Error(`Falha ao atualizar foto_url do produto ${productId}: ${error.message}`);
  }
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

  const products = await fetchProducts({ limit: options.limit, productId: options.productId });
  if (!products.length) {
    console.log("Nenhum produto com foto_url encontrado para processar.");
    return;
  }

  console.log(`Produtos encontrados para processamento: ${products.length}`);
  console.log(options.apply ? "Modo APPLY: vai subir imagens e atualizar foto_url." : "Modo DRY RUN: nao vai gravar nada no banco.");

  const startedAt = new Date().toISOString();
  const results = await runWithConcurrency(products, options.concurrency, async (product, index) => {
    const prefix = `[${index + 1}/${products.length}] #${product.id} ${product.nome}`;
    console.log(`${prefix} -> iniciando`);

    try {
      const original = await downloadImage(product.foto_url);
      const enhanced = await enhanceImage(original.buffer, options);

      let upload = null;
      if (options.apply) {
        upload = await uploadEnhancedImage(product, enhanced);
        if (!upload.fileUrl) {
          throw new Error("Nao foi possivel gerar URL publica para a imagem melhorada.");
        }
        await updateProductPhoto(product.id, upload.fileUrl);
      }

      console.log(`${prefix} -> ok`);
      return {
        status: "ok",
        product_id: product.id,
        nome: product.nome,
        categoria: product.categoria || null,
        original_url: product.foto_url,
        new_url: upload?.fileUrl || null,
        bytes_before: original.buffer.length,
        bytes_after: enhanced.buffer.length,
        mime_type: enhanced.mimeType,
        applied: options.apply,
      };
    } catch (error) {
      console.error(`${prefix} -> erro: ${error.message}`);
      return {
        status: "error",
        product_id: product.id,
        nome: product.nome,
        categoria: product.categoria || null,
        original_url: product.foto_url,
        new_url: null,
        applied: false,
        error: error.message,
      };
    }
  });

  const summary = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    apply: options.apply,
    options,
    total: results.length,
    ok: results.filter((item) => item.status === "ok").length,
    failed: results.filter((item) => item.status !== "ok").length,
  };

  const report = { summary, results };
  const reportFile = path.join(reportDir, `product-image-enhancement-${Date.now()}.json`);
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2), "utf8");

  console.log(`Relatorio salvo em: ${reportFile}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
