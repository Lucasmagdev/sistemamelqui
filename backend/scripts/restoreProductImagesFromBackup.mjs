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
  throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend/.env antes de rodar a restauracao.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function parseArgs(argv) {
  const options = {
    report: null,
    limit: null,
    productId: null,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--report=")) options.report = arg.slice("--report=".length);
    else if (arg.startsWith("--limit=")) options.limit = Number.parseInt(arg.split("=")[1], 10) || null;
    else if (arg.startsWith("--product-id=")) options.productId = Number.parseInt(arg.split("=")[1], 10) || null;
  }

  return options;
}

async function resolveReportPath(reportArg) {
  if (reportArg) {
    return path.isAbsolute(reportArg) ? reportArg : path.join(backendDir, reportArg);
  }

  const reportsDir = path.join(backendDir, "reports");
  const files = await fs.readdir(reportsDir);
  const candidates = files
    .filter((file) => file.startsWith("product-image-backup-") && file.endsWith(".json"))
    .sort()
    .reverse();

  if (!candidates.length) {
    throw new Error("Nenhum relatorio de backup encontrado em backend/reports.");
  }

  return path.join(reportsDir, candidates[0]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const reportPath = await resolveReportPath(options.report);
  const reportRaw = await fs.readFile(reportPath, "utf8");
  const report = JSON.parse(reportRaw);

  const candidates = (report?.results || [])
    .filter((item) => item?.status === "ok" && item?.product_id && item?.original_url)
    .filter((item) => !options.productId || Number(item.product_id) === options.productId)
    .slice(0, options.limit || undefined);

  if (!candidates.length) {
    console.log("Nenhum item elegivel encontrado no relatorio para restauracao.");
    return;
  }

  console.log(`Restauracao usando relatorio: ${reportPath}`);
  console.log(options.dryRun ? "Modo DRY RUN: sem atualizar o banco." : "Modo APPLY: restaurando foto_url original.");
  console.log(`Itens elegiveis: ${candidates.length}`);

  const results = [];
  for (const item of candidates) {
    const prefix = `#${item.product_id} ${item.nome}`;
    try {
      if (!options.dryRun) {
        const { error } = await supabase
          .from("products")
          .update({ foto_url: item.original_url })
          .eq("id", item.product_id);

        if (error) {
          throw new Error(error.message);
        }
      }

      console.log(`${prefix} -> restaurado`);
      results.push({
        status: "ok",
        product_id: item.product_id,
        nome: item.nome,
        restored_url: item.original_url,
        backup_url: item.backup_url || null,
        applied: !options.dryRun,
      });
    } catch (error) {
      console.error(`${prefix} -> erro: ${error.message}`);
      results.push({
        status: "error",
        product_id: item.product_id,
        nome: item.nome,
        restored_url: item.original_url,
        backup_url: item.backup_url || null,
        applied: false,
        error: error.message,
      });
    }
  }

  const restoreReport = {
    summary: {
      source_report: reportPath,
      dry_run: options.dryRun,
      total: results.length,
      ok: results.filter((item) => item.status === "ok").length,
      failed: results.filter((item) => item.status !== "ok").length,
      restored_at: new Date().toISOString(),
    },
    results,
  };

  const outPath = path.join(backendDir, "reports", `product-image-restore-${Date.now()}.json`);
  await fs.writeFile(outPath, JSON.stringify(restoreReport, null, 2), "utf8");
  console.log(`Relatorio salvo em: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
