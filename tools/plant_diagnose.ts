// tools/plant_diagnose.ts
import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import {
  loadImage,
  diagnosePlant,
  type Diagnosis,
} from "../src/diagnose.ts";
import {
  ensureCsv,
  appendCsv,
  findOrCreatePlant,
  DIAGNOSES_CSV,
  DIAGNOSES_HEADERS,
} from "../src/storage.ts";

const SEVERITY_ICON: Record<string, string> = {
  low: "[low]",
  medium: "[medium]",
  high: "[HIGH]",
};

function formatDiagnosis(d: Diagnosis, plantLabel: string | null): string {
  if (!d.is_plant) {
    return "That photo does not appear to contain a plant. Nothing was logged.";
  }
  const lines: string[] = [];
  const species =
    d.species.common_name +
    (d.species.scientific_name ? ` (${d.species.scientific_name})` : "");
  lines.push(
    `Species: ${species || "unknown"} [confidence: ${d.species.confidence}]`,
  );
  if (plantLabel) lines.push(`Patient: ${plantLabel}`);
  lines.push(`Health: ${d.health.replace(/_/g, " ")}`);
  lines.push("");
  lines.push(`Summary: ${d.summary}`);

  if (d.issues.length > 0) {
    lines.push("");
    lines.push("Issues found:");
    for (const issue of d.issues) {
      lines.push(
        `- ${SEVERITY_ICON[issue.severity] ?? ""} ${issue.name}: ${issue.evidence} Likely cause: ${issue.likely_cause}`,
      );
    }
  }

  if (d.care_plan.immediate.length > 0) {
    lines.push("");
    lines.push("Do today:");
    for (const step of d.care_plan.immediate) lines.push(`- ${step}`);
  }
  if (d.care_plan.ongoing.length > 0) {
    lines.push("");
    lines.push("Ongoing care:");
    for (const step of d.care_plan.ongoing) lines.push(`- ${step}`);
  }

  const env = d.care_plan.environment;
  const envParts = [
    env.light && `Light: ${env.light}`,
    env.water && `Water: ${env.water}`,
    env.humidity && `Humidity: ${env.humidity}`,
    env.soil && `Soil: ${env.soil}`,
  ].filter(Boolean);
  if (envParts.length > 0) {
    lines.push("");
    lines.push("Environment:");
    for (const part of envParts) lines.push(`- ${part}`);
  }

  if (d.prognosis) {
    lines.push("");
    lines.push(`Prognosis: ${d.prognosis}`);
  }
  return lines.join("\n");
}

export default {
  description:
    "Diagnose a plant from a photo. Takes a path to an image file (for example a conversation attachment), identifies the species, assesses health, lists visible issues with evidence, and returns a care plan. Automatically logs the diagnosis to the plant's history when a plant name is given. Use whenever the user shares a photo of a plant and wants to know what it is, whether it is healthy, or how to care for it.",
  defaultRiskLevel: "low" as const,
  input_schema: {
    type: "object",
    properties: {
      photo_path: {
        type: "string",
        description:
          "Absolute path to the plant photo (jpg, png, webp, or gif). Conversation attachments live under /workspace/conversations/<conversation-id>/attachments/.",
      },
      plant_name: {
        type: "string",
        description:
          "Optional nickname for this plant (for example 'Fernando the fern'). Links the diagnosis to a plant in the registry so repeat checkups build a history. Omit for one-off diagnoses.",
      },
      location: {
        type: "string",
        description:
          "Optional spot where the plant lives (for example 'living room window').",
      },
      context: {
        type: "string",
        description:
          "Optional owner-provided context: symptoms noticed, watering habits, how long it has looked like this.",
      },
    },
    required: ["photo_path"],
  },
  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolExecutionResult> {
    const photoPath = String(input.photo_path ?? "").trim();
    if (!photoPath) {
      return { content: "error: photo_path is required", isError: true };
    }
    const plantName =
      typeof input.plant_name === "string" && input.plant_name.trim()
        ? input.plant_name.trim()
        : null;
    const location =
      typeof input.location === "string" ? input.location.trim() : "";
    const userContext =
      typeof input.context === "string" ? input.context.trim() : "";

    try {
      const image = loadImage(photoPath);
      const { diagnosis, rawText, model } = await diagnosePlant(
        image,
        userContext,
        ctx.signal,
      );

      if (!diagnosis) {
        return {
          content: `The vision model replied but the response could not be parsed as a structured diagnosis. Raw response:\n\n${rawText}`,
          isError: false,
        };
      }

      let plantLabel: string | null = null;
      if (diagnosis.is_plant && plantName) {
        const species =
          diagnosis.species.common_name || diagnosis.species.scientific_name;
        const record = findOrCreatePlant(plantName, species, location);
        plantLabel = `${record.name} (id: ${record.plantId})`;

        const now = new Date();
        ensureCsv(DIAGNOSES_CSV, DIAGNOSES_HEADERS);
        appendCsv(DIAGNOSES_CSV, [
          now.toISOString().slice(0, 10),
          now.toISOString(),
          record.plantId,
          record.name,
          species,
          diagnosis.health,
          diagnosis.issues.map((i) => `${i.name} (${i.severity})`).join("; "),
          diagnosis.summary,
          photoPath,
        ]);
      }

      const footer = plantLabel
        ? `\n\nLogged to ${plantLabel}'s history. Model: ${model}.`
        : `\n\nNot logged (no plant_name given). Model: ${model}.`;
      return {
        content: formatDiagnosis(diagnosis, plantLabel) + footer,
        isError: false,
      };
    } catch (err) {
      return {
        content: `error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};
