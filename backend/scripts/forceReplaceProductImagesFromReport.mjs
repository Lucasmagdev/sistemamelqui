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
  throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend/.env antes de rodar a sincronizacao.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function parseArgs(argv) {
  const options = {
    reportPath: "",
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg.startsWith("--report=")) {
      options.reportPath = arg.slice("--report=".length).trim();
    }
  }

  if (!options.reportPath) {
    throw new Error("Informe --report=caminho/do/relatorio.json");
  }

  if (!path.isAbsolute(options.reportPath)) {
    options.reportPath = path.resolve(backendDir, options.reportPath);
  }

  return options;
}

function storagePathFromPublicUrl(url) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const raw = String(url || "");
  const index = raw.indexOf(marker);
  if (index === -1) {
    throw new Error(`URL fora do bucket ${bucket}: ${url}`);
  }
  return raw.slice(index + marker.length);
}

function contentTypeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".avif") return "image/avif";
  return "image/jpeg";
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const reportRaw = await fs.readFile(options.reportPath, "utf8");
  const report = JSON.parse(reportRaw);
  const results = Array.isArray(report?.results) ? report.results : [];

  const candidates = results.filter((item) =>
    item?.status === "ok" &&
    item?.productId &&
    item?.oldUrl &&
    item?.exportPath,
  );

  if (!candidates.length) {
    throw new Error("Nenhum item elegivel encontrado no relatorio.");
  }

  const output = [];

  for (const item of candidates) {
    const storagePath = storagePathFromPublicUrl(item.oldUrl);
    const fileBuffer = await fs.readFile(item.exportPath);
    const contentType = contentTypeFromPath(item.exportPath);

    if (!options.dryRun) {
      const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, fileBuffer, {
        contentType,
        upsert: true,
      });

      if (uploadError) {
        throw new Error(`Falha ao sobrescrever ${storagePath}: ${uploadError.message}`);
      }

      await updateProductPhoto(item.productId, item.oldUrl);
    }

    output.push({
      productId: item.productId,
      productName: item.productName,
      source: item.source,
      restoredUrl: item.oldUrl,
      storagePath,
      bytes: fileBuffer.length,
      applied: !options.dryRun,
    });
  }

  console.log(JSON.stringify({
    reportPath: options.reportPath,
    dryRun: options.dryRun,
    count: output.length,
    results: output,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
