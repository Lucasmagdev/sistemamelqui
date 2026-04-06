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

const aiHordeBaseUrl = String(process.env.AI_HORDE_BASE_URL || "https://aihorde.net").trim().replace(/\/+$/, "");
const aiHordeApiKey = String(process.env.AI_HORDE_API_KEY || "0000000000").trim() || "0000000000";
const aiHordeClientAgent = String(process.env.AI_HORDE_CLIENT_AGENT || "imperial-flow-gold:batch:1.0").trim() || "imperial-flow-gold:batch:1.0";

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend/.env antes de rodar o lote.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function parseArgs(argv) {
  const options = {
    apply: false,
    limit: null,
    productId: null,
    concurrency: 1,
    timeoutMs: Math.max(60000, Number.parseInt(String(process.env.AI_HORDE_TIMEOUT_MS || "180000"), 10) || 180000),
    pollIntervalMs: Math.max(3000, Number.parseInt(String(process.env.AI_HORDE_POLL_INTERVAL_MS || "5000"), 10) || 5000),
    steps: Math.max(12, Number.parseInt(String(process.env.AI_HORDE_STEPS || "18"), 10) || 18),
    cfgScale: Math.max(1, Number.parseFloat(String(process.env.AI_HORDE_CFG_SCALE || "7")) || 7),
    denoisingStrength: Math.min(0.75, Math.max(0.15, Number.parseFloat(String(process.env.AI_HORDE_DENOISING_STRENGTH || "0.32")) || 0.32)),
    sampler: String(process.env.AI_HORDE_SAMPLER || "k_euler_a").trim() || "k_euler_a",
  };

  for (const arg of argv) {
    if (arg === "--apply") options.apply = true;
    else if (arg.startsWith("--limit=")) options.limit = Number.parseInt(arg.split("=")[1], 10) || null;
    else if (arg.startsWith("--product-id=")) options.productId = Number.parseInt(arg.split("=")[1], 10) || null;
    else if (arg.startsWith("--concurrency=")) options.concurrency = Math.max(1, Number.parseInt(arg.split("=")[1], 10) || 1);
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = Math.max(60000, Number.parseInt(arg.split("=")[1], 10) || options.timeoutMs);
    else if (arg.startsWith("--poll-ms=")) options.pollIntervalMs = Math.max(3000, Number.parseInt(arg.split("=")[1], 10) || options.pollIntervalMs);
    else if (arg.startsWith("--steps=")) options.steps = Math.max(12, Number.parseInt(arg.split("=")[1], 10) || options.steps);
    else if (arg.startsWith("--cfg=")) options.cfgScale = Math.max(1, Number.parseFloat(arg.split("=")[1]) || options.cfgScale);
    else if (arg.startsWith("--denoise=")) {
      options.denoisingStrength = Math.min(0.75, Math.max(0.15, Number.parseFloat(arg.split("=")[1]) || options.denoisingStrength));
    }
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
    .select("id, nome, categoria, descricao, foto_url")
    .not("foto_url", "is", null)
    .order("id", { ascending: true });

  if (productId) query = query.eq("id", productId);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar products: ${error.message}`);

  return (data || []).filter((product) => String(product.foto_url || "").trim());
}

async function downloadImageAsBase64(fileUrl) {
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
    base64: buffer.toString("base64"),
    mimeType: response.headers.get("content-type") || "image/jpeg",
    bytes: buffer.length,
  };
}

async function normalizeAiHordeSourceImage(image) {
  const sourceMimeType = String(image?.mimeType || "").toLowerCase();
  if (
    sourceMimeType.includes("jpeg")
    || sourceMimeType.includes("jpg")
    || sourceMimeType.includes("png")
    || sourceMimeType.includes("webp")
  ) {
    return image;
  }

  const convertedBuffer = await sharp(Buffer.from(image.base64, "base64"), { failOn: "none" })
    .rotate()
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  return {
    base64: convertedBuffer.toString("base64"),
    mimeType: "image/jpeg",
    bytes: convertedBuffer.length,
    converted_from: image.mimeType,
  };
}

function buildSingleBoardPrompt(product) {
  const productName = String(product?.nome || "").trim() || "produto";
  const category = String(product?.categoria || "").trim() || "carnes";
  const description = String(product?.descricao || "").trim();
  const productLine = `Preserve exatamente o mesmo produto real (${productName}) da foto, da categoria ${category}.`;
  const descriptionLine = description ? `Considere a descricao atual: ${description}.` : null;
  const guardRail = "Nao altere corte, formato, espessura, textura, fibras, gordura, proporcoes ou cor natural da carne. Nao invente novos pedacos do produto.";
  const negativePrompt = [
    "different meat cut",
    "extra pieces of meat",
    "knife",
    "fork",
    "logo",
    "text",
    "watermark",
    "plastic tray",
    "packaging",
    "artificial garnish",
    "cartoon",
    "illustration",
    "oversaturated",
    "blurry",
    "distorted",
  ].join(", ");

  const prompt = [
    "Fotografia gastronomica premium de acougue gourmet.",
    productLine,
    descriptionLine,
    "Apresente a carne sobre papel manteiga amassado e uma tabua ou superficie de madeira rustica escura.",
    "Adicione apenas como contexto visual discreto ervas frescas, alho e tomates ao fundo, sem roubar o foco principal do produto.",
    "Use iluminacao suave, apetitosa e realista, aparencia comercial sofisticada, profundidade de campo delicada e destaque total para a carne.",
    guardRail,
  ].filter(Boolean).join(" ");

  return {
    id: "tabua-rustica-premium",
    prompt,
    fullPrompt: `${prompt} ### ${negativePrompt}`,
  };
}

async function submitAiHordeJob({ prompt, sourceImageBase64, options }) {
  const response = await fetch(`${aiHordeBaseUrl}/api/v2/generate/async`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: aiHordeApiKey,
      "Client-Agent": aiHordeClientAgent,
    },
    body: JSON.stringify({
      prompt,
      nsfw: true,
      censor_nsfw: false,
      replacement_filter: false,
      shared: false,
      r2: false,
      source_image: sourceImageBase64,
      source_processing: "img2img",
      params: {
        n: 1,
        steps: options.steps,
        cfg_scale: options.cfgScale,
        denoising_strength: options.denoisingStrength,
        sampler_name: options.sampler,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.rc || `Falha ao iniciar job no AI Horde (HTTP ${response.status}).`);
  }

  if (!String(payload?.id || "").trim()) {
    throw new Error("AI Horde nao retornou id de geracao.");
  }

  return {
    id: String(payload.id),
    kudos: payload?.kudos ?? null,
  };
}

async function waitForAiHordeResult(jobId, options) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < options.timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, options.pollIntervalMs));

    const response = await fetch(`${aiHordeBaseUrl}/api/v2/generate/status/${jobId}`, {
      method: "GET",
      headers: {
        apikey: aiHordeApiKey,
        "Client-Agent": aiHordeClientAgent,
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || payload?.rc || `Falha ao consultar status do AI Horde (HTTP ${response.status}).`);
    }

    if (payload?.faulted) {
      throw new Error(payload?.message || "AI Horde marcou a geracao como faulted.");
    }

    const generation = Array.isArray(payload?.generations) ? payload.generations[0] : null;
    const resultBase64 = String(generation?.img || "").trim();
    if (resultBase64) {
      return {
        base64: resultBase64,
        mimeType: "image/webp",
        model: generation?.model || null,
        workerName: generation?.worker_name || null,
      };
    }

    if (payload?.done) {
      break;
    }
  }

  throw new Error(`Timeout aguardando o AI Horde concluir o job ${jobId}.`);
}

async function uploadGeneratedImage(product, generatedImage) {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeName = sanitizeFileName(product.nome || `produto-${product.id}`);
  const extension = generatedImage.mimeType.includes("png") ? "png" : generatedImage.mimeType.includes("jpeg") ? "jpg" : "webp";
  const filePath = `products/ai-horde-stylized/${yyyy}/${mm}/${Date.now()}-${product.id}-${safeName}.${extension}`;
  const buffer = Buffer.from(generatedImage.base64, "base64");

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, buffer, {
    contentType: generatedImage.mimeType,
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
    bytes: buffer.length,
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
    console.log("Nenhum produto com foto_url encontrado para estilizar.");
    return;
  }

  console.log(`Produtos encontrados para AI Horde: ${products.length}`);
  console.log(options.apply ? "Modo APPLY: vai subir imagens e atualizar foto_url." : "Modo DRY RUN: nao vai gravar nada no banco.");
  console.log(`Configuracao: concurrency=${options.concurrency}, timeout=${options.timeoutMs}ms, poll=${options.pollIntervalMs}ms, steps=${options.steps}, cfg=${options.cfgScale}, denoise=${options.denoisingStrength}`);

  const startedAt = new Date().toISOString();
  const results = await runWithConcurrency(products, options.concurrency, async (product, index) => {
    const prefix = `[${index + 1}/${products.length}] #${product.id} ${product.nome}`;
    console.log(`${prefix} -> iniciando`);

    try {
      const originalSourceImage = await downloadImageAsBase64(product.foto_url);
      const sourceImage = await normalizeAiHordeSourceImage(originalSourceImage);
      const selectedPrompt = buildSingleBoardPrompt(product);
      const job = await submitAiHordeJob({
        prompt: selectedPrompt.fullPrompt,
        sourceImageBase64: sourceImage.base64,
        options,
      });

      console.log(`${prefix} -> job ${job.id} criado com prompt ${selectedPrompt.id}`);

      const generation = await waitForAiHordeResult(job.id, options);

      let upload = null;
      if (options.apply) {
        upload = await uploadGeneratedImage(product, generation);
        if (!upload.fileUrl) {
          throw new Error("Nao foi possivel gerar URL publica para a imagem estilizada.");
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
        prompt_id: selectedPrompt.id,
        prompt: selectedPrompt.prompt,
        full_prompt: selectedPrompt.fullPrompt,
        ai_horde_job_id: job.id,
        ai_horde_kudos: job.kudos,
        ai_horde_model: generation.model,
        ai_horde_worker: generation.workerName,
        bytes_before: originalSourceImage.bytes,
        bytes_submitted: sourceImage.bytes,
        source_mime_type: sourceImage.mimeType,
        source_converted_from: sourceImage.converted_from || null,
        bytes_after: upload?.bytes || Buffer.from(generation.base64, "base64").length,
        mime_type: generation.mimeType,
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
  const reportFile = path.join(reportDir, `product-image-ai-horde-${Date.now()}.json`);
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2), "utf8");

  console.log(`Relatorio salvo em: ${reportFile}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
