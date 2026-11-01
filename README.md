# Circadian OS

**A context-aware engineering session planner.** When your energy drops, the room gets loud, or you are moving, Circadian OS reshapes a heavy task into three small steps and refreshes the next moves around it.

Built for the DevDay Exchange Community Hackathon, London · Sunday 1 November 2026.

## Run it locally

Requires Python 3.10 or newer.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Optional: add OPENAI_API_KEY to .env to use live Structured Outputs.
uvicorn app:app --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Without an API key, the deterministic planner runs immediately. With a key, the app uses the OpenAI Python SDK and the Responses API. `OPENAI_MODEL` can override the default `gpt-6-astra`. If the API is unavailable or returns an incomplete plan, the local deterministic plan is used so the demo can continue.

## The 90-second demo

1. **0–10s:** Start with the seeded, synthetic engineering task and show the live Cognitive Battery.
2. **10–25s:** Drag **HRV / Energy** down to about 20%, **Typing fatigue** up to 75%, and **Ambient mic** to around −17 dBFS. Choose **Noisy Cafe** (or **In Transit w/ AirPods**). The score updates locally as the signals change.
3. **25–48s:** Click **Mutate State**. The app recalculates the score, requests an exactly three-step plan (or returns the instant deterministic equivalent), marks the **Shadow Worker PR drafted** preview, and reshuffles the schedule.
4. **48–68s:** Show the Apple Shortcuts JSON preview: AirPods Noise Cancellation for Noisy Cafe, a Watch tap on low capacity, and a recovery prompt for Dynamic Island. Click **Copy JSON** if useful.
5. **68–84s:** Play **Context briefing** to hear the transition and first step through the browser's speech synthesis.
6. **84–90s:** Close on the three micro-steps and the single-loop flow.

The interface and local fallback do not need a key, account, mic permission, or paired Apple device. For the live microphone, press **Start live mic** and grant browser permission; the manual noise slider remains usable if permission is declined.

## What is live, estimated, or simulated

- **HRV / Energy, typing fatigue, location and deadline** are explicit check-in controls for this MVP. There is no Apple Watch, keyboard hook, GPS or calendar connection.
- **Ambient mic** uses WebAudio RMS amplitude on-device. It displays relative dBFS and is not calibrated sound-pressure dB. Raw audio is neither recorded nor sent.
- The **Cognitive Battery** is a transparent planning heuristic, not a medical or physiological measurement. It combines energy (45%), relative quietness (18%), typing capacity (18%), time buffer (12%) and location capacity (7%). Location capacity is 100 for Quiet Desk, 62 for Noisy Cafe and 42 for In Transit.
- If energy is below 36, score below 48, typing fatigue at least 60, mic level above −22 dBFS, or location is In Transit, the state machine switches to micro-sprint mode and asks for three 1–5 minute steps.
- The **Shadow Worker** status is a demo preview. No code is delegated, no branch is created and no pull request is opened.
- **Apple ecosystem actuation** is a copyable JSON preview only. There is no paired-device action and the app sends no webhook. Quiet Desk maps to AirPods Off, Noisy Cafe to Noise Cancellation, and In Transit to Transparency; low capacity requests a Watch tap and a Dynamic Island recovery prompt.
- **Context briefing** uses the browser's `SpeechSynthesis` voice after a user click. It does not call OpenAI TTS.

When an OpenAI key is configured, the current task text and the numeric telemetry are sent to OpenAI to generate the plan. Microphone audio never leaves the browser. The app does not store session data. Use the supplied synthetic task for screen recordings and keep `.env` out of Git.

## How Codex built the multi-signal state machine

Codex started by inspecting the empty workspace and checking the available runtimes. Node/npm were not installed, so the implementation uses the available Python environment with FastAPI and serves a lightweight single-page dashboard without a JavaScript build step. It then checked the current OpenAI Responses API and Structured Outputs documentation before choosing the SDK's typed parse path.

The state loop is implemented in `app.py`:

1. `MutationRequest` validates the four telemetry signals, task and deadline.
2. `compute_battery` applies the visible weighted heuristic; `should_microstep` applies explicit thresholds.
3. With `OPENAI_API_KEY`, `client.responses.parse(..., text_format=FocusPlan)` returns a Pydantic-validated plan with exactly three steps. Without a key, `deterministic_plan` immediately returns the same shape.
4. One response carries the transition summary, Shadow Worker preview, reshuffled schedule and Shortcuts payload. The browser renders that shared state and speaks the summary only after the user presses Play.

This keeps model output, fallbacks and UI rendering on one schema, and makes the decision path demoable rather than hiding it behind a black-box score.

## Verify

```bash
source .venv/bin/activate
python -m unittest discover -s tests -v
```

The tests cover the local fallback, low-energy transition, three-step plan, schedule, Apple payload mappings, request validation and the SDK Structured Outputs call shape. The OpenAI test uses a stub; it does not spend API credits.

## Credits and docs

- No starter repository, copied code template, stock image or third-party asset was used. The orbit mark and layout are authored in this project.
- Display fonts are DM Sans, DM Mono and Manrope, loaded from Google Fonts when online.
- [Codex documentation](https://developers.openai.com/codex) and [Codex quickstart](https://developers.openai.com/codex/quickstart) informed the build workflow. These URLs currently redirect into OpenAI's Learn documentation.
- The OpenAI path follows the [Responses API Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) and [OpenAI API quickstart](https://developers.openai.com/api/docs/quickstart).
- The [Structured Outputs Cookbook introduction](https://developers.openai.com/cookbook/examples/structured_outputs_intro) is marked archived; it was treated as background only, and current API syntax was taken from the docs above.
- [Hackathon event page](https://luma.com/dde-ldn-hack).

## Hackathon submission checklist

- [ ] Publish this project in a public GitHub repository and add its URL to the submission.
- [ ] Record the synthetic-task journey above in a video no longer than 90 seconds; add the video link here or to the submission.
- [ ] Keep `.env`, API keys, personal task text and identifiable desktop/browser content out of the repo and recording.
- [ ] Test the public repository and video links in a signed-out browser.

## Scope for the next build

Real Watch HRV, passive typing telemetry, calendar/location integrations, background coding work, direct Shortcuts delivery, and native AirPods/Watch/Dynamic Island controls need platform-specific pairing and permissions. This MVP keeps those seams visible while completing one useful state-to-plan journey.
