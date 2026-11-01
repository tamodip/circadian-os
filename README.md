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

## Demo video

[Watch the 87-second live product demo (MP4)](https://raw.githubusercontent.com/tamodip/circadian-os/main/demo-video.mp4). It records the running app with synthetic telemetry and the supplied demo task, including one live OpenAI call whose 12.7-second wait is trimmed and labelled on screen. Narration and the briefing audio in the video use macOS speech; in the app, **Context briefing** speaks through browser SpeechSynthesis after the user presses Play.

## Demo flow

1. Start with the seeded, synthetic engineering task and the live Cognitive Battery.
2. Lower **HRV / Energy**, raise **Typing fatigue** and ambient noise, and choose **Noisy Cafe**. The score updates as the signals change.
3. Click **Mutate State**. The app recalculates the score, requests an exactly three-step plan (or returns the instant deterministic equivalent), shows the **Shadow Worker PR drafted** preview, and reshuffles the schedule.
4. Show the Apple Shortcuts JSON preview: AirPods Noise Cancellation for Noisy Cafe, a Watch tap on low capacity, and a recovery prompt for Dynamic Island.
5. Play **Context briefing** to hear the transition and first step through browser speech synthesis.

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

- [x] Published as a public repository: [github.com/tamodip/circadian-os](https://github.com/tamodip/circadian-os).
- [x] Add the 87-second MP4 product demo; the public link above does not require sign-in.
- [x] Keep `.env`, API keys and personal task text out of the repository; use the supplied synthetic task in the recording.
- [ ] Add the public video URL to the hackathon submission form.

## Scope for the next build

Real Watch HRV, passive typing telemetry, calendar/location integrations, background coding work, direct Shortcuts delivery, and native AirPods/Watch/Dynamic Island controls need platform-specific pairing and permissions. This MVP keeps those seams visible while completing one useful state-to-plan journey.
