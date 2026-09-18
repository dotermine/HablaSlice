const $ = (s) => document.querySelector(s);

const ui = {
  dropZone: $("#dropZone"), fileInput: $("#fileInput"), openBtn: $("#openBtn"),
  playerPanel: $("#playerPanel"), segmentsPanel: $("#segmentsPanel"), audio: $("#audio"),
  fileName: $("#fileName"), statusText: $("#statusText"), closeBtn: $("#closeBtn"),
  playBtn: $("#playBtn"), playIcon: $("#playIcon"), backBtn: $("#backBtn"), nextBtn: $("#nextBtn"),
  repeatBtn: $("#repeatBtn"), seekBar: $("#seekBar"), currentTime: $("#currentTime"), totalTime: $("#totalTime"),
  segments: $("#segments"), segmentMeta: $("#segmentMeta"), analysisProgress: $("#analysisProgress"),
  progressFill: $("#progressFill"), progressLabel: $("#progressLabel"), reAnalyzeBtn: $("#reAnalyzeBtn"),
  threshold: $("#threshold"), silenceDuration: $("#silenceDuration"), minSegment: $("#minSegment"), padding: $("#padding"),
  thresholdOut: $("#thresholdOut"), silenceOut: $("#silenceOut"), minSegmentOut: $("#minSegmentOut"), paddingOut: $("#paddingOut"),
  themeBtn: $("#themeBtn")
};

const state = {
  file: null, objectUrl: null, audioContext: null, source: null, worklet: null,
  segments: [], activeIndex: -1, repeat: false, analysisStarted: false, duration: 0,
  raf: 0, runId: 0, mediaOffset: 0
};

const fmt = (seconds) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

function setStatus(text) { ui.statusText.textContent = text; }

function updateOutputs() {
  ui.thresholdOut.textContent = `${ui.threshold.value} dB`;
  ui.silenceOut.textContent = `${ui.silenceDuration.value} ms`;
  ui.minSegmentOut.textContent = `${ui.minSegment.value} ms`;
  ui.paddingOut.textContent = `${ui.padding.value} ms`;
}
["threshold","silenceDuration","minSegment","padding"].forEach(id => $( "#"+id ).addEventListener("input", updateOutputs));
updateOutputs();

function renderSegments() {
  ui.segments.replaceChildren();
  state.segments.forEach((seg, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "segment-card" + (i === state.activeIndex ? " active" : "");
    b.innerHTML = `
      <span class="segment-number">${i + 1}</span>
      <span class="segment-main">
        <span class="segment-title">Segment ${i + 1}</span>
        <span class="segment-time">${fmt(seg.start)} – ${fmt(seg.end)} · ${fmt(seg.end - seg.start)}</span>
      </span>
      <span class="segment-state">${seg.final ? "Ready" : "Detecting"}</span>`;
    b.addEventListener("click", () => playSegment(i));
    ui.segments.appendChild(b);
  });
  ui.segmentMeta.textContent = state.segments.length
    ? `${state.segments.length} segment${state.segments.length === 1 ? "" : "s"} detected`
    : "Listening for speech boundaries";
}

async function ensureAudioGraph() {
  if (state.audioContext) return;
  state.audioContext = new AudioContext({ latencyHint: "interactive" });
  await state.audioContext.audioWorklet.addModule("./vad-worklet.js");
  state.source = state.audioContext.createMediaElementSource(ui.audio);
  state.worklet = new AudioWorkletNode(state.audioContext, "silence-vad", {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2]
  });
  state.source.connect(state.worklet).connect(state.audioContext.destination);
  state.worklet.port.onmessage = (e) => onVADMessage(e.data);
}

function currentDetectionConfig() {
  return {
    thresholdDb: Number(ui.threshold.value),
    silenceMs: Number(ui.silenceDuration.value),
    minSegmentMs: Number(ui.minSegment.value),
    paddingMs: Number(ui.padding.value)
  };
}

function onVADMessage(msg) {
  if (!state.analysisStarted || msg.runId !== state.runId) return;
  if (msg.type === "ready") {
    setStatus("Analyzing while playing");
    return;
  }
  if (msg.type === "progress") {
    const p = state.duration ? Math.min(1, msg.mediaTime / state.duration) : 0;
    ui.progressFill.style.width = `${p * 100}%`;
    ui.progressLabel.textContent = `Analyzing ${Math.round(p * 100)}%`;
    return;
  }
  if (msg.type === "segment") {
    addDetectedSegment(msg.start, msg.end, msg.final ?? false);
  }
  if (msg.type === "done") {
    finalizeLastSegment(msg.end);
    ui.analysisProgress.classList.add("hidden");
    setStatus("Analysis complete");
  }
}

function addDetectedSegment(start, end, final = false) {
  const min = Number(ui.minSegment.value) / 1000;
  if (!(end > start + min)) return;
  const last = state.segments.at(-1);
  if (last && start < last.end) {
    // Merge only overlapping observations. Boundaries are absolute media times;
    // no segment duration is accumulated from previous segments.
    last.end = Math.max(last.end, end);
    last.final = final;
  } else {
    state.segments.push({ start, end, final });
  }
  renderSegments();
}

function finalizeLastSegment(end) {
  const last = state.segments.at(-1);
  if (last) last.end = Math.min(end, state.duration || end);
  state.segments.forEach(s => s.final = true);
  renderSegments();
}

function resetAnalysis() {
  state.runId++;
  state.segments = [];
  state.activeIndex = -1;
  state.analysisStarted = false;
  renderSegments();
  ui.analysisProgress.classList.remove("hidden");
  ui.progressFill.style.width = "0%";
  ui.progressLabel.textContent = "Preparing analyzer…";
}

async function startAnalysis() {
  await ensureAudioGraph();
  resetAnalysis();
  state.analysisStarted = true;
  ui.worklet.port.postMessage({
    type: "start",
    runId: state.runId,
    sampleRate: state.audioContext.sampleRate,
    config: currentDetectionConfig()
  });
  if (state.audioContext.state === "suspended") await state.audioContext.resume();
}

function playSegment(i) {
  const seg = state.segments[i];
  if (!seg) return;
  state.activeIndex = i;
  renderSegments();
  ui.audio.currentTime = Math.max(0, seg.start + 0.001);
  ui.audio.play().catch(() => {});
}

function stopIfOutsideSegment() {
  const seg = state.segments[state.activeIndex];
  if (!seg || !state.audio.duration) return;
  if (ui.audio.currentTime >= seg.end - 0.008) {
    if (state.repeat) {
      ui.audio.currentTime = seg.start + 0.001;
      ui.audio.play().catch(() => {});
    } else {
      ui.audio.pause();
      ui.audio.currentTime = seg.end;
    }
  }
}

function tick() {
  ui.currentTime.textContent = fmt(ui.audio.currentTime);
  if (Number.isFinite(ui.audio.duration)) {
    ui.seekBar.max = ui.audio.duration;
    ui.seekBar.value = ui.audio.currentTime;
    ui.totalTime.textContent = fmt(ui.audio.duration);
  }
  stopIfOutsideSegment();
  // Periodic synchronization makes the VAD's audio-clock -> media-clock mapping
  // absolute rather than accumulating a per-segment duration error.
  if (state.audioContext && state.worklet) {
    state.worklet.port.postMessage({
      type: "sync", mediaTime: ui.audio.currentTime, contextTime: state.audioContext.currentTime
    });
  }
  state.raf = requestAnimationFrame(tick);
}

function setPlayingIcon(playing) {
  ui.playIcon.innerHTML = playing
    ? '<path d="M7 5h3v14H7zm7 0h3v14h-3z"/>'
    : '<path d="M8 5v14l11-7L8 5Z"/>';
  ui.playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
}

ui.openBtn.addEventListener("click", () => ui.fileInput.click());
ui.dropZone.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") ui.fileInput.click(); });
ui.fileInput.addEventListener("change", e => e.target.files[0] && openFile(e.target.files[0]));
["dragenter","dragover"].forEach(type => ui.dropZone.addEventListener(type, e => {
  e.preventDefault(); ui.dropZone.classList.add("dragging");
}));
["dragleave","drop"].forEach(type => ui.dropZone.addEventListener(type, e => {
  e.preventDefault(); ui.dropZone.classList.remove("dragging");
}));
ui.dropZone.addEventListener("drop", e => e.dataTransfer.files[0] && openFile(e.dataTransfer.files[0]));

async function openFile(file) {
  if (!file.type.startsWith("audio/")) return;
  state.file = file;
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = URL.createObjectURL(file);
  ui.audio.src = state.objectUrl;
  ui.audio.load();

  ui.fileName.textContent = file.name;
  ui.dropZone.classList.add("hidden");
  ui.playerPanel.classList.remove("hidden");
  ui.segmentsPanel.classList.remove("hidden");
  setStatus("Opening…");
  resetAnalysis();

  try {
    await ensureAudioGraph();
    // Do not wait for analysis. The native media element begins buffering/playback immediately.
    await ui.audio.play();
    setPlayingIcon(true);
    setStatus("Playing · analysis in background");
    startAnalysis().catch(err => setStatus(`Analyzer unavailable: ${err.message}`));
  } catch (err) {
    setStatus("Press Play to start");
    startAnalysis().catch(() => {});
  }
}

ui.audio.addEventListener("loadedmetadata", () => {
  state.duration = ui.audio.duration || 0;
  ui.seekBar.max = state.duration;
  ui.totalTime.textContent = fmt(state.duration);
});
ui.audio.addEventListener("playing", () => {
  setPlayingIcon(true);
  if (state.audioContext?.state === "suspended") state.audioContext.resume();
});
ui.audio.addEventListener("pause", () => setPlayingIcon(false));
ui.audio.addEventListener("ended", () => {
  setPlayingIcon(false);
  state.activeIndex = -1;
  renderSegments();
});
ui.playBtn.addEventListener("click", () => {
  if (ui.audio.paused) {
    const seg = state.segments[state.activeIndex];
    if (seg && (ui.audio.currentTime < seg.start || ui.audio.currentTime >= seg.end)) ui.audio.currentTime = seg.start + .001;
    ui.audio.play().catch(() => {});
  } else ui.audio.pause();
});
ui.backBtn.addEventListener("click", () => {
  if (state.activeIndex > 0) playSegment(state.activeIndex - 1);
  else if (state.segments.length) playSegment(0);
});
ui.nextBtn.addEventListener("click", () => {
  if (state.activeIndex + 1 < state.segments.length) playSegment(state.activeIndex + 1);
});
ui.repeatBtn.addEventListener("click", () => {
  state.repeat = !state.repeat;
  ui.repeatBtn.classList.toggle("active", state.repeat);
  ui.repeatBtn.setAttribute("aria-pressed", String(state.repeat));
});
ui.seekBar.addEventListener("input", () => {
  ui.audio.currentTime = Number(ui.seekBar.value);
  state.activeIndex = state.segments.findIndex(s => ui.audio.currentTime >= s.start && ui.audio.currentTime < s.end);
  renderSegments();
});
document.querySelectorAll("[data-speed]").forEach(btn => btn.addEventListener("click", () => {
  ui.audio.playbackRate = Number(btn.dataset.speed);
  document.querySelectorAll("[data-speed]").forEach(b => b.classList.toggle("selected", b === btn));
}));

ui.reAnalyzeBtn.addEventListener("click", async () => {
  if (!state.file) return;
  await startAnalysis();
  if (ui.audio.paused) ui.audio.play().catch(() => {});
});

ui.closeBtn.addEventListener("click", () => {
  ui.audio.pause();
  ui.audio.removeAttribute("src");
  ui.audio.load();
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = null; state.file = null; state.segments = []; state.activeIndex = -1;
  ui.playerPanel.classList.add("hidden");
  ui.segmentsPanel.classList.add("hidden");
  ui.dropZone.classList.remove("hidden");
  renderSegments();
  setStatus("Ready");
});

ui.themeBtn.addEventListener("click", () => {
  const light = document.documentElement.classList.toggle("light");
  localStorage.setItem("hablaslice-theme", light ? "light" : "dark");
  document.querySelector('meta[name="theme-color"]').content = light ? "#f2f2f7" : "#000000";
});
if (localStorage.getItem("hablaslice-theme") === "light") {
  document.documentElement.classList.add("light");
  document.querySelector('meta[name="theme-color"]').content = "#f2f2f7";
}

requestAnimationFrame(tick);
renderSegments();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
