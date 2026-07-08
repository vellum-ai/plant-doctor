// src/diagnose.ts
// Vision-model plant diagnosis. Routes through the workspace's configured
// inference credentials via getConfiguredProvider, picking a vision-capable
// profile when the active one cannot process images.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  getConfiguredProvider,
  getModelProfiles,
  doesSupportVision,
} from "@vellumai/plugin-api";
import type { Provider } from "@vellumai/plugin-api";
import { getConfig } from "./storage.ts";

const MEDIA_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export interface DiagnosisIssue {
  name: string;
  severity: "low" | "medium" | "high";
  evidence: string;
  likely_cause: string;
}

export interface Diagnosis {
  is_plant: boolean;
  species: {
    common_name: string;
    scientific_name: string;
    confidence: "high" | "medium" | "low";
  };
  health: "healthy" | "minor_issues" | "stressed" | "sick" | "critical";
  issues: DiagnosisIssue[];
  care_plan: {
    immediate: string[];
    ongoing: string[];
    environment: {
      light: string;
      water: string;
      humidity: string;
      soil: string;
    };
  };
  prognosis: string;
  summary: string;
}

const SYSTEM_PROMPT = `You are an expert botanist and plant pathologist. You diagnose houseplants and garden plants from photos.

Given a photo of a plant, respond with ONLY a JSON object (no markdown fences, no prose before or after) matching this exact shape:

{
  "is_plant": boolean,
  "species": { "common_name": string, "scientific_name": string, "confidence": "high" | "medium" | "low" },
  "health": "healthy" | "minor_issues" | "stressed" | "sick" | "critical",
  "issues": [ { "name": string, "severity": "low" | "medium" | "high", "evidence": string, "likely_cause": string } ],
  "care_plan": {
    "immediate": [string],
    "ongoing": [string],
    "environment": { "light": string, "water": string, "humidity": string, "soil": string }
  },
  "prognosis": string,
  "summary": string
}

Rules:
- If the photo does not contain a plant, set is_plant to false and leave the other fields as empty strings, empty arrays, or "healthy".
- Ground every issue in visible evidence from the photo (leaf color, spots, wilting, soil condition, pests). Do not invent problems you cannot see.
- "immediate" actions are things to do today. "ongoing" is the weekly and monthly routine.
- Environment recommendations should be specific: hours of light, watering frequency, humidity percent range, soil mix.
- If the plant is healthy, say so plainly and keep the care plan focused on maintenance.
- Keep the summary to 2 or 3 sentences, plain language, no jargon.`;

export interface LoadedImage {
  data: string;
  mediaType: string;
  sizeBytes: number;
}

export function loadImage(photoPath: string): LoadedImage {
  const resolved = path.resolve(photoPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`photo not found at ${resolved}`);
  }
  const ext = path.extname(resolved).toLowerCase();
  const mediaType = MEDIA_TYPES[ext];
  if (!mediaType) {
    throw new Error(
      `unsupported image type "${ext}". Supported: ${Object.keys(MEDIA_TYPES).join(", ")}`,
    );
  }
  const config = getConfig<{ maxImageBytes?: number }>();
  const maxBytes = config?.maxImageBytes ?? 10 * 1024 * 1024;
  const stat = fs.statSync(resolved);
  if (stat.size > maxBytes) {
    throw new Error(
      `image is ${(stat.size / 1024 / 1024).toFixed(1)} MB, over the ${(maxBytes / 1024 / 1024).toFixed(0)} MB limit. Resize it first.`,
    );
  }
  return {
    data: fs.readFileSync(resolved).toString("base64"),
    mediaType,
    sizeBytes: stat.size,
  };
}

/**
 * Resolve a vision-capable provider. Order:
 * 1. config.visionProfile when set,
 * 2. the active profile when it supports vision,
 * 3. the first non-disabled profile that supports vision.
 */
export async function resolveVisionProvider(): Promise<{
  provider: Provider;
  profileKey: string | null;
}> {
  const config = getConfig<{ visionProfile?: string | null }>();

  if (config?.visionProfile) {
    const provider = await getConfiguredProvider("inference", {
      overrideProfile: config.visionProfile,
      forceOverrideProfile: true,
    });
    if (provider) return { provider, profileKey: config.visionProfile };
  }

  // Always pin an explicit vision-capable profile with forceOverrideProfile.
  // Without it the override layers below any per-call-site pin the workspace
  // has (for example a cheap text-only profile on the inference call site),
  // and the pinned non-vision model wins.
  const profiles = await Promise.resolve(getModelProfiles());
  const active = profiles.find((p) => p.isActive && !p.isDisabled);
  const candidates = [
    ...(active ? [active] : []),
    ...profiles.filter((p) => !p.isDisabled && p.key !== active?.key),
  ];

  for (const p of candidates) {
    if (!(await Promise.resolve(doesSupportVision(p)))) continue;
    const provider = await getConfiguredProvider("inference", {
      overrideProfile: p.key,
      forceOverrideProfile: true,
    });
    if (provider) return { provider, profileKey: p.key };
  }

  throw new Error(
    "no vision-capable inference profile is configured. Enable a profile whose model can process images, or set visionProfile in the plugin's config.json.",
  );
}

function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}

export function parseDiagnosis(raw: string): Diagnosis | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Diagnosis;
    if (typeof parsed.is_plant !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function diagnosePlant(
  image: LoadedImage,
  userContext: string,
  signal?: AbortSignal,
): Promise<{ diagnosis: Diagnosis | null; rawText: string; model: string }> {
  const { provider } = await resolveVisionProvider();

  const promptText = userContext
    ? `Diagnose this plant. Owner's context: ${userContext}`
    : "Diagnose this plant.";

  const response = await provider.sendMessage(
    [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.mediaType,
              data: image.data,
            },
          },
          { type: "text", text: promptText },
        ],
      },
    ],
    {
      systemPrompt: SYSTEM_PROMPT,
      signal,
    },
  );

  const rawText = extractText(
    response.content as Array<{ type: string; text?: string }>,
  );
  return {
    diagnosis: parseDiagnosis(rawText),
    rawText,
    model: response.model,
  };
}
