---
name: plant-doctor
description: >-
  Diagnose plants from photos and manage their care history. Use when the
  user shares a photo of a plant, asks whether a plant is healthy, asks what
  is wrong with a plant, asks how to care for a plant, or asks about their
  plants' checkup history.
metadata:
  emoji: "🌱"
  vellum:
    display-name: "Plant Doctor"
    activation-hints:
      - "User shares a photo of a plant or leaves"
      - "User asks what's wrong with their plant"
      - "User asks how to care for or water a plant"
      - "User asks about a plant's health history or past checkups"
    avoid-when:
      - "User asks about plants in a cooking or nutrition context"
      - "User asks about gardening business, landscaping quotes, or plant shopping"
---

Diagnose plants from photos and track each plant's health over time.

## Workflow: photo diagnosis

1. **Find the photo.** Conversation attachments land under
   `/workspace/conversations/<conversation-id>/attachments/`. Use the most
   recent image the user shared. If the user references a plant photo but none
   is attached, ask them to send one.
2. **Get the plant's name.** If the user has named the plant before (check
   with `plant_history`), reuse that name so the checkup lands in the right
   history. If it looks like a new plant, ask for a nickname once, and only
   once. If they don't want to name it, diagnose without `plant_name`.
3. **Call `plant_diagnose`** with `photo_path`, plus `plant_name`,
   `location`, and `context` when known. Pass along anything the user said
   about symptoms or watering habits in `context`; it materially improves the
   diagnosis.
4. **Present the result.** Lead with the health verdict and the summary, then
   the issues, then the care plan. Keep the tone warm and practical. If the
   diagnosis found high-severity issues, put the "do today" steps front and
   center.

## Workflow: checkups and history

- For "how are my plants" style questions, call `plant_history` with no
  arguments and give a one-line status per plant.
- For a specific plant, call `plant_history` with the `plant_name` and look
  for the trend across checkups: improving, stable, or declining. Say which
  way it is trending, not just the latest status.
- If a plant was sick at the last checkup and the user shares a new photo,
  compare the new diagnosis against the previous one and say explicitly
  whether the treatment is working.

## Notes

- The diagnosis runs on the workspace's configured vision model. If the tool
  reports that no vision-capable model is available, tell the user which
  profile to enable rather than retrying blindly.
- Diagnoses without a `plant_name` are not logged. That is intentional for
  one-off "what is this plant" questions.
- Do not invent symptoms or care advice beyond what the tool returned. If the
  user asks a follow-up the diagnosis does not cover, say so and offer to run
  a fresh checkup with a closer photo (top of soil, underside of leaves).
