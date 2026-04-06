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

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend/.env antes de rodar a sincronizacao.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const DEFAULT_SOURCE_DIR = path.join(repoDir, "novas fotos");
const EXPORT_DIR = path.join(backendDir, "exports", "produtos-com-foto");
const REPORT_DIR = path.join(backendDir, "reports");

const SOURCE_TARGETS = {
  linguicamista: [
    { productId: 46, exportFileName: "Linguica_Mista_para_Churrasco.jpg" },
  ],
  maminhadealcatracomousemrecheio: [
    { productId: 63, exportFileName: "Maminha_de_Alcatra_Com_ou_sem_recheio.jpg" },
  ],
  maminhablackangus: [
    { productId: 90, exportFileName: "Maminha_De_Alcatra_Black_Angus.webp" },
  ],
  miolodeacemblackangus: [
    { productId: 86, exportFileName: "Miolo_De_Acem_Black_Angus.webp" },
  ],
  molodeacemblackangus: [
    { productId: 86, exportFileName: "Miolo_De_Acem_Black_Angus.webp" },
  ],
  miolodepatela: [
    { productId: 65, exportFileName: "Miolo_de_Paleta.jpg" },
  ],
  musculoblackangus: [
    { productId: 85, exportFileName: "Musculo_Black_Angus.webp" },
  ],
  orelhadeporco: [
    { productId: 9, exportFileName: "Orelha.jpg" },
    { productId: 68, exportFileName: "Orelha_De_Porco.png" },
  ],
  patinho: [
    { productId: 32, exportFileName: "Patinho.jpg" },
  ],
  pedeboi: [
    { productId: 62, exportFileName: "Pe_de_Boi.jpg" },
  ],
  pezinhodegalinha: [
    { productId: 23, exportFileName: "Pezinho_de_Frango.avif" },
  ],
  pernilrecheado: [
    { productId: 43, exportFileName: "Pernil_Recheado.jpg" },
  ],
  picanhachoice: [
    { productId: 79, exportFileName: "Picanha_Choice.jpg" },
  ],
  picanhapremium: [
    { productId: 70, exportFileName: "Picanha_Prime.png" },
  ],
  rabodeporco: [
    { productId: 10, exportFileName: "Rabinho.jpg" },
  ],
  rybeye: [
    { productId: 37, exportFileName: "Ribeye.webp" },
  ],
  suan: [
    { productId: 11, exportFileName: "Suan.jpg" },
  ],
  tomahawk: [
    { productId: 35, exportFileName: "Tomahawk_Steak.jpg" },
  ],
  testiculodeboi: [
    { productId: 56, exportFileName: "Testiculo_de_Boi.jpg" },
  ],
};

function parseArgs(argv) {
  const options = {
    apply: false,
    sourceDir: DEFAULT_SOURCE_DIR,
  };

  for (const arg of argv) {
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg.startsWith("--source=")) {
      const raw = arg.slice("--source=".length).trim();
      if (raw) {
        options.sourceDir = path.isAbsolute(raw) ? raw : path.resolve(repoDir, raw);
      }
    }
  }

  return options;
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function sanitizeStorageSegment(value) {
  return String(value || "produto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 80) || "produto";
}

function compactTimestamp(date = new Date()) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

function contentTypeFromExt(extension) {
  const ext = String(extension || "").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "avif") return "image/avif";
  return "image/jpeg";
}

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchProductsByIds(productIds) {
  const { data, error } = await supabase
    .from("products")
    .select("id, nome, nome_en, categoria, foto_url")
    .in("id", productIds)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`Falha ao carregar produtos: ${error.message}`);
  }

  return new Map((data || []).map((product) => [Number(product.id), product]));
}

async function downloadImage(fileUrl) {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem atual: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function encodeForExtension(buffer, extension) {
  const ext = String(extension || "").toLowerCase();
  const pipeline = sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: 1800,
      fit: "inside",
      withoutEnlargement: true,
    });

  if (ext === "png") {
    return {
      buffer: await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer(),
      mimeType: "image/png",
    };
  }

  if (ext === "webp") {
    return {
      buffer: await pipeline.webp({ quality: 88 }).toBuffer(),
      mimeType: "image/webp",
    };
  }

  if (ext === "avif") {
    return {
      buffer: await pipeline.avif({ quality: 62 }).toBuffer(),
      mimeType: "image/avif",
    };
  }

  return {
    buffer: await pipeline.flatten({ background: "#101010" }).jpeg({ quality: 86, mozjpeg: true, progressive: true }).toBuffer(),
    mimeType: "image/jpeg",
  };
}

async function uploadProductImage(storageName, fileBuffer, mimeType) {
  const { error: uploadError } = await supabase.storage.from(bucket).upload(storageName, fileBuffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (uploadError) {
    throw new Error(`Falha ao subir imagem no Storage: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(storageName);
  const publicUrl = data?.publicUrl || null;
  if (!publicUrl) {
    throw new Error("Nao foi possivel gerar URL publica da imagem.");
  }

  return publicUrl;
}

async function updateProductPhoto(productId, publicUrl) {
  const { error } = await supabase
    .from("products")
    .update({ foto_url: publicUrl })
    .eq("id", productId);

  if (error) {
    throw new Error(`Falha ao atualizar foto_url do produto ${productId}: ${error.message}`);
  }
}

async function readSourceFiles(sourceDir) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      name: entry.name,
      key: normalizeKey(path.parse(entry.name).name),
      sourcePath: path.join(sourceDir, entry.name),
    }))
    .filter((entry) => entry.key);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const createdAt = new Date().toISOString();
  const runStamp = compactTimestamp(new Date());
  const backupDir = path.join(backendDir, "exports", `produtos-com-foto-backup-${runStamp}`);
  const reportPath = path.join(REPORT_DIR, `product-image-manual-sync-${runStamp}.json`);

  await ensureDirectory(REPORT_DIR);
  await ensureDirectory(EXPORT_DIR);
  await ensureDirectory(backupDir);

  const sourceFiles = await readSourceFiles(options.sourceDir);
  if (!sourceFiles.length) {
    throw new Error(`Nenhuma imagem encontrada em ${options.sourceDir}`);
  }

  const missingMappings = sourceFiles.filter((file) => !SOURCE_TARGETS[file.key]);
  if (missingMappings.length) {
    throw new Error(`As seguintes imagens nao tem mapeamento configurado: ${missingMappings.map((file) => file.name).join(", ")}`);
  }

  const targetDescriptors = sourceFiles.flatMap((file) =>
    SOURCE_TARGETS[file.key].map((target) => ({
      sourceName: file.name,
      sourceKey: file.key,
      sourcePath: file.sourcePath,
      ...target,
    })),
  );

  const productMap = await fetchProductsByIds([...new Set(targetDescriptors.map((item) => item.productId))]);
  const encodeCache = new Map();
  const results = [];

  for (const target of targetDescriptors) {
    const product = productMap.get(target.productId);
    if (!product) {
      results.push({
        status: "error",
        source: target.sourceName,
        productId: target.productId,
        productName: null,
        error: "Produto nao encontrado no Supabase.",
      });
      continue;
    }

    const exportPath = path.join(EXPORT_DIR, target.exportFileName);
    const backupPath = path.join(backupDir, target.exportFileName);
    const extension = path.extname(target.exportFileName).replace(".", "").toLowerCase() || "jpg";
    const encodeCacheKey = `${target.sourcePath}::${extension}`;
    const sourceStorageSegment = sanitizeStorageSegment(path.parse(target.sourceName).name);
    const storageName = `${Date.now()}-${product.id}-${sourceStorageSegment}.${extension}`;

    try {
      const sourceBuffer = await fs.readFile(target.sourcePath);
      let encoded = encodeCache.get(encodeCacheKey);
      if (!encoded) {
        encoded = await encodeForExtension(sourceBuffer, extension);
        encodeCache.set(encodeCacheKey, encoded);
      }

      if (await fileExists(exportPath)) {
        await ensureDirectory(path.dirname(backupPath));
        await fs.copyFile(exportPath, backupPath);
      } else if (product.foto_url) {
        await ensureDirectory(path.dirname(backupPath));
        const currentBuffer = await downloadImage(product.foto_url);
        await fs.writeFile(backupPath, currentBuffer);
      }

      let publicUrl = null;
      if (options.apply) {
        await fs.writeFile(exportPath, encoded.buffer);
        publicUrl = await uploadProductImage(storageName, encoded.buffer, encoded.mimeType || contentTypeFromExt(extension));
        await updateProductPhoto(product.id, publicUrl);
      }

      results.push({
        status: "ok",
        source: target.sourceName,
        productId: product.id,
        productName: product.nome,
        fileName: target.exportFileName,
        oldUrl: product.foto_url,
        previousCurrentUrl: product.foto_url,
        publicUrl,
        storageName: options.apply ? storageName : null,
        backupPath,
        exportPath,
        uploadBytes: encoded.buffer.length,
      });
    } catch (error) {
      results.push({
        status: "error",
        source: target.sourceName,
        productId: product.id,
        productName: product.nome,
        fileName: target.exportFileName,
        oldUrl: product.foto_url,
        previousCurrentUrl: product.foto_url,
        publicUrl: null,
        storageName: null,
        backupPath,
        exportPath,
        error: error.message,
      });
    }
  }

  const summary = {
    sourceCount: sourceFiles.length,
    targetCount: results.length,
    updated: results.filter((item) => item.status === "ok" && item.publicUrl).length,
    failed: results.filter((item) => item.status !== "ok").length,
    backupDir,
    reportPath,
  };

  const report = {
    created_at: createdAt,
    summary,
    results,
  };

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
