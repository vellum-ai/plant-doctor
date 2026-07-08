// src/storage.ts
// CSV-backed storage for the plant registry and diagnosis history.
// Works both in-process (init hook sets the data dir) and in a sandbox
// subprocess (falls back to <pluginDir>/data), same pattern as
// fitness-companion.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_DATA_DIR = path.join(PLUGIN_DIR, "data");
const CONFIG_PATH = path.join(PLUGIN_DIR, "config.json");

let dataDir = "";
let pluginConfig: unknown = null;
let configLoaded = false;

export function setDataDir(dir: string): void {
  dataDir = dir;
}

export function getDataDir(): string {
  return dataDir || DEFAULT_DATA_DIR;
}

export function setConfig(config: unknown): void {
  pluginConfig = config;
  configLoaded = true;
}

export function getConfig<T = Record<string, unknown>>(): T {
  if (!configLoaded) {
    try {
      pluginConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    } catch {
      pluginConfig = null;
    }
    configLoaded = true;
  }
  return (pluginConfig ?? {}) as T;
}

export const PLANTS_CSV = "plants.csv";
export const DIAGNOSES_CSV = "diagnoses.csv";

export const PLANTS_HEADERS = [
  "plant_id",
  "name",
  "species",
  "location",
  "date_added",
  "notes",
];

export const DIAGNOSES_HEADERS = [
  "date",
  "timestamp",
  "plant_id",
  "plant_name",
  "species_guess",
  "health",
  "issues",
  "summary",
  "photo_path",
];

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function ensureCsv(filename: string, headers: string[]): void {
  const dir = getDataDir();
  const filepath = path.join(dir, filename);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filepath)) {
    fs.writeFileSync(filepath, headers.join(",") + "\n");
  }
}

export function appendCsv(
  filename: string,
  values: (string | number | null | undefined)[],
): void {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(
    path.join(dir, filename),
    values.map(csvEscape).join(",") + "\n",
  );
}

/** Minimal CSV parser handling quoted fields with embedded commas/quotes/newlines. */
export function readCsv(filename: string): string[][] {
  const filepath = path.join(getDataDir(), filename);
  if (!fs.existsSync(filepath)) return [];
  const text = fs.readFileSync(filepath, "utf-8");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

export interface PlantRecord {
  plantId: string;
  name: string;
  species: string;
  location: string;
  dateAdded: string;
  notes: string;
}

export function listPlants(): PlantRecord[] {
  const rows = readCsv(PLANTS_CSV);
  return rows.slice(1).map((r) => ({
    plantId: r[0] ?? "",
    name: r[1] ?? "",
    species: r[2] ?? "",
    location: r[3] ?? "",
    dateAdded: r[4] ?? "",
    notes: r[5] ?? "",
  }));
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Find a plant by name (case-insensitive, id or name match), or create it.
 * Returns the registry record.
 */
export function findOrCreatePlant(
  name: string,
  species: string,
  location: string,
): PlantRecord {
  const plants = listPlants();
  const needle = name.toLowerCase().trim();
  const existing = plants.find(
    (p) =>
      p.plantId === slugify(name) || p.name.toLowerCase().trim() === needle,
  );
  if (existing) return existing;

  const record: PlantRecord = {
    plantId: slugify(name) || `plant-${Date.now()}`,
    name: name.trim(),
    species,
    location,
    dateAdded: new Date().toISOString().slice(0, 10),
    notes: "",
  };
  ensureCsv(PLANTS_CSV, PLANTS_HEADERS);
  appendCsv(PLANTS_CSV, [
    record.plantId,
    record.name,
    record.species,
    record.location,
    record.dateAdded,
    record.notes,
  ]);
  return record;
}
