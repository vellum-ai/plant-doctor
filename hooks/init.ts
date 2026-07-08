// hooks/init.ts
import type { InitContext } from "@vellumai/plugin-api";
import {
  setDataDir,
  setConfig,
  ensureCsv,
  PLANTS_CSV,
  PLANTS_HEADERS,
  DIAGNOSES_CSV,
  DIAGNOSES_HEADERS,
} from "../src/storage.ts";

export default async function init(ctx: InitContext): Promise<void> {
  setDataDir(ctx.pluginStorageDir);
  setConfig(ctx.config);
  ensureCsv(PLANTS_CSV, PLANTS_HEADERS);
  ensureCsv(DIAGNOSES_CSV, DIAGNOSES_HEADERS);
  ctx.logger?.info?.("plant-doctor: initialized");
}
