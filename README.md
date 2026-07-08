# Plant Doctor

Photo in, diagnosis out. A Vellum plugin that identifies plants, assesses
their health from a photo, and returns a concrete care plan. Named plants get
a persistent checkup history so you can see whether they are getting better
or worse.

## What it does

- **Diagnose from a photo.** Send your assistant a picture of a plant and ask
  what's wrong. The plugin runs it through your configured vision model and
  returns the species, a health verdict, visible issues with evidence, and a
  care plan split into "do today" and "ongoing".
- **Track every plant.** Give a plant a name and each diagnosis is logged to
  its history. Ask "how is Fernando doing" and get the trend, not just the
  latest snapshot.
- **No extra API keys.** Inference routes through the credentials your
  assistant already uses, via the plugin API's configured-provider handle.

## Surfaces

| Surface | Name | Purpose |
| ------- | ---- | ------- |
| Tool | `plant_diagnose` | Photo path in, structured diagnosis + care plan out. Logs to history when a plant name is given. |
| Tool | `plant_history` | Roster of registered plants, or one plant's full checkup history. |
| Skill | `plant-doctor` | Teaches the assistant the diagnosis and checkup workflows. |
| Hook | `init` | Prepares the data directory and CSV files. |

## Storage

Plain CSV in the plugin's `data/` directory (preserved across upgrades):

- `plants.csv`: the registry (id, name, species, location, date added).
- `diagnoses.csv`: one row per checkup (date, plant, health, issues, summary, photo path).

## Configuration

`config.json` at the plugin root:

```json
{
  "visionProfile": null,
  "maxImageBytes": 10485760
}
```

- `visionProfile`: pin diagnoses to a specific inference profile key. When
  null, the plugin uses the active profile if it supports vision, otherwise
  the first vision-capable profile it finds.
- `maxImageBytes`: reject images larger than this (default 10 MB).

## Install

```
assistant plugins install plant-doctor
```

Or from a repo URL:

```
assistant plugins install https://github.com/<owner>/plant-doctor
```

## Supported image types

jpg, jpeg, png, webp, gif.
