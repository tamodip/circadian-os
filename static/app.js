const $ = (id) => document.getElementById(id);
function setVisibility(id, visible) {
  const element = $(id);
  element.hidden = !visible;
  if (visible) element.style.removeProperty('display');
  else element.style.display = 'none';
}
setVisibility('loadingPlan', false);
setVisibility('planResult', false);
setVisibility('errorMessage', false);
const energy = $('energy');
const noise = $('noise');
const fatigue = $('fatigue');
const locationControl = $('location');
const deadline = $('deadline');
let micStream = null;
let audioContext = null;
let analyserFrame = null;
let lastSnapshot = null;
let latestBriefing = '';
let currentUtterance = null;

const LOCATION_LABELS = { quiet_desk: 'Quiet Desk', noisy_cafe: 'Noisy Cafe', in_transit: 'In Transit' };
const LOCATION_CAPACITY = { quiet_desk: 100, noisy_cafe: 62, in_transit: 42 };
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const percent = (value, max) => Math.round((value / max) * 100);

function currentSignals() {
  return {
    energy: Number(energy.value),
    noise_dbfs: Number(noise.value),
    typing_fatigue: Number(fatigue.value),
    location_mode: locationControl.value,
    deadline_minutes: Number(deadline.value),
  };
}

function calculateBattery(s) {
  const quietness = clamp((-s.noise_dbfs / 60) * 100, 0, 100);
  const typingCapacity = 100 - s.typing_fatigue;
  const timeBuffer = clamp((s.deadline_minutes / 120) * 100, 0, 100);
  return Math.round(s.energy * .45 + quietness * .18 + typingCapacity * .18 + timeBuffer * .12 + LOCATION_CAPACITY[s.location_mode] * .07);
}

function paintRange(control, color, fill) {
  control.style.background = `linear-gradient(90deg,${color} ${fill}%,#e8ece5 ${fill}%)`;
}

function scoreNow() {
  const s = currentSignals();
  const battery = calculateBattery(s);
  const quietness = clamp((-s.noise_dbfs / 60) * 100, 0, 100);
  $('energyValue').textContent = `${s.energy}%`;
  $('noiseValue').textContent = `${s.noise_dbfs < 0 ? '−' + Math.abs(s.noise_dbfs) : '0'} dBFS`;
  $('fatigueValue').textContent = `${s.typing_fatigue}%`;
  $('scoreEnergy').textContent = `${s.energy}%`;
  $('scoreNoise').textContent = `${Math.round(100 - quietness)}%`;
  $('scoreFatigue').textContent = `${s.typing_fatigue}%`;
  $('batteryValue').textContent = battery;
  $('scoreRing').style.background = `conic-gradient(#cbdc91 0 ${battery}%,#47614f ${battery}% 100%)`;
  const low = s.energy < 36 || battery < 48 || s.typing_fatigue >= 60 || s.noise_dbfs > -22 || s.location_mode === 'in_transit';
  $('scoreStatus').textContent = low ? 'MICRO-STEP MODE' : battery >= 75 ? 'DEEP WORK READY' : 'STEADY RHYTHM';
  $('scoreHeadline').textContent = low ? 'Shrink the next move.' : battery >= 75 ? 'Protect your focus.' : 'Find a steady groove.';
  $('scoreSubline').textContent = low ? 'High load detected. One small proof at a time.' : 'Current context supports a focused block.';
  paintRange(energy, '#bad097', percent(s.energy, 100));
  paintRange(noise, '#89a98e', percent(s.noise_dbfs + 60, 55));
  paintRange(fatigue, '#d8aa79', percent(s.typing_fatigue, 100));
  return { ...s, battery };
}

function renderSteps(plan) {
  const list = $('stepsList');
  list.replaceChildren();
  plan.steps.forEach((step) => {
    const row = document.createElement('li');
    row.className = 'step-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'step-check';
    checkbox.setAttribute('aria-label', `Mark ${step.title} complete`);
    const body = document.createElement('div');
    body.className = 'step-body';
    const title = document.createElement('div');
    title.className = 'step-title';
    title.textContent = step.title;
    const detail = document.createElement('div');
    detail.className = 'step-detail';
    detail.textContent = step.detail;
    const time = document.createElement('span');
    time.className = 'step-time';
    time.textContent = `${step.minutes} MIN`;
    body.append(title, detail);
    row.append(checkbox, body, time);
    checkbox.addEventListener('change', () => row.classList.toggle('done', checkbox.checked));
    list.append(row);
  });
}

function renderSchedule(schedule) {
  const list = $('scheduleList');
  list.replaceChildren();
  schedule.forEach((item, index) => {
    const row = document.createElement('li');
    row.className = 'schedule-item';
    if (index === 0) row.classList.add('current');
    const when = document.createElement('span');
    when.className = 'schedule-when';
    when.textContent = item.when;
    const task = document.createElement('span');
    task.className = 'schedule-task';
    task.textContent = item.task;
    const time = document.createElement('span');
    time.className = 'schedule-time';
    time.textContent = item.time;
    row.append(when, task, time);
    list.append(row);
  });
}

function renderApple(payload) {
  $('airpodsState').textContent = payload.airpods.noise_control.toUpperCase();
  $('watchState').textContent = payload.apple_watch.haptic === 'tap' ? 'HAPTIC: TAP' : 'HAPTIC: READY';
  $('islandState').textContent = payload.dynamic_island.state.replaceAll('_', ' ').toUpperCase();
  $('payloadJson').textContent = JSON.stringify(payload, null, 2);
}

async function mutateState() {
  const task = $('task').value.trim();
  if (task.length < 3) {
    showError('Add a short engineering task before mutating state.');
    $('task').focus();
    return;
  }
  const signals = currentSignals();
  const prior = lastSnapshot || scoreNow();
  const body = {
    task,
    ...signals,
    previous_energy: prior.energy,
    previous_battery: prior.battery,
    previous_location: prior.location_mode,
  };
  setVisibility('errorMessage', false);
  setVisibility('planResult', false);
  setVisibility('loadingPlan', true);
  $('mutateButton').disabled = true;
  $('sourceBadge').className = 'source-badge';
  $('sourceBadge').innerHTML = '<span class="source-dot"></span> MUTATING';
  $('transitionSummary').textContent = 'Combining telemetry…';
  try {
    const response = await fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || 'Mutation failed.');
    $('transitionSummary').textContent = payload.transition_summary;
    $('planMode').textContent = payload.plan.mode.replaceAll('-', ' ');
    $('focusDuration').textContent = `${payload.plan.focus_minutes} MIN`;
    $('planNudge').textContent = payload.plan.nudge;
    renderSteps(payload.plan);
    renderSchedule(payload.schedule);
    renderApple(payload.apple_payload);
    $('shadowStatus').textContent = payload.shadow_worker.status;
    $('shadowNote').textContent = payload.shadow_worker.note;
    $('shadowCard').classList.toggle('queued', payload.low_capacity);
    setVisibility('loadingPlan', false);
    setVisibility('planResult', true);
    $('sourceBadge').className = `source-badge ${payload.source === 'openai' ? 'live' : 'demo'}`;
    $('sourceBadge').innerHTML = `<span class="source-dot"></span> ${payload.source === 'openai' ? 'OPENAI STRUCTURED OUTPUT' : 'DETERMINISTIC FALLBACK'}`;
    latestBriefing = `${payload.transition_summary} ${payload.shadow_worker.status}. Your first step is ${payload.plan.steps[0].title}.`;
    $('briefingStatus').textContent = 'Ready · browser speech synthesis';
    $('briefingButton').disabled = false;
    $('briefingButton').classList.add('ready');
    lastSnapshot = { ...signals, battery: payload.battery };
    $('batteryValue').textContent = payload.battery;
    $('scoreRing').style.background = `conic-gradient(#cbdc91 0 ${payload.battery}%,#47614f ${payload.battery}% 100%)`;
  } catch (error) {
    setVisibility('loadingPlan', false);
    showError(`${error.message} Without OPENAI_API_KEY the deterministic fallback should still run; check the local server.`);
    $('sourceBadge').className = 'source-badge';
    $('sourceBadge').innerHTML = '<span class="source-dot"></span> READY';
  } finally {
    $('mutateButton').disabled = false;
  }
}

function showError(message) {
  $('errorMessage').textContent = message;
  setVisibility('errorMessage', true);
}

async function toggleMic() {
  if (micStream) {
    stopMic();
    return;
  }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(micStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    $('micButton').classList.add('active');
    $('micLabel').textContent = 'Stop live mic';
    const measure = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const rms = Math.sqrt(sum / samples.length);
      noise.value = clamp(Math.round(20 * Math.log10(Math.max(rms, 0.001))), -60, -5);
      scoreNow();
      analyserFrame = requestAnimationFrame(measure);
    };
    measure();
  } catch (_) {
    stopMic();
    showError('Mic access was declined or unavailable. The noise slider is a full manual override.');
  }
}

function stopMic() {
  if (analyserFrame) cancelAnimationFrame(analyserFrame);
  analyserFrame = null;
  if (micStream) micStream.getTracks().forEach((track) => track.stop());
  if (audioContext) audioContext.close();
  micStream = null;
  audioContext = null;
  $('micButton').classList.remove('active');
  $('micLabel').textContent = 'Start live mic';
}

function playBriefing() {
  if (!latestBriefing || !('speechSynthesis' in window)) {
    $('briefingStatus').textContent = 'Browser voice unavailable on this device';
    return;
  }
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    $('playIcon').textContent = '▶';
    $('briefingStatus').textContent = 'Briefing paused';
    return;
  }
  currentUtterance = new SpeechSynthesisUtterance(latestBriefing);
  currentUtterance.lang = 'en-GB';
  currentUtterance.rate = 0.96;
  const britishVoice = speechSynthesis.getVoices().find((voice) => voice.lang === 'en-GB');
  if (britishVoice) currentUtterance.voice = britishVoice;
  currentUtterance.onstart = () => {
    $('playIcon').textContent = 'Ⅱ';
    $('briefingStatus').textContent = 'Speaking · AI-generated text, browser voice';
    $('briefingPlayer').classList.add('speaking');
  };
  currentUtterance.onend = () => {
    $('playIcon').textContent = '▶';
    $('briefingStatus').textContent = 'Briefing complete';
    $('briefingPlayer').classList.remove('speaking');
  };
  currentUtterance.onerror = () => {
    $('playIcon').textContent = '▶';
    $('briefingStatus').textContent = 'Audio playback unavailable';
    $('briefingPlayer').classList.remove('speaking');
  };
  speechSynthesis.speak(currentUtterance);
}

function resetSession() {
  stopMic();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  energy.value = 72;
  noise.value = -42;
  fatigue.value = 18;
  locationControl.value = 'quiet_desk';
  deadline.value = '45';
  $('task').value = 'Fix the flaky auth refresh flow and ship a regression test before the demo.';
  setVisibility('planResult', false);
  setVisibility('loadingPlan', false);
  setVisibility('errorMessage', false);
  $('sourceBadge').className = 'source-badge';
  $('sourceBadge').innerHTML = '<span class="source-dot"></span> READY';
  $('transitionSummary').textContent = 'Set your telemetry, then mutate state to see how the system responds.';
  $('scheduleList').innerHTML = '<li class="schedule-placeholder">Your next moves will appear here.</li>';
  $('payloadJson').textContent = '{\n  "event": "circadian.state_mutated",\n  "delivery": "awaiting_first_mutation"\n}';
  $('airpodsState').textContent = 'OFF';
  $('watchState').textContent = 'HAPTIC READY';
  $('islandState').textContent = 'STANDBY';
  $('shadowStatus').textContent = 'Shadow Worker standing by';
  $('shadowNote').textContent = 'Low-energy coding tasks can be staged for background follow-up.';
  $('shadowCard').classList.remove('queued');
  $('briefingButton').disabled = true;
  $('briefingButton').classList.remove('ready');
  $('briefingStatus').textContent = 'Run Mutate State to prepare audio';
  $('playIcon').textContent = '▶';
  latestBriefing = '';
  lastSnapshot = null;
  scoreNow();
  lastSnapshot = scoreNow();
}

$('mutateButton').addEventListener('click', mutateState);
$('micButton').addEventListener('click', toggleMic);
$('resetButton').addEventListener('click', resetSession);
$('copyPayload').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('payloadJson').textContent);
    $('copyPayload').textContent = 'Copied';
    setTimeout(() => { $('copyPayload').textContent = 'Copy JSON'; }, 1400);
  } catch (_) {
    $('copyPayload').textContent = 'Select JSON to copy';
  }
});
$('briefingButton').addEventListener('click', playBriefing);
for (const control of [energy, noise, fatigue, locationControl, deadline]) control.addEventListener('input', scoreNow);
locationControl.addEventListener('change', scoreNow);
noise.addEventListener('input', () => { if (micStream) stopMic(); });
scoreNow();
lastSnapshot = scoreNow();
