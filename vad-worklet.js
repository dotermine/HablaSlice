class SilenceVAD extends AudioWorkletProcessor {
  constructor() {
    super();
    this.runId = 0;
    this.active = false;
    this.sampleRate = sampleRate;
    this.thresholdDb = -45;
    this.silenceSamples = Math.round(this.sampleRate * .45);
    this.minSegmentSamples = Math.round(this.sampleRate * .5);
    this.paddingSamples = Math.round(this.sampleRate * .035);

    this.sampleCursor = 0;
    this.lastReport = 0;
    this.inSpeech = false;
    this.speechStart = null;
    this.lastSpeechSample = null;
    this.belowSince = null;
    this.speechOnsetCandidate = null;

    // Hysteresis prevents noise at the threshold from repeatedly opening/closing segments.
    this.openThresholdDb = -45;
    this.closeThresholdDb = -48;
    this.attackSamples = Math.round(this.sampleRate * .06);
    this.releaseSamples = this.silenceSamples;
    this.noiseFloorDb = -70;
    this.calibrationSamples = Math.round(this.sampleRate * 1.0);
    this.calibrating = true;

    this.mediaAnchor = { mediaTime: 0, contextTime: 0 };
    this.lastMediaTime = 0;
    this.lastContextTime = 0;

    this.port.onmessage = ({data}) => {
      if (data.type === "start") {
        this.runId = data.runId;
        this.sampleRate = data.sampleRate || sampleRate;
        const c = data.config || {};
        this.thresholdDb = Number(c.thresholdDb ?? -45);
        this.openThresholdDb = this.thresholdDb;
        this.closeThresholdDb = this.thresholdDb - 3;
        this.silenceSamples = Math.round(this.sampleRate * Number(c.silenceMs ?? 450) / 1000);
        this.releaseSamples = this.silenceSamples;
        this.minSegmentSamples = Math.round(this.sampleRate * Number(c.minSegmentMs ?? 500) / 1000);
        this.paddingSamples = Math.round(this.sampleRate * Number(c.paddingMs ?? 35) / 1000);
        this.sampleCursor = 0;
        this.inSpeech = false;
        this.speechStart = null;
        this.lastSpeechSample = null;
        this.belowSince = null;
        this.speechOnsetCandidate = null;
        this.calibrating = true;
        this.noiseFloorDb = -70;
        this.lastReport = 0;
        this.active = true;
        this.port.postMessage({type:"ready", runId:this.runId});
      } else if (data.type === "sync") {
        this.mediaAnchor = { mediaTime: data.mediaTime, contextTime: data.contextTime };
      }
    };
  }

  toMediaTime(sample) {
    // Sample position is absolute. Convert through the latest media/audio-clock
    // anchor instead of adding segment durations, eliminating cumulative drift.
    const contextTime = sample / this.sampleRate;
    const delta = contextTime - this.mediaAnchor.contextTime;
    const rate = 1; // media playback-rate changes are handled by frequent re-anchoring.
    return Math.max(0, this.mediaAnchor.mediaTime + delta * rate);
  }

  emitSegment(startSample, endSample, final = false) {
    if (endSample <= startSample) return;
    const start = this.toMediaTime(startSample);
    const end = this.toMediaTime(endSample);
    if (end > start) this.port.postMessage({
      type:"segment", runId:this.runId, start, end, final
    });
  }

  process(inputs) {
    if (!this.active || !inputs[0]?.length) return true;
    const channels = inputs[0];
    const n = channels[0].length;

    let sum = 0;
    for (let i = 0; i < n; i++) {
      let x = 0;
      for (let ch = 0; ch < channels.length; ch++) x += channels[ch][i] || 0;
      x /= Math.max(1, channels.length);
      sum += x * x;
    }
    const rms = Math.sqrt(sum / n);
    const db = 20 * Math.log10(Math.max(rms, 1e-8));
    const frameStart = this.sampleCursor;
    const frameEnd = frameStart + n;
    this.sampleCursor = frameEnd;

    if (this.calibrating) {
      // Robust noise-floor estimator: only update while the signal remains below
      // the configured threshold, and use a slow EMA to ignore short transients.
      if (db < this.thresholdDb) this.noiseFloorDb = Math.max(-80, this.noiseFloorDb * .97 + db * .03);
      if (frameEnd >= this.calibrationSamples) {
        const adaptive = Math.min(this.thresholdDb, this.noiseFloorDb + 8);
        this.openThresholdDb = Math.max(-60, adaptive);
        this.closeThresholdDb = this.openThresholdDb - 3;
        this.calibrating = false;
      }
    }

    const open = db >= this.openThresholdDb;
    const close = db <= this.closeThresholdDb;

    if (!this.inSpeech) {
      if (open) {
        if (this.speechOnsetCandidate === null) this.speechOnsetCandidate = frameStart;
        if (frameEnd - this.speechOnsetCandidate >= this.attackSamples) {
          this.inSpeech = true;
          this.speechStart = Math.max(0, this.speechOnsetCandidate - this.paddingSamples);
          this.lastSpeechSample = frameEnd;
          this.belowSince = null;
          this.speechOnsetCandidate = null;
        }
      } else {
        this.speechOnsetCandidate = null;
      }
    } else {
      if (!close) {
        this.lastSpeechSample = frameEnd;
        this.belowSince = null;
      } else {
        if (this.belowSince === null) this.belowSince = frameStart;
        if (frameEnd - this.belowSince >= this.releaseSamples) {
          const end = Math.max(this.speechStart + this.minSegmentSamples,
            this.belowSince - this.paddingSamples);
          this.emitSegment(this.speechStart, end, false);
          this.inSpeech = false;
          this.speechStart = null;
          this.lastSpeechSample = null;
          this.belowSince = null;
        }
      }
    }

    if (frameEnd - this.lastReport >= this.sampleRate * .2) {
      this.lastReport = frameEnd;
      this.port.postMessage({
        type:"progress", runId:this.runId, mediaTime:this.toMediaTime(frameEnd)
      });
    }
    return true;
  }
}
registerProcessor("silence-vad", SilenceVAD);
