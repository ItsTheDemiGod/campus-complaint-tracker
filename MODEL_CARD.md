# Model Card: AI Ticket Triage

## Overview
When a student files a complaint, the system asks a Gemini model to suggest a **category** and **priority** from the description and location. The suggestion speeds up filing and gives admins better urgency signals. The student always has the final say.

## Input / Output schema
**Input** (`POST /api/ai/suggest-triage`, authenticated): `{ description: string (5–2000 chars), location: string }`

**Output** (200): `{ category: hostel|lab|wifi|electrical|plumbing|other, priority: low|medium|high|critical, confidence: number 0–1, reasoning: string (one sentence) }`
Failure: `503 {error: "AI suggestion unavailable"}`. Shape is enforced with Gemini structured output (`responseMimeType: application/json` + `responseSchema` with enums), then re-validated server-side before use.

## Model & provider
- Provider: Google Gemini API via the `@google/genai` SDK (the current official SDK).
- Model: `gemini-3.1-flash-lite` (override with `GEMINI_MODEL`). Chosen as the fast, cheap Flash-Lite tier, which suits short classification. Temperature 0, 8 s timeout.
- Model names change often; if the API returns model-not-found, check <https://ai.google.dev/gemini-api/docs/models>.

## How it's used in the system
Human-in-the-loop with **graceful degradation**:
- Confidence **≥ 0.6**: category and priority dropdowns are pre-filled, with a note showing confidence and reasoning. Fully editable.
- Confidence **< 0.6**: nothing is auto-filled; a muted hint shows the guess and that it wasn't confident enough. The student chooses manually.
- API error, timeout, invalid output, or missing key: the backend returns 503, the form shows "AI suggestion unavailable right now" and works normally. The AI never blocks ticket submission.
- Each ticket stores the suggestion, confidence, reasoning, and whether the student kept the category and priority (`ai_*_accepted`). Tickets with no suggestion keep these null. Admins, staff, and students can see this on the ticket details.

## Known limitations
- Tiny real ticket dataset, so evaluation uses a hand-built test set rather than historical data.
- English only.
- No fairness or bias auditing was performed (out of project scope).
- Confidence is the model's own self-reported estimate, not independently calibrated.
- The 0.6 threshold is a judgment call, not tuned on data.
- Complaint text goes to a third-party API (don't include sensitive personal details).

## Evaluation results
> **Placeholder.** Run `node backend/scripts/evaluateTriage.js` after adding a real `GEMINI_API_KEY` and paste the results here (raw output in `backend/scripts/eval-results.json`).

## Monitoring in production
- **Analytics tab → "AI suggestion acceptance rate"**: share of AI-suggested tickets where the student kept the suggested category. A falling rate signals the model is not being trusted or is drifting.
- Server logs: every call logs `[aiTriage] ok|FAILED` with model, latency, and result, so failure rate and latency can be tracked.
- Priority acceptance and per-category override rates can be queried from `tickets.ai_*` columns.
