import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");
const repoDir = path.resolve(backendDir, "..");

const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const bucket = "produtos";
const logoPath = path.join(repoDir, "public", "brand", "image-removebg-preview (13).png");

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend/.env antes de rodar a marca.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function parseArgs(argv) {
  const options = {
    apply: false,
    limit: null,
    productId: null,
    concurrency: 3,
    position: "bottom-center",
    marginRatio: 0.035,
    widthRatio: 0.24,
  };

  for (const arg of argv) {
    if (arg === "--apply") options.apply = true;
    else if (arg.startsWith("--limit=")) options.limit = Number.parseInt(arg.split("=")[1], 10) || null;
    else if (arg.startsWith("--product-id=")) options.productId = Number.parseInt(arg.split("=")[1], 10) || null;
    else if (arg.startsWith("--concurrency=")) options.concurrency = Math.max(1, Number.parseInt(arg.split("=")[1], 10) || 3);
    else if (arg.startsWith("--position=")) options.position = String(arg.split("=")[1] || "bottom-center").trim();
    else if (arg.startsWith("--margin-ratio=")) options.marginRatio = Math.max(0.01, Number.parseFloat(arg.split("=")[1]) || 0.035);
    else if (arg.startsWith("--width-ratio=")) options.widthRatio = Math.min(0.4, Math.max(0.1, Number.parseFloat(arg.split("=")[1]) || 0.24));
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

function resolveLogoPosition(position, width, height, logoWidth, logoHeight, margin) {
  const normalized = String(position || "bottom-center").trim().toLowerCase();
  const left = margin;
  const center = Math.round((width - logoWidth) / 2);
  const right = width - logoWidth - margin;
  const bottom = height - logoHeight - margin;

  if (normalized === "bottom-left") return { left, top: bottom };
  if (normalized === "bottom-right") return { left: right, top: bottom };
  return { left: center, top: bottom };
}

async function applyLogo(buffer, logoBuffer, options) {
  const base = sharp(buffer, { failOn: "none" }).rotate();
  const metadata = await base.metadata();

  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height) {
    throw new Error("Nao foi possivel identificar o tamanho da imagem.");
  }

  const targetLogoWidth = Math.max(140, Math.round(width * options.widthRatio));
  const margin = Math.max(18, Math.round(height * options.marginRatio));

  const resizedLogo = await sharp(logoBuffer)
    .resize({
      width: targetLogoWidth,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const logoMetadata = await sharp(resizedLogo).metadata();
  const position = resolveLogoPosition(
    options.position,
    width,
    height,
    logoMetadata.width || targetLogoWidth,
    logoMetadata.height || targetLogoWidth,
    margin,
  );

  const output = await base
    .composite([{ input: resizedLogo, left: position.left, top: position.top }])
    .jpeg({ quality: 92, mozjpeg: true, progressive: true })
    .toBuffer();

  return {
    buffer: output,
    mimeType: "image/jpeg",
    extension: "jpg",
  };
}

async function uploadBrandedImage(product, brandedImage) {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeName = sanitizeFileName(product.nome || `produto-${product.id}`);
  const filePath = `products/branded/${yyyy}/${mm}/${Date.now()}-${product.id}-${safeName}.${brandedImage.extension}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, brandedImage.buffer, {
    contentType: brandedImage.mimeType,
    upsert: false,
  });

  if (uploadError) {
    throw new Error(`Falha no upload da imagem com logo: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return {
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

  const logoBuffer = await fs.readFile(logoPath);
  const products = await fetchProducts(options);
  if (!products.length) {
    console.log("Nenhum produto com foto_url encontrado para aplicar logo.");
    return;
  }

  console.log(`Produtos encontrados para aplicar logo: ${products.length}`);
  console.log(options.apply ? "Modo APPLY: vai gravar as novas imagens e atualizar foto_url." : "Modo DRY RUN: sem atualizar o banco.");
  console.log(`Posicao da logo: ${options.position}`);

  const startedAt = new Date().toISOString();
  const results = await runWithConcurrency(products, options.concurrency, async (product, index) => {
    const prefix = `[${index + 1}/${products.length}] #${product.id} ${product.nome}`;
    console.log(`${prefix} -> iniciando`);

    try {
      const original = await downloadImage(product.foto_url);
      const branded = await applyLogo(original.buffer, logoBuffer, options);

      let upload = null;
      if (options.apply) {
        upload = await uploadBrandedImage(product, branded);
        if (!upload.fileUrl) {
          throw new Error("Nao foi possivel gerar URL publica da imagem com logo.");
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
        position: options.position,
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
        position: options.position,
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
  const reportFile = path.join(backendDir, "reports", `product-image-branding-${Date.now()}.json`);
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2), "utf8");

  console.log(`Relatorio salvo em: ${reportFile}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
