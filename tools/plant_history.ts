// tools/plant_history.ts
import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { listPlants, readCsv, slugify, DIAGNOSES_CSV } from "../src/storage.ts";

interface DiagnosisRow {
  date: string;
  plantId: string;
  plantName: string;
  species: string;
  health: string;
  issues: string;
  summary: string;
}

function readDiagnoses(): DiagnosisRow[] {
  return readCsv(DIAGNOSES_CSV)
    .slice(1)
    .map((r) => ({
      date: r[0] ?? "",
      plantId: r[2] ?? "",
      plantName: r[3] ?? "",
      species: r[4] ?? "",
      health: r[5] ?? "",
      issues: r[6] ?? "",
      summary: r[7] ?? "",
    }));
}

export default {
  description:
    "List registered plants and their diagnosis history. With no arguments, returns the full roster with each plant's latest health status. With a plant_name, returns that plant's complete checkup history so trends are visible (getting better, getting worse). Use when the user asks about their plants, a specific plant's history, or how a plant has been doing over time.",
  defaultRiskLevel: "low" as const,
  input_schema: {
    type: "object",
    properties: {
      plant_name: {
        type: "string",
        description:
          "Optional plant name or id. When given, returns the full history for that plant only.",
      },
      limit: {
        type: "number",
        description:
          "Optional cap on the number of history entries returned per plant. Default 10.",
      },
    },
  },
  async execute(
    input: Record<string, unknown>,
    _ctx: ToolContext,
  ): Promise<ToolExecutionResult> {
    const nameFilter =
      typeof input.plant_name === "string" && input.plant_name.trim()
        ? input.plant_name.trim()
        : null;
    const limit =
      typeof input.limit === "number" && input.limit > 0
        ? Math.floor(input.limit)
        : 10;

    try {
      const plants = listPlants();
      const diagnoses = readDiagnoses();

      if (plants.length === 0 && diagnoses.length === 0) {
        return {
          content:
            "No plants registered yet. Diagnose a plant with a plant_name to start its history.",
          isError: false,
        };
      }

      if (nameFilter) {
        const id = slugify(nameFilter);
        const needle = nameFilter.toLowerCase();
        const plant = plants.find(
          (p) => p.plantId === id || p.name.toLowerCase() === needle,
        );
        const history = diagnoses
          .filter(
            (d) =>
              d.plantId === (plant?.plantId ?? id) ||
              d.plantName.toLowerCase() === needle,
          )
          .slice(-limit);

        if (!plant && history.length === 0) {
          return {
            content: `No plant found matching "${nameFilter}". Registered plants: ${
              plants.map((p) => p.name).join(", ") || "none"
            }.`,
            isError: false,
          };
        }

        const lines: string[] = [];
        if (plant) {
          lines.push(
            `${plant.name}${plant.species ? ` (${plant.species})` : ""}${
              plant.location ? `, lives in ${plant.location}` : ""
            }, registered ${plant.dateAdded}.`,
          );
        }
        lines.push(`Checkups: ${history.length}`);
        for (const d of history) {
          lines.push(
            `- ${d.date}: ${d.health.replace(/_/g, " ")}${
              d.issues ? `. Issues: ${d.issues}` : ", no issues"
            }. ${d.summary}`,
          );
        }
        return { content: lines.join("\n"), isError: false };
      }

      const lines: string[] = [`Registered plants: ${plants.length}`];
      for (const p of plants) {
        const latest = diagnoses.filter((d) => d.plantId === p.plantId).at(-1);
        lines.push(
          `- ${p.name}${p.species ? ` (${p.species})` : ""}: ${
            latest
              ? `last checkup ${latest.date}, ${latest.health.replace(/_/g, " ")}`
              : "no checkups yet"
          }`,
        );
      }
      return { content: lines.join("\n"), isError: false };
    } catch (err) {
      return {
        content: `error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};
