

        if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

(function(){
            'use strict';
            const $=id=>document.getElementById(id);
            const el={
                statusText:$('statusText'),progressWrap:$('progressWrap'),progressFill:$('progressFill'),
                progressText:$('progressText'),trackName:$('trackName'),segInfo:$('segInfo'),
                timeInfo:$('timeInfo'),repeatCount:$('repeatCount'),repeatTotal:$('repeatTotal'),
                playlist:$('playlist'),emptyMsg:$('emptyMsg'),btnOpen:$('btnOpen'),btnPrevTrack:$('btnPrevTrack'),btnPrev:$('btnPrev'),btnPlay:$('btnPlay'),btnNext:$('btnNext'),btnNextTrack:$('btnNextTrack'),btnSettings:$('btnSettings'),
                fileInput:$('fileInput'),folderInput:$('folderInput'),settingsModal:$('settingsModal'),
                btnCancel:$('btnCancel'),btnApply:$('btnApply'),btnReset:$('btnReset'),
                setDb:$('setDb'),setDur:$('setDur'),setFrag:$('setFrag'),setSil:$('setSil'),afterDropdown:$('afterDropdown'),
                afterToggle:$('afterToggle'),afterDisplay:$('afterDisplay'),afterMenu:$('afterMenu'),silencePauseDropdown:$('silencePauseDropdown'),silencePauseToggle:$('silencePauseToggle'),silencePauseMenu:$('silencePauseMenu'),silencePauseDisplay:$('silencePauseDisplay'),
                dbVal:$('dbVal'),durVal:$('durVal'),fragVal:$('fragVal'),silVal:$('silVal'),waveCanvas:$('waveCanvas'),
                waveSilence:$('waveSilence'),waveformOverlay:$('waveformOverlay'),
                waveformLoading:$('waveformLoading'),
                silenceDuration:$('silenceDuration'),silenceLabel:$('silenceLabel'),
                themeDark:$('themeDark'),themeLight:$('themeLight'),popover:$('popover'),
                popFile:$('popFile'),popFolder:$('popFolder'),fileCounter:$('fileCounter'),
                speedDisplay:$('speedDisplay'),repeatsDisplay:$('repeatsDisplay'),
                speedDropdown:$('speedDropdown'),repeatsDropdown:$('repeatsDropdown'),
                speedMenu:$('speedMenu'),repeatsMenu:$('repeatsMenu'),speedToggle:$('speedToggle'),
                repeatsToggle:$('repeatsToggle'),stretchDropdown:$('stretchDropdown'),stretchToggle:$('stretchToggle'),stretchMenu:$('stretchMenu'),stretchDisplay:$('stretchDisplay'),audio:$('audio-engine'),jumpInput:$('jumpInput'),
                jumpBtn:$('jumpBtn'),totalSegments:$('totalSegments'),segmentBadge:$('segmentBadge'),
                segmentProgressFill:$('segmentProgressFill'),segmentProgressHandle:$('segmentProgressHandle'),
                segmentProgressBar:$('segmentProgressBar'),segmentMarkers:$('segmentMarkers'),timelineCarriage:$('timelineCarriage'),loadingOverlay:$('loadingOverlay'),
                loadingText:$('loadingText'),loadingSub:$('loadingSub'),loadingProgressFill:$('loadingProgressFill'),
                loadingDetail:$('loadingDetail'),cancelLoadBtn:$('cancelLoadBtn'),
                fileProgressText:$('fileProgressText')
            };

            const state={
                tracks:[],
                currentTrackIdx:0,
                segments:[],
                currentSegIdx:0,
                repeatCount:0,
                isPlaying:false,
                isWaitingSilence:false,
                speed:1.0,
                settings:{n:3,db:-40,dur:0.4,minFrag:0.8,after:'next',theme:'dark',silence:0.5,algo:'rms',preset:'podcasts',stretch:'native'},
                isAudioInitialized:false,
                originalFileUrl:null,
                audioCtx:null,
                gainNode:null,
                _animationFrame:null,
                waveHeights:[],
                isTransitioning:false,
                loopMode:'none',
                processingQueue:[],
                isProcessing:false,
                cancelProcessing:false,
                isLoaded:false,
                isRawFallback:false,
                preloader:null,
                preloadedTrackIdx:-1,
                preloadedUrl:null,
                _progressInterval:null,
                isDragging:false,
                _segmentEndTimeout:null,
                _pendingSegmentEnd:false
            };

            try {
                const savedLoop = localStorage.getItem('hs-loop');
                if (savedLoop === 'playlist' || savedLoop === 'track') state.loopMode = savedLoop;
                const savedSpeed = parseFloat(localStorage.getItem('hs-speed'));
                if (Number.isFinite(savedSpeed)) state.speed = Math.min(1.5, Math.max(0.5, savedSpeed));
                const savedStretch = localStorage.getItem('hs-stretch');
                if (savedStretch === 'native' || savedStretch === 'off') state.settings.stretch = savedStretch;
                const savedRepeats = parseInt(localStorage.getItem('hs-repeats'), 10);
                if (savedRepeats >= 1 && savedRepeats <= 10) state.settings.n = savedRepeats;
                if (localStorage.getItem('hs-theme') === 'light') {
                    document.body.classList.remove('dark-theme');
                    state.settings.theme = 'light';
                }
            } catch (_) {}

            const ANALYSIS_SAMPLE_RATE = 8000;
            const CHUNK_DURATION_THRESHOLD = 8 * 60;
            const CHUNK_SECONDS = 4 * 60;
            const CHUNK_OVERLAP_SECONDS = 2;
            const CHUNK_CONCURRENCY = 2;
            const DURATION_TOLERANCE = 0.03;
            const SEGMENT_END_BUFFER = 0.05;
            const STREAMING_BATCH_SIZE = 30;

            let _decodeCtx = null;
            function getDecodeContext(){
                const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
                if (!_decodeCtx || _decodeCtx.state === 'closed') {
                    _decodeCtx = new Ctx(1, 1, ANALYSIS_SAMPLE_RATE);
                }
                return _decodeCtx;
            }

            function decodeAudioDataAsync(ctx, arrayBuffer){
                return new Promise((resolve, reject) => {
                    try {
                        const maybe = ctx.decodeAudioData(arrayBuffer, resolve, (err) => reject(err || new Error('decode failed')));
                        if (maybe && typeof maybe.then === 'function') maybe.then(resolve, reject);
                    } catch (err) { reject(err); }
                });
            }

            function probeDuration(file){
                return new Promise((resolve) => {
                    let settled = false;
                    const url = URL.createObjectURL(file);
                    const a = new Audio();
                    a.preload = 'metadata';
                    a.muted = true;
                    const finish = (val) => {
                        if (settled) return;
                        settled = true;
                        URL.revokeObjectURL(url);
                        resolve(val);
                    };
                    a.onloadedmetadata = () => finish(isFinite(a.duration) && a.duration > 0 ? a.duration : null);
                    a.onerror = () => finish(null);
                    setTimeout(() => finish(null), 10000);
                    a.src = url;
                });
            }

            class SmartAudioLoader {
                constructor(){ this.cancelled = false; }
                cancel(){ this.cancelled = true; }

                async load(file, onProgress, onStatus){
                    this.cancelled = false;
                    const ctx = getDecodeContext();
                    const trueDuration = await probeDuration(file);
                    if (this.cancelled) return null;

                    if (!trueDuration || trueDuration <= CHUNK_DURATION_THRESHOLD) {
                        onStatus && onStatus('Decoding');
                        try {
                            const buf = await file.arrayBuffer();
                            if (this.cancelled) return null;
                            onProgress && onProgress(0.5);
                            const audioBuffer = await decodeAudioDataAsync(ctx, buf);
                            if (this.cancelled) return null;
                            const matches = !trueDuration || Math.abs(audioBuffer.duration - trueDuration) <= Math.max(1, trueDuration * DURATION_TOLERANCE);
                            if (matches) {
                                onProgress && onProgress(1);
                                return {
                                    channelData: Float32Array.from(audioBuffer.getChannelData(0)),
                                    sampleRate: audioBuffer.sampleRate,
                                    duration: audioBuffer.duration,
                                    trueDuration: trueDuration || audioBuffer.duration,
                                    truncated: false
                                };
                            }
                            console.warn('[HablaSlice] decode duration mismatch (' + audioBuffer.duration.toFixed(1) + 's vs ' + trueDuration.toFixed(1) + 's expected) -- retrying with chunked decode');
                        } catch (e) {
                            console.warn('[HablaSlice] single-shot decode failed, falling back to chunked decode:', e);
                        }
                    }

                    return await this._decodeChunked(file, trueDuration, ctx, onProgress, onStatus);
                }

                async _decodeChunked(file, trueDuration, ctx, onProgress, onStatus){
                    const totalSize = file.size;
                    const duration = trueDuration || Math.max(1, totalSize / (128 * 1024 / 8));
                    const bytesPerSecond = totalSize / duration;

                    const plans = [];
                    for (let t = 0; t < duration; t += CHUNK_SECONDS) {
                        plans.push({
                            t,
                            segStart: Math.max(0, t - CHUNK_OVERLAP_SECONDS),
                            segEnd: Math.min(duration, t + CHUNK_SECONDS + CHUNK_OVERLAP_SECONDS)
                        });
                    }
                    if (plans.length === 0) plans.push({ t: 0, segStart: 0, segEnd: duration });

                    const results = new Array(plans.length).fill(null);
                    let completed = 0, failedChunks = 0;
                    onStatus && onStatus(`Decoding (${plans.length} chunks)`);

                    const decodeOne = async (plan, idx) => {
                        if (this.cancelled) return;
                        const byteStart = Math.max(0, Math.floor(plan.segStart * bytesPerSecond));
                        const byteEnd = Math.min(totalSize, Math.ceil(plan.segEnd * bytesPerSecond));
                        try {
                            const buf = await file.slice(byteStart, byteEnd).arrayBuffer();
                            if (this.cancelled) return;
                            const audioBuffer = await decodeAudioDataAsync(ctx, buf);
                            if (this.cancelled) return;
                            const ch = audioBuffer.getChannelData(0);
                            const sr = audioBuffer.sampleRate;
                            const decodedStart = plan.segStart;
                            const wantStart = plan.t;
                            const wantEnd = Math.min(plan.t + CHUNK_SECONDS, duration, decodedStart + audioBuffer.duration);
                            const trimStart = Math.max(0, Math.round((wantStart - decodedStart) * sr));
                            const trimEnd = Math.max(trimStart, Math.min(ch.length, Math.round((wantEnd - decodedStart) * sr)));
                            results[idx] = Float32Array.from(ch.subarray(trimStart, trimEnd));
                        } catch (e) {
                            failedChunks++;
                            console.warn('[HablaSlice] chunk decode failed for range', plan, e);
                            results[idx] = null;
                        }
                        completed++;
                        onProgress && onProgress(completed / plans.length);
                    };

                    let next = 0;
                    const runWorker = async () => {
                        while (next < plans.length && !this.cancelled) {
                            const idx = next++;
                            await decodeOne(plans[idx], idx);
                        }
                    };
                    await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, plans.length) }, runWorker));

                    if (this.cancelled) return null;
                    if (results.every(r => !r)) throw new Error('All audio chunks failed to decode');

                    let totalLen = 0;
                    for (const r of results) if (r) totalLen += r.length;
                    const combined = new Float32Array(totalLen);
                    let pos = 0;
                    for (const r of results) { if (r) { combined.set(r, pos); pos += r.length; } }

                    return {
                        channelData: combined,
                        sampleRate: ctx.sampleRate,
                        duration: combined.length / ctx.sampleRate,
                        trueDuration: duration,
                        truncated: failedChunks > 0
                    };
                }
            }

            const loader = new SmartAudioLoader();

            // --- SEGMENTATION WORKER (Streaming) ---
            const workerCode = `
                self.onmessage = function(e) {
                    const { audioData, sampleRate, threshold, minSilenceSec, minFragmentSec, trackIdx, algo, batchSize } = e.data;
                    const thresholdLinear = Math.pow(10, threshold / 20);
                    const minSilenceSamples = Math.max(1, Math.floor(sampleRate * minSilenceSec));
                    const minSegmentSamples = Math.max(1, Math.floor((minFragmentSec || 0.8) * sampleRate));
                    const totalSamples = audioData.length;
                    const segments = [];
                    let start = 0;
                    let lastBatchEnd = 0;

                    const pushSegment = (s, en) => {
                        if (en - s > minSegmentSamples) {
                            segments.push({ start: s / sampleRate, end: en / sampleRate });
                        }
                    };

                    const emitBatch = (force) => {
                        if (segments.length > lastBatchEnd && (segments.length - lastBatchEnd >= batchSize || force)) {
                            const batch = segments.slice(lastBatchEnd);
                            lastBatchEnd = segments.length;
                            self.postMessage({ 
                                type: 'progress', 
                                segments: batch, 
                                allSegments: segments.slice(),
                                trackIdx: trackIdx,
                                isComplete: force
                            });
                        }
                    };

                    if (algo === 'rms') {
                        const windowSize = Math.max(1, Math.round(sampleRate * 0.02));
                        const numWindows = Math.ceil(totalSamples / windowSize);
                        const minSilenceWindows = Math.max(1, Math.round(minSilenceSamples / windowSize));
                        let silentRun = 0;

                        for (let w = 0; w < numWindows; w++) {
                            const wStart = w * windowSize;
                            const wEnd = Math.min(totalSamples, wStart + windowSize);
                            let sumSq = 0;
                            for (let i = wStart; i < wEnd; i++) { const v = audioData[i]; sumSq += v * v; }
                            const rms = Math.sqrt(sumSq / Math.max(1, wEnd - wStart));

                            if (rms < thresholdLinear) {
                                silentRun++;
                            } else {
                                if (silentRun >= minSilenceWindows) {
                                    const end = wStart - (silentRun * windowSize);
                                    pushSegment(start, Math.max(start, end));
                                    start = wStart;
                                    emitBatch(false);
                                }
                                silentRun = 0;
                            }
                        }
                    } else {
                        let silenceCount = 0;
                        const emitInterval = Math.floor(sampleRate * 5); // Check every 5 seconds of samples
                        let nextEmit = emitInterval;

                        for (let i = 0; i < totalSamples; i++) {
                            if (Math.abs(audioData[i]) < thresholdLinear) {
                                silenceCount++;
                            } else {
                                if (silenceCount >= minSilenceSamples) {
                                    const end = i - silenceCount;
                                    pushSegment(start, end);
                                    start = end;
                                    if (i >= nextEmit) {
                                        emitBatch(false);
                                        nextEmit = i + emitInterval;
                                    }
                                }
                                silenceCount = 0;
                            }
                        }
                    }

                    if (start < totalSamples) pushSegment(start, totalSamples);
                    if (segments.length === 0) segments.push({ start: 0, end: totalSamples / sampleRate });

                    emitBatch(true);

                    self.postMessage({ 
                        type: 'complete', 
                        segments: segments, 
                        trackIdx: trackIdx 
                    });
                };
            `;
            const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
            const analysisWorker = new Worker(URL.createObjectURL(workerBlob));

            analysisWorker.onmessage = function(e){
                const data = e.data;
                const track = state.tracks[data.trackIdx];
                if (!track) return;

                if (data.type === 'progress') {
                    // Streaming segments received
                    track.segments = data.allSegments || data.segments;
                    track.totalSegments = track.segments.length;

                    if (data.trackIdx === state.currentTrackIdx) {
                        const wasRaw = state.isRawFallback;
                        const wasEmpty = state.segments.length === 0 || !state.isLoaded;
                        const resumeTime = el.audio.currentTime;

                        // Merge new segments, preserving current playback position
                        state.segments = track.segments.slice();

                        // If we were in raw fallback and now have real segments, switch seamlessly
                        if ((wasRaw || wasEmpty) && state.segments.length > 0) {
                            state.isRawFallback = false;
                            state.isLoaded = true;
                            showWaveformLoading(false);

                            // Find which segment contains current time
                            let idx = state.segments.findIndex(s => resumeTime >= s.start && resumeTime < s.end);
                            if (idx === -1) {
                                // Current time might be in a gap between segments or past all known segments
                                // Find the segment that starts closest to current time
                                idx = state.segments.findIndex(s => s.start > resumeTime);
                                if (idx === -1) idx = Math.max(0, state.segments.length - 1);
                                else if (idx > 0) idx--;
                            }

                            const prevSegIdx = state.currentSegIdx;
                            state.currentSegIdx = idx;

                            // Only reset repeat count if we actually changed segments
                            if (prevSegIdx !== idx || wasRaw || wasEmpty) {
                                state.repeatCount = 0;
                            }

                            state.waveHeights = generateWaveHeights();
                            updateUI();
                            drawWaveformStatic();
                            updateSegmentProgress();
                            activateControls();

                            // If we were playing, ensure we're playing the right segment
                            if (state.isPlaying && !el.audio.paused) {
                                const seg = state.segments[idx];
                                if (seg && (el.audio.currentTime < seg.start || el.audio.currentTime >= seg.end)) {
                                    el.audio.currentTime = seg.start;
                                }
                            }
                        } else {
                            // Just update segment count and UI
                            updateUI();
                            updatePlaylistUI();
                        }
                    } else {
                        updatePlaylistUI();
                    }
                }
                else if (data.type === 'complete') {
                    track.segments = data.segments;
                    track.status = 'done';
                    track.totalSegments = data.segments.length;
                    track.loadProgress = 1;

                    if (data.trackIdx === state.currentTrackIdx) {
                        const wasRaw = state.isRawFallback;
                        const wasEmpty = !state.isLoaded || state.segments.length === 0;
                        const resumeTime = el.audio.currentTime;

                        state.segments = data.segments;
                        state.isRawFallback = false;
                        state.waveHeights = generateWaveHeights();
                        state.isLoaded = true;
                        showWaveformLoading(false);
                        activateControls();

                        if ((wasRaw || wasEmpty) && (state.isPlaying || !el.audio.paused)) {
                            let idx = data.segments.findIndex(s => resumeTime >= s.start && resumeTime < s.end);
                            if (idx === -1) {
                                idx = data.segments.findIndex(s => s.start > resumeTime);
                                if (idx === -1) idx = Math.max(0, data.segments.length - 1);
                                else if (idx > 0) idx--;
                            }
                            state.currentSegIdx = idx;
                            state.repeatCount = 0;
                            updateUI();
                            drawWaveformStatic();
                            updateSegmentProgress();
                        } else {
                            updateUI();
                            drawWaveformStatic();
                            updateSegmentProgress();
                            if (state.isTransitioning && state.segments.length > 0) {
                                state.isTransitioning = false;
                                startPlayback();
                            }
                        }
                    }
                    updatePlaylistUI();
                    state.isProcessing = false;
                    processNextInQueue();
                    if (state.processingQueue.length === 0 && !state.isProcessing) setGlobalStatus('Ready', null);
                }
            };

            function generateWaveHeights(){
                const heights = [];
                const bars = 80;
                for (let i = 0; i < bars; i++) heights.push(Math.random() * 0.6 + 0.1);
                return heights;
            }

            function setGlobalStatus(text, progress){
                if (el.statusText) el.statusText.textContent = text;
                if (!el.progressWrap) return;
                if (progress != null && progress < 1) {
                    el.progressWrap.classList.add('active');
                    el.progressFill.style.width = Math.round(progress * 100) + '%';
                    el.progressText.textContent = Math.round(progress * 100) + '%';
                } else {
                    el.progressWrap.classList.remove('active');
                }
            }

            function processNextInQueue(){
                if (state.processingQueue.length === 0 || state.isProcessing || state.cancelProcessing) return;
                state.isProcessing = true;
                const trackIdx = state.processingQueue.shift();
                processFile(trackIdx);
            }

            async function processFile(trackIdx){
                const track = state.tracks[trackIdx];
                if (!track || state.cancelProcessing) {
                    state.isProcessing = false;
                    processNextInQueue();
                    return;
                }

                track.status = 'processing';
                updatePlaylistUI();
                setGlobalStatus(`Decoding ${track.file.name}`, 0);

                try {
                    loader.cancel();

                    const result = await loader.load(track.file, (progress) => {
                        track.loadProgress = progress;
                        updatePlaylistUI();
                        el.fileProgressText.textContent = Math.round(progress * 100) + '%';
                        setGlobalStatus(`Decoding ${track.file.name}`, progress);
                    }, (statusMsg) => {
                        setGlobalStatus(`${statusMsg} – ${track.file.name}`, track.loadProgress || 0);
                    });

                    if (state.cancelProcessing || !result) {
                        track.status = 'pending';
                        track.loadProgress = 0;
                        updatePlaylistUI();
                        state.isProcessing = false;
                        processNextInQueue();
                        return;
                    }

                    track.duration = result.trueDuration || result.duration;
                    track.sampleRate = result.sampleRate;
                    track.loadProgress = 1;

                    if (result.truncated) {
                        showToast(`${track.file.name}: a few chunks failed to decode`, 'error');
                    }

                    if (state.cancelProcessing) {
                        track.status = 'pending';
                        updatePlaylistUI();
                        state.isProcessing = false;
                        processNextInQueue();
                        return;
                    }

                    setGlobalStatus(`Finding silence in ${track.file.name}`, 0.99);
                    analysisWorker.postMessage({
                        trackIdx: trackIdx,
                        audioData: result.channelData,
                        sampleRate: result.sampleRate,
                        threshold: state.settings.db,
                        minSilenceSec: state.settings.dur,
                        minFragmentSec: state.settings.minFrag,
                        algo: state.settings.algo,
                        batchSize: STREAMING_BATCH_SIZE
                    }, [result.channelData.buffer]);

                } catch (e) {
                    console.error('Processing Error:', e);
                    track.status = 'error';
                    track.loadProgress = 0;
                    updatePlaylistUI();
                    showToast(`Failed to process ${track.file.name}`, 'error');
                    state.isProcessing = false;
                    processNextInQueue();
                }
            }

            function preloadNextTrack(){
                if (!state.tracks.length || state.tracks.length < 2) return;
                const idx = (state.currentTrackIdx + 1) % state.tracks.length;
                if (state.preloadedTrackIdx === idx && state.preloader?.readyState >= 2) return;
                if (state.preloadedUrl) { try { URL.revokeObjectURL(state.preloadedUrl); } catch (_) {} }
                state.preloadedUrl = URL.createObjectURL(state.tracks[idx].file);
                state.preloadedTrackIdx = idx;
                if (!state.preloader) {
                    state.preloader = new Audio();
                    state.preloader.preload = 'auto';
                    state.preloader.muted = true;
                }
                state.preloader.src = state.preloadedUrl;
                state.preloader.load();
            }

            // --- SWITCH TRACK ---
            function switchToTrack(trackIdx, autoPlay = true){
                if (trackIdx < 0 || trackIdx >= state.tracks.length) return;
                if (state.isTransitioning) return;

                // Clear any pending segment-end timeout
                if (state._segmentEndTimeout) {
                    clearTimeout(state._segmentEndTimeout);
                    state._segmentEndTimeout = null;
                }
                state._pendingSegmentEnd = false;

                state.isPlaying = false;
                state.isWaitingSilence = false;
                el.audio.pause();
                if (state._animationFrame) cancelAnimationFrame(state._animationFrame);

                if (state.originalFileUrl) URL.revokeObjectURL(state.originalFileUrl);

                state.currentTrackIdx = trackIdx;
                state.currentSegIdx = 0;
                state.repeatCount = 0;
                state.isLoaded = false;
                state.isRawFallback = false;

                const track = state.tracks[trackIdx];

                const canUsePreloaded = state.preloadedTrackIdx === trackIdx && state.preloadedUrl;
                if (canUsePreloaded) {
                    state.originalFileUrl = state.preloadedUrl;
                    state.preloadedUrl = null;
                    state.preloadedTrackIdx = -1;
                    el.audio.src = state.originalFileUrl;
                } else {
                    state.originalFileUrl = URL.createObjectURL(track.file);
                    el.audio.src = state.originalFileUrl;
                }
                el.audio.preload = 'auto';
                applyPitchPreservation();
                setPlaybackSpeed(state.speed);
                el.audio.load();
                preloadNextTrack();

                el.fileProgressText.textContent = '0%';

                if (track.status === 'done' && track.segments && track.segments.length > 0) {
                    state.segments = track.segments;
                    state.waveHeights = generateWaveHeights();
                    state.isLoaded = true;
                    showWaveformLoading(false);
                    updateUI();
                    drawWaveformStatic();
                    updatePlaylistUI();
                    updateMediaSession();
                    activateControls();
                    updateSegmentProgress();

                    if (autoPlay && state.segments.length > 0) {
                        setTimeout(() => startPlayback(), 150);
                    }
                } else {
                    state.isTransitioning = autoPlay;
                    showWaveformLoading(true);
                    state.segments = (track.segments && track.segments.length) ? track.segments : [{ start: 0, end: track.duration || Infinity }];
                    state.isRawFallback = !(track.segments && track.segments.length);
                    state.waveHeights = generateWaveHeights();
                    updateUI();
                    drawWaveformStatic();
                    updatePlaylistUI();
                    updateMediaSession();
                    activateControls(false);
                    updateSegmentProgress();

                    const enableRawPlayback = () => {
                        if (state.currentTrackIdx !== trackIdx || !state.isRawFallback) return;
                        state.segments = [{ start: 0, end: isFinite(el.audio.duration) ? el.audio.duration : Infinity }];
                        state.isLoaded = true;
                        showWaveformLoading(false);
                        activateControls();
                        updateUI();
                        if (state.isTransitioning) {
                            state.isTransitioning = false;
                            setTimeout(() => startPlayback(), 100);
                        }
                    };
                    if (el.audio.readyState >= 1) {
                        enableRawPlayback();
                    } else {
                        el.audio.addEventListener('loadedmetadata', enableRawPlayback, { once: true });
                    }

                    if (track.status !== 'done' && !state.processingQueue.includes(trackIdx)) {
                        state.processingQueue.push(trackIdx);
                        processNextInQueue();
                    }
                }
            }

            function loadMergedFiles(files){
                state.cancelProcessing = true;
                loader.cancel();
                if (state.preloadedUrl) { try { URL.revokeObjectURL(state.preloadedUrl); } catch (_) {} state.preloadedUrl = null; state.preloadedTrackIdx = -1; }

                // Clear pending timeouts
                if (state._segmentEndTimeout) {
                    clearTimeout(state._segmentEndTimeout);
                    state._segmentEndTimeout = null;
                }
                state._pendingSegmentEnd = false;

                setTimeout(() => {
                    state.cancelProcessing = false;

                    state.tracks = [];
                    state.segments = [];
                    state.currentTrackIdx = 0;
                    state.currentSegIdx = 0;
                    state.isPlaying = false;
                    state.isTransitioning = false;
                    state.isRawFallback = false;
                    state.processingQueue = [];
                    state.isProcessing = false;
                    state.isLoaded = false;

                    if (state.originalFileUrl) {
                        URL.revokeObjectURL(state.originalFileUrl);
                        state.originalFileUrl = null;
                    }
                    el.audio.pause();
                    el.audio.src = '';
                    el.fileProgressText.textContent = '0%';

                    state.tracks = files.map(file => ({
                        file: file,
                        segments: [],
                        status: 'pending',
                        duration: 0,
                        totalSegments: 0,
                        loadProgress: 0
                    }));

                    if (state.tracks.length === 0) {
                        updatePlaylistUI();
                        return;
                    }

                    state.currentTrackIdx = 0;
                    switchToTrack(0, true);

                    state.tracks.forEach((_, i) => {
                        if (i !== 0) state.processingQueue.push(i);
                    });
                    processNextInQueue();
                }, 300);
            }

            // --- PLAYBACK ---
            function applyPitchPreservation(){
                const preserve = state.settings.stretch !== 'off';
                try {
                    el.audio.preservesPitch = preserve;
                    el.audio.mozPreservesPitch = preserve;
                    el.audio.webkitPreservesPitch = preserve;
                } catch (_) {}
            }

            function setPlaybackSpeed(value){
                const next = Math.min(1.5, Math.max(0.5, Number(value) || 1));
                state.speed = next;
                try {
                    el.audio.playbackRate = next;
                    applyPitchPreservation();
                } catch (_) {}
                localStorage.setItem('hs-speed', String(next));
                if (el.speedDisplay) el.speedDisplay.textContent = next.toFixed(1) + 'x';
                updateMediaSession();
            }

            function startPlayback(){
                if (state.segments.length === 0 || state.currentSegIdx >= state.segments.length) {
                    state.isTransitioning = true;
                    return;
                }
                if (!state.isAudioInitialized) setupAudio();

                const seg = state.segments[state.currentSegIdx];
                if (!seg) return;

                el.audio.currentTime = seg.start;
                setPlaybackSpeed(state.speed);
                applyPitchPreservation();

                el.audio.play().then(() => {
                    state.isPlaying = true;
                    state.isWaitingSilence = false;
                    state.isTransitioning = false;
                    updateUI();
                    updateMediaSession();
                    startWaveformAnimation();
                    updateSegmentProgress();
                }).catch(err => {
                    console.error('Play error:', err);
                    state.isPlaying = false;
                    updateUI();
                });
            }

            function stopPlayback(){
                // Clear any pending segment-end timeout
                if (state._segmentEndTimeout) {
                    clearTimeout(state._segmentEndTimeout);
                    state._segmentEndTimeout = null;
                }
                state._pendingSegmentEnd = false;

                el.audio.pause();
                state.isPlaying = false;
                state.isWaitingSilence = false;
                state.isTransitioning = false;
                updateUI();
                updateMediaSession();
                if (state._animationFrame) cancelAnimationFrame(state._animationFrame);
                updateSegmentProgress();
            }

            function prevTrack(){
                if (!state.tracks.length) return;
                const idx = (state.currentTrackIdx - 1 + state.tracks.length) % state.tracks.length;
                switchToTrack(idx, true);
            }

            function nextTrack(){
                if (!state.tracks.length) return;
                const idx = (state.currentTrackIdx + 1) % state.tracks.length;
                switchToTrack(idx, true);
            }

            function nextSegment(){
                if (state.segments.length === 0) return;
                state.isWaitingSilence = false;

                if (state.currentSegIdx + 1 < state.segments.length) {
                    state.currentSegIdx++;
                    state.repeatCount = 0;
                    const seg = state.segments[state.currentSegIdx];
                    el.audio.currentTime = seg.start;
                    updateUI();
                    drawWaveformStatic();
                    updateMediaSession();
                    updateSegmentProgress();
                    if (state.isPlaying) startPlayback();
                } else {
                    handleFileEnd();
                }
            }

            function prevSegment(){
                if (!state.segments.length) return;
                const seg = state.segments[state.currentSegIdx];
                const elapsed = seg ? Math.max(0, el.audio.currentTime - seg.start) : 0;
                if (elapsed > 2.5 || state.currentSegIdx === 0) {
                    state.repeatCount = 0;
                    state.isWaitingSilence = false;
                    if (seg) el.audio.currentTime = seg.start;
                } else if (state.currentSegIdx > 0) {
                    state.currentSegIdx--;
                    state.repeatCount = 0;
                    state.isWaitingSilence = false;
                    el.audio.currentTime = state.segments[state.currentSegIdx].start;
                }
                updateUI();
                drawWaveformStatic();
                updateMediaSession();
                updateSegmentProgress();
                if (state.isPlaying) startPlayback();
            }

            function handleFileEnd(){
                if (state.loopMode === 'track') {
                    state.currentSegIdx = 0;
                    state.repeatCount = 0;
                    state.isWaitingSilence = false;
                    if (state.isPlaying) startPlayback();
                    return;
                }
                if (state.loopMode === 'playlist') {
                    nextTrack();
                    return;
                }
                const mode = state.settings.after;
                if (mode === 'loop') {
                    state.currentSegIdx = 0;
                    state.repeatCount = 0;
                    if (state.isPlaying) startPlayback();
                } else if (mode === 'next') {
                    if (state.currentTrackIdx < state.tracks.length - 1) nextTrack();
                    else stopPlayback();
                } else {
                    stopPlayback();
                }
            }

            function setLoopMode(mode){
                state.loopMode = state.loopMode === mode ? 'none' : mode;
                const lp = $('loopPlaylistBtn');
                const lt = $('loopTrackBtn');
                if (lp) lp.classList.toggle('active', state.loopMode === 'playlist');
                if (lt) lt.classList.toggle('active', state.loopMode === 'track');
                try { localStorage.setItem('hs-loop', state.loopMode); } catch (_) {}
            }

            // BUG FIX 1: Handle segment end with proper repeat logic
            // This function handles what happens when a segment ends (either via timeupdate or onended)
            function handleSegmentEnd() {
                if (state._pendingSegmentEnd) return; // Prevent double-handling
                state._pendingSegmentEnd = true;

                const seg = state.segments[state.currentSegIdx];
                if (!seg) {
                    state._pendingSegmentEnd = false;
                    return;
                }

                state.isWaitingSilence = true;
                el.audio.pause();
                if (state._animationFrame) cancelAnimationFrame(state._animationFrame);

                state._segmentEndTimeout = setTimeout(() => {
                    state._segmentEndTimeout = null;
                    state.isWaitingSilence = false;
                    state._pendingSegmentEnd = false;
                    state.repeatCount++;

                    if (state.repeatCount < state.settings.n) {
                        el.audio.currentTime = seg.start;
                        if (state.isPlaying) {
                            el.audio.play().then(() => startWaveformAnimation());
                        }
                    } else {
                        nextSegment();
                    }
                }, state.settings.silence * 1000);
            }

            function setupAudio(){
                // Keep the media element as the clock/source of truth. Avoid inserting
                // extra processing nodes into the playback path, which reduces the
                // chance of crackle during live rate changes.
                try {
                    if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume();
                } catch (_) {}
                applyPitchPreservation();
                state.isAudioInitialized = true;
            }

            // --- WAVEFORM ---
            function drawWaveformStatic(){
                const canvas = el.waveCanvas;
                const ctx = canvas.getContext('2d');
                const rect = canvas.parentElement.getBoundingClientRect();
                canvas.width = rect.width * 2;
                canvas.height = rect.height * 2;
                ctx.scale(2, 2);

                ctx.clearRect(0, 0, rect.width, rect.height);
                ctx.fillStyle = 'rgba(76, 201, 240, 0.2)';

                const bars = state.waveHeights.length || 80;
                const barW = rect.width / bars;
                const mid = rect.height / 2;

                for (let i = 0; i < bars; i++) {
                    const h = (state.waveHeights[i] || 0.4) * rect.height * 0.6;
                    ctx.fillRect(i * barW, mid - h/2, Math.max(barW - 1, 1), h);
                }
                updateTimelineCarriage();
                renderSegmentMarkers();
            }

            function startWaveformAnimation(){
                if (state._animationFrame) cancelAnimationFrame(state._animationFrame);
                const render = () => {
                    if (!state.isPlaying || state.segments.length === 0 || state.currentSegIdx >= state.segments.length) {
                        state._animationFrame = null;
                        return;
                    }

                    const canvas = el.waveCanvas;
                    const ctx = canvas.getContext('2d');
                    const rect = canvas.parentElement.getBoundingClientRect();

                    ctx.clearRect(0, 0, rect.width, rect.height);

                    const bars = state.waveHeights.length || 80;
                    const barW = rect.width / bars;
                    const mid = rect.height / 2;
                    ctx.fillStyle = 'rgba(76, 201, 240, 0.2)';
                    for (let i = 0; i < bars; i++) {
                        const h = (state.waveHeights[i] || 0.4) * rect.height * 0.6;
                        ctx.fillRect(i * barW, mid - h/2, Math.max(barW - 1, 1), h);
                    }

                    const seg = state.segments[state.currentSegIdx];
                    if (seg) {
                        const segDur = seg.end - seg.start;
                        const progress = isFinite(segDur) && segDur > 0
                            ? Math.min(1, Math.max(0, (el.audio.currentTime - seg.start) / segDur))
                            : 0;

                        ctx.save();
                        ctx.fillStyle = 'rgba(76, 201, 240, 0.25)';
                        ctx.fillRect(0, 0, rect.width * progress, rect.height);
                        ctx.restore();
                    }
                    updateTimelineCarriage();
                    state._animationFrame = requestAnimationFrame(render);
                };
                state._animationFrame = requestAnimationFrame(render);
            }

            // --- SEGMENT PROGRESS BAR ---
            function updateSegmentProgress(){
                if (!state.isLoaded || state.segments.length === 0) {
                    el.segmentProgressFill.style.width = '0%';
                    el.segmentProgressHandle.style.left = '0%';
                    return;
                }

                const currentSeg = state.segments[state.currentSegIdx];
                if (!currentSeg) return;

                const totalSpeechTime = state.segments.reduce((sum, seg) => sum + (isFinite(seg.end - seg.start) ? (seg.end - seg.start) : 0), 0);

                let elapsedSpeech = 0;
                for (let i = 0; i < state.currentSegIdx; i++) {
                    const d = state.segments[i].end - state.segments[i].start;
                    elapsedSpeech += isFinite(d) ? d : 0;
                }

                const segEndForMath = isFinite(currentSeg.end) ? currentSeg.end : el.audio.currentTime;
                const currentPosInSeg = Math.min(el.audio.currentTime, segEndForMath) - currentSeg.start;
                elapsedSpeech += Math.max(0, currentPosInSeg);

                const progressPercent = totalSpeechTime > 0 ? (elapsedSpeech / totalSpeechTime) * 100 : 0;

                el.segmentProgressFill.style.width = Math.min(100, progressPercent) + '%';
                el.segmentProgressHandle.style.left = Math.min(100, progressPercent) + '%';
            }

            function getSegmentFromProgress(progressRatio){
                if (state.segments.length === 0) return null;

                const totalSpeechTime = state.segments.reduce((sum, seg) => sum + (isFinite(seg.end - seg.start) ? (seg.end - seg.start) : 0), 0);
                let targetSpeechTime = progressRatio * totalSpeechTime;

                let accumulatedSpeech = 0;
                for (let i = 0; i < state.segments.length; i++) {
                    const segDuration = isFinite(state.segments[i].end - state.segments[i].start) ? (state.segments[i].end - state.segments[i].start) : 0;
                    if (targetSpeechTime < accumulatedSpeech + segDuration || i === state.segments.length - 1) {
                        const timeInside = Math.max(0, Math.min(targetSpeechTime - accumulatedSpeech, segDuration));
                        return { index: i, timeInside: timeInside, segment: state.segments[i] };
                    }
                    accumulatedSpeech += segDuration;
                }

                return {
                    index: state.segments.length - 1,
                    timeInside: 0,
                    segment: state.segments[state.segments.length - 1]
                };
            }

            function handleProgressBarInteraction(e){
                if (state.segments.length === 0 || !state.isLoaded) return;

                const rect = el.segmentProgressBar.getBoundingClientRect();
                let x = (e.clientX - rect.left) / rect.width;
                x = Math.max(0, Math.min(1, x));

                const result = getSegmentFromProgress(x);
                if (!result) return;

                state.currentSegIdx = result.index;
                state.repeatCount = 0;
                state.isWaitingSilence = false;

                const targetSegment = state.segments[result.index];
                el.audio.currentTime = targetSegment.start + result.timeInside;

                updateUI();
                drawWaveformStatic();
                updateSegmentProgress();
                updateMediaSession();

                if (state.isPlaying) startPlayback();
            }

            // --- PROGRESS BAR DRAG ---
            function setupProgressBarDrag(){
                const bar = el.segmentProgressBar;
                let isDragging = false;

                const getX = (e) => {
                    const rect = bar.getBoundingClientRect();
                    let x = (e.clientX - rect.left) / rect.width;
                    return Math.max(0, Math.min(1, x));
                };

                const onMove = (x) => {
                    if (state.segments.length === 0 || !state.isLoaded) return;

                    const result = getSegmentFromProgress(x);
                    if (!result) return;

                    state.currentSegIdx = result.index;
                    state.repeatCount = 0;
                    state.isWaitingSilence = false;

                    const targetSegment = state.segments[result.index];
                    el.audio.currentTime = targetSegment.start + result.timeInside;

                    updateUI();
                    drawWaveformStatic();
                    updateSegmentProgress();
                    updateMediaSession();
                };

                bar.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    bar.classList.add('dragging');
                    const x = getX(e);
                    onMove(x);

                    const onMouseMove = (ev) => { if (isDragging) onMove(getX(ev)); };
                    const onMouseUp = () => {
                        isDragging = false;
                        bar.classList.remove('dragging');
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                        if (state.isPlaying) startPlayback();
                    };

                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                    e.preventDefault();
                });

                bar.addEventListener('touchstart', (e) => {
                    isDragging = true;
                    bar.classList.add('dragging');
                    const touch = e.touches[0];
                    const rect = bar.getBoundingClientRect();
                    let x = (touch.clientX - rect.left) / rect.width;
                    x = Math.max(0, Math.min(1, x));
                    onMove(x);

                    const onTouchMove = (ev) => {
                        if (isDragging) {
                            const touchEv = ev.touches[0];
                            const rect2 = bar.getBoundingClientRect();
                            let newX = (touchEv.clientX - rect2.left) / rect2.width;
                            newX = Math.max(0, Math.min(1, newX));
                            onMove(newX);
                        }
                    };
                    const onTouchEnd = () => {
                        isDragging = false;
                        bar.classList.remove('dragging');
                        document.removeEventListener('touchmove', onTouchMove);
                        document.removeEventListener('touchend', onTouchEnd);
                        if (state.isPlaying) startPlayback();
                    };

                    document.addEventListener('touchmove', onTouchMove, { passive: true });
                    document.addEventListener('touchend', onTouchEnd, { passive: true });
                    e.preventDefault();
                });

                bar.addEventListener('click', (e) => {
                    if (!isDragging) {
                        const x = getX(e);
                        onMove(x);
                        if (state.isPlaying) startPlayback();
                    }
                });
            }

            function handleWaveformClick(e){
                if (!state.isLoaded || !state.segments.length) return;
                const rect = el.waveCanvas.parentElement.getBoundingClientRect();
                const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const track = state.tracks[state.currentTrackIdx];
                const duration = track?.duration || el.audio.duration || 0;
                if (!duration) return;
                const target = x * duration;
                let idx = state.segments.findIndex(s => target >= s.start && target <= s.end);
                if (idx < 0) {
                    idx = state.segments.findIndex(s => s.start > target);
                    if (idx < 0) idx = state.segments.length - 1;
                }
                state.currentSegIdx = idx;
                state.repeatCount = 0;
                state.isWaitingSilence = false;
                const seg = state.segments[idx];
                el.audio.currentTime = Math.max(seg.start, Math.min(target, seg.end));
                updateUI();
                drawWaveformStatic();
                updateMediaSession();
                updateSegmentProgress();
                if (state.isPlaying) startPlayback();
            }

            function updateTimelineCarriage(){
                if (!el.timelineCarriage) return;
                const track = state.tracks[state.currentTrackIdx];
                const duration = track?.duration || el.audio.duration || 0;
                if (!duration) return;
                const seg = state.segments[state.currentSegIdx];
                const width = seg ? Math.max(8, Math.min(32, ((seg.end - seg.start) / duration) * 100)) : 14;
                const pos = Math.max(0, Math.min(100 - width, ((el.audio.currentTime / duration) * 100) - width / 2));
                el.timelineCarriage.style.width = width + '%';
                el.timelineCarriage.style.left = pos + '%';
            }

            function renderSegmentMarkers(){
                if (!el.segmentMarkers) return;
                el.segmentMarkers.innerHTML = '';
                if (!state.segments.length) return;
                const track = state.tracks[state.currentTrackIdx];
                const duration = track?.duration || el.audio.duration || 0;
                if (!duration) return;
                state.segments.forEach((seg, i) => {
                    const marker = document.createElement('span');
                    marker.className = 'segment-marker' + (i === state.currentSegIdx ? ' active' : '');
                    marker.style.left = ((seg.start / duration) * 100) + '%';
                    marker.title = `Fragment ${i + 1}`;
                    el.segmentMarkers.appendChild(marker);
                });
            }

            function activateControls(enabled = true){
                const hasSegments = state.segments && state.segments.length > 0 && state.isLoaded;
                el.btnPlay.disabled = !enabled || !hasSegments;
                el.btnNext.disabled = !enabled || !hasSegments || state.currentSegIdx >= state.segments.length - 1;
                el.btnPrev.disabled = !enabled || !hasSegments;
                el.btnPrevTrack.disabled = !enabled || state.tracks.length < 2;
                el.btnNextTrack.disabled = !enabled || state.tracks.length < 2;
                el.jumpBtn.disabled = !enabled || !hasSegments;

                if (hasSegments && state.isPlaying) {
                    el.btnPlay.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
                } else if (hasSegments) {
                    el.btnPlay.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
                }
            }

            // --- UI HELPERS ---
            function updateUI(){
                const track = state.tracks[state.currentTrackIdx];
                if (!track) return;

                const hasSegments = state.segments && state.segments.length > 0 && state.isLoaded;

                if (state.isPlaying) {
                    el.btnPlay.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
                } else {
                    el.btnPlay.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
                }

                el.btnPlay.disabled = !hasSegments;
                el.btnNext.disabled = !hasSegments || state.currentSegIdx >= state.segments.length - 1;
                el.btnPrev.disabled = !hasSegments;
                el.btnPrevTrack.disabled = state.tracks.length < 2;
                el.btnNextTrack.disabled = state.tracks.length < 2;
                el.jumpBtn.disabled = !hasSegments;

                el.trackName.textContent = track.file.name;
                const segCount = state.segments.length || track.totalSegments || 0;

                if (state.isRawFallback) {
                    el.segInfo.textContent = 'Playing – finding segments…';
                } else {
                    el.segInfo.textContent = segCount > 0 ? `Segment ${state.currentSegIdx + 1} of ${segCount}` : 'Loading segments...';
                }

                el.repeatCount.textContent = state.repeatCount + 1;
                el.repeatTotal.textContent = state.settings.n;
                el.fileCounter.textContent = `[${state.currentTrackIdx + 1}/${state.tracks.length}]`;
                el.totalSegments.textContent = state.isRawFallback ? '…' : segCount;
                el.silenceDuration.textContent = state.settings.dur.toFixed(2);

                if (track.status === 'done' && segCount > 0) {
                    el.segmentBadge.textContent = 'Ready';
                    el.segmentBadge.className = 'segment-badge ready';
                } else if (track.status === 'processing') {
                    el.segmentBadge.textContent = state.isRawFallback ? 'Analyzing…' : `Processing (${segCount})`;
                    el.segmentBadge.className = 'segment-badge loading';
                } else if (track.loadProgress > 0 && track.loadProgress < 1) {
                    el.segmentBadge.textContent = `Loading ${Math.round(track.loadProgress * 100)}%`;
                    el.segmentBadge.className = 'segment-badge loading';
                } else {
                    el.segmentBadge.textContent = 'Loading...';
                    el.segmentBadge.className = 'segment-badge pending';
                }

                if (document.activeElement !== el.jumpInput) {
                    el.jumpInput.value = state.currentSegIdx + 1;
                }

                updateSegmentProgress();
                updateTimelineCarriage();
                renderSegmentMarkers();
            }

            // BUG FIX 2: Playlist shows segment count as separate badge, not appended to filename
            function updatePlaylistUI(){
                if (state.tracks.length === 0) {
                    el.emptyMsg.style.display = 'block';
                    el.playlist.innerHTML = '';
                    return;
                }
                el.emptyMsg.style.display = 'none';
                el.playlist.innerHTML = state.tracks.map((t, i) => {
                    const segCount = t.totalSegments || t.segments?.length || 0;
                    const loadWidth = t.loadProgress !== undefined ? (t.loadProgress * 100) : 0;

                    // Determine badge state and text
                    let badgeClass = 'pending';
                    let badgeText = 'Waiting';
                    let badgeIcon = '';

                    if (t.status === 'done' && segCount > 0) {
                        badgeClass = 'ready';
                        badgeText = segCount.toString();
                        badgeIcon = 'Ready';
                    } else if (t.status === 'processing') {
                        badgeClass = 'loading';
                        badgeText = segCount > 0 ? segCount.toString() : '…';
                        badgeIcon = 'Analyzing';
                    } else if (t.loadProgress > 0 && t.loadProgress < 1) {
                        badgeClass = 'loading';
                        badgeText = `${Math.round(t.loadProgress * 100)}%`;
                    }

                    return `
                    <div class="playlist-item ${i === state.currentTrackIdx ? 'current' : ''}" onclick="window.hs_switch(${i})">
                        <span class="idx">${i + 1}</span>
                        <span class="name">${t.file.name}</span>
                        <span class="seg-badge ${badgeClass}">${badgeIcon ? '<span class="seg-icon">' + badgeIcon + '</span>' : ''}${badgeText}</span>
                        <span class="status-dot ${t.status === 'done' ? 'ready' : t.status === 'processing' ? 'loading' : 'pending'}"></span>
                        ${loadWidth > 0 ? `<div class="load-progress" style="width:${loadWidth}%"></div>` : ''}
                    </div>
                    `;
                }).join('');
            }

            function showWaveformLoading(show){
                el.waveformLoading.classList.toggle('active', show);
                if (show && !state.isRawFallback) {
                    el.segmentBadge.textContent = 'Loading...';
                    el.segmentBadge.className = 'segment-badge pending';
                }
            }

            window.hs_switch = (idx) => switchToTrack(idx, true);

            function updateMediaSession(){
                if (!('mediaSession' in navigator)) return;
                const track = state.tracks[state.currentTrackIdx];
                if (!track) return;
                const segCount = state.segments.length || track.totalSegments || 0;
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.file.name,
                    artist: segCount > 0 ? `Segment ${state.currentSegIdx + 1} / ${segCount}` : 'Loading...',
                    album: 'HablaSlice Ultra'
                });
                navigator.mediaSession.playbackState = state.isPlaying ? "playing" : "paused";
                navigator.mediaSession.setActionHandler('play', () => startPlayback());
                navigator.mediaSession.setActionHandler('pause', () => stopPlayback());
                navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
                navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
            }

            function cancelAllProcessing(){
                state.cancelProcessing = true;
                loader.cancel();
                if (state.preloadedUrl) { try { URL.revokeObjectURL(state.preloadedUrl); } catch (_) {} state.preloadedUrl = null; state.preloadedTrackIdx = -1; }
                state.isProcessing = false;
                state.processingQueue = [];
                state.isTransitioning = false;
                el.loadingOverlay.classList.remove('active');
                el.fileProgressText.textContent = '0%';
                setGlobalStatus('Ready', null);

                if (state._segmentEndTimeout) {
                    clearTimeout(state._segmentEndTimeout);
                    state._segmentEndTimeout = null;
                }
                state._pendingSegmentEnd = false;

                const track = state.tracks[state.currentTrackIdx];
                if (track && track.status === 'processing') {
                    track.status = 'pending';
                    track.loadProgress = 0;
                    updatePlaylistUI();
                    updateUI();
                }

                state.tracks.forEach(t => {
                    if (t.status === 'processing') {
                        t.status = 'pending';
                        t.loadProgress = 0;
                    }
                });

                if (state.segments && state.segments.length > 0 && state.isLoaded) {
                    activateControls();
                } else {
                    activateControls(false);
                }
            }

            // Toast notification helper
            function showToast(message, type) {
                // Simple toast implementation
                const toast = document.createElement('div');
                toast.style.cssText = `
                    position: fixed;
                    bottom: 100px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: ${type === 'error' ? 'var(--danger)' : 'var(--primary)'};
                    color: #fff;
                    padding: 10px 20px;
                    border-radius: 20px;
                    font-size: 14px;
                    z-index: 1000;
                    animation: fadeInUp 0.3s ease;
                `;
                toast.textContent = message;
                document.body.appendChild(toast);
                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transition = 'opacity 0.3s';
                    setTimeout(() => toast.remove(), 300);
                }, 3000);
            }

            // --- INIT ---
            function init(){
                el.btnOpen.onclick = (e) => {
                    e.stopPropagation();
                    el.popover.classList.toggle('active');
                    const rect = el.btnOpen.getBoundingClientRect();
                    el.popover.style.left = Math.max(8, rect.left - 20) + 'px';
                    el.popover.style.bottom = (window.innerHeight - rect.top + 12) + 'px';
                    el.popover.style.top = 'auto';
                };

                el.popFile.onclick = () => { el.popover.classList.remove('active'); el.fileInput.click(); };
                el.popFolder.onclick = () => { el.popover.classList.remove('active'); el.folderInput.click(); };

                el.fileInput.onchange = (e) => {
                    loadMergedFiles(Array.from(e.target.files));
                    e.target.value = '';
                };
                el.folderInput.onchange = (e) => {
                    loadMergedFiles(Array.from(e.target.files).filter(f => f.type.startsWith('audio/')));
                    e.target.value = '';
                };

                el.btnPrevTrack.onclick = () => prevTrack();
                el.btnNextTrack.onclick = () => nextTrack();
                el.btnPlay.onclick = () => {
                    if (state.isPlaying) {
                        stopPlayback();
                    } else {
                        startPlayback();
                    }
                };
                const loopPlaylistBtn = $('loopPlaylistBtn');
                const loopTrackBtn = $('loopTrackBtn');
                if (loopPlaylistBtn) loopPlaylistBtn.onclick = () => setLoopMode('playlist');
                if (loopTrackBtn) loopTrackBtn.onclick = () => setLoopMode('track');

                el.btnNext.onclick = () => nextSegment();
                el.btnPrev.onclick = () => prevSegment();
                el.jumpBtn.onclick = () => {
                    if (state.segments.length === 0 || !state.isLoaded) return;
                    const val = parseInt(el.jumpInput.value) - 1;
                    if (val >= 0 && val < state.segments.length) {
                        state.currentSegIdx = val;
                        state.repeatCount = 0;
                        state.isWaitingSilence = false;
                        el.audio.currentTime = state.segments[val].start;
                        updateUI();
                        drawWaveformStatic();
                        updateSegmentProgress();
                        if (state.isPlaying) startPlayback();
                    }
                };

                el.waveformOverlay.onclick = handleWaveformClick;
                setupProgressBarDrag();

                // BUG FIX 1: Improved ontimeupdate with buffer and proper last-segment handling
                el.audio.ontimeupdate = () => {
                    if (state.segments.length === 0 || state.currentSegIdx >= state.segments.length || !state.isLoaded) return;
                    const seg = state.segments[state.currentSegIdx];
                    if (!seg) return;
                    const cur = el.audio.currentTime;

                    // Use a small buffer before segment end to prevent onended from firing first
                    const segEndBuffered = isFinite(seg.end) ? seg.end - SEGMENT_END_BUFFER : Infinity;

                    if (isFinite(segEndBuffered) && cur >= segEndBuffered && !state.isWaitingSilence && state.isPlaying && !state._pendingSegmentEnd) {
                        handleSegmentEnd();
                    }

                    const dur = isFinite(seg.end) ? (seg.end - seg.start) : (el.audio.duration - seg.start);
                    el.timeInfo.textContent = `${Math.max(0, cur - seg.start).toFixed(1)}s / ${(dur || 0).toFixed(1)}s`;

                    updateSegmentProgress();
                    updateTimelineCarriage();
                };

                // BUG FIX 1: Handle onended to check for pending repeats on last segment
                el.audio.onended = () => {
                    if (!state.isPlaying) return;

                    const seg = state.segments[state.currentSegIdx];
                    if (!seg) {
                        handleFileEnd();
                        return;
                    }

                    // If we're on the last segment and haven't finished all repeats,
                    // treat it as a segment end (not file end)
                    const isLastSegment = state.currentSegIdx >= state.segments.length - 1;
                    const hasPendingRepeats = state.repeatCount < state.settings.n - 1;

                    if (isLastSegment && hasPendingRepeats && !state._pendingSegmentEnd) {
                        handleSegmentEnd();
                    } else {
                        handleFileEnd();
                    }
                };

                // --- SETTINGS / NAVIGATION ---
                el.btnSettings.onclick = () => el.settingsModal.classList.add('active');
                const modalClose = $('modalClose');
                if (modalClose) modalClose.onclick = () => el.settingsModal.classList.remove('active');
                const navFiles = $('navFiles'), navPlayer = $('navPlayer'), navSettings = $('navSettings');
                if (navFiles) navFiles.onclick = (e) => { e.stopPropagation(); el.btnOpen.click(); };
                if (navPlayer) navPlayer.onclick = () => { el.popover.classList.remove('active'); };
                if (navSettings) navSettings.onclick = () => el.settingsModal.classList.add('active');
                el.btnCancel.onclick = () => el.settingsModal.classList.remove('active');

                const updateSettingVal = (id, val) => {
                    const elVal = $(`${id}Val`);
                    if (elVal) elVal.textContent = typeof val === 'number' ? val.toFixed(id === 'db' ? 0 : 2) : val;
                };

                el.setDb.oninput = () => updateSettingVal('db', parseFloat(el.setDb.value));
                el.setDur.oninput = () => updateSettingVal('dur', parseFloat(el.setDur.value));
                el.setFrag.oninput = () => updateSettingVal('frag', parseFloat(el.setFrag.value));
                el.setSil.oninput = () => updateSettingVal('sil', parseFloat(el.setSil.value));

                document.querySelectorAll('.step-btn').forEach(btn => {
                    btn.onclick = () => {
                        const input = $(btn.dataset.target);
                        if (!input) return;
                        const step = parseFloat(input.step) || 1;
                        input.value = parseFloat(input.value) + (parseInt(btn.dataset.dir) * step);
                        input.dispatchEvent(new Event('input'));
                    };
                });

                el.btnApply.onclick = () => {
                    state.settings.db = parseInt(el.setDb.value);
                    state.settings.dur = parseFloat(el.setDur.value);
                    state.settings.minFrag = parseFloat(el.setFrag.value);
                    state.settings.silence = parseFloat(el.setSil.value);
                    el.settingsModal.classList.remove('active');

                    state.tracks.forEach((track) => {
                        track.status = 'pending';
                        track.segments = [];
                        track.totalSegments = 0;
                        track.loadProgress = 0;
                    });
                    state.processingQueue = [];
                    state.isProcessing = false;
                    state.segments = [];
                    state.isLoaded = false;
                    state.tracks.forEach((_, i) => {
                        state.processingQueue.push(i);
                    });
                    if (state.tracks.length > 0) {
                        switchToTrack(state.currentTrackIdx, false);
                    }
                    processNextInQueue();
                };

                const PRESETS = {
                    podcasts: { db: -40, dur: 0.4, minFrag: 0.8 },
                    movies: { db: -35, dur: 0.6, minFrag: 1.0 },
                    audiobooks: { db: -48, dur: 0.5, minFrag: 1.5 },
                    music: { db: -55, dur: 1.5, minFrag: 5.0 }
                };

                const presetBtns = document.querySelectorAll('.preset-select button');
                presetBtns.forEach(btn => {
                    btn.onclick = () => {
                        const pKey = btn.dataset.preset;
                        const config = PRESETS[pKey];
                        if (config) {
                            state.settings.db = config.db;
                            state.settings.dur = config.dur;
                            state.settings.minFrag = config.minFrag;
                            el.setDb.value = config.db;
                            el.setDur.value = config.dur;
                            el.setFrag.value = config.minFrag;
                            updateSettingVal('db', config.db);
                            updateSettingVal('dur', config.dur);
                            updateSettingVal('frag', config.minFrag);
                            presetBtns.forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                        }
                    };
                });

                const algoBtns = document.querySelectorAll('.algo-select button');
                algoBtns.forEach(btn => {
                    btn.onclick = () => {
                        state.settings.algo = btn.dataset.algo;
                        algoBtns.forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                    };
                });

                const setupDrop = (id, valKey, displayId) => {
                    const drop = $(id);
                    const toggle = drop.querySelector('.toggle');
                    toggle.onclick = (e) => {
                        e.stopPropagation();
                        drop.classList.toggle('open');
                    };
                    drop.querySelectorAll('.item').forEach(item => {
                        item.onclick = (e) => {
                            e.stopPropagation();
                            const val = item.dataset.value;
                            if (valKey === 'speed') {
                                setPlaybackSpeed(parseFloat(val));
                            } else if (valKey === 'silenceMs') {
                                state.settings.silence = parseInt(val, 10) / 1000;
                                if (el.setSil) el.setSil.value = state.settings.silence;
                                if (el.silVal) el.silVal.textContent = state.settings.silence.toFixed(2);
                            } else if (valKey === 'stretch') {
                                state.settings.stretch = val;
                                localStorage.setItem('hs-stretch', val);
                                applyPitchPreservation();
                            } else {
                                state.settings[valKey] = parseInt(val);
                                if (valKey === 'n') localStorage.setItem('hs-repeats', String(state.settings.n));
                            }
                            const display = $(displayId);
                            if (display) display.textContent = item.textContent;
                            drop.querySelectorAll('.item').forEach(i => i.classList.remove('selected'));
                            item.classList.add('selected');
                            drop.classList.remove('open');
                            updateUI();
                        };
                    });
                };
                setupDrop('speedDropdown', 'speed', 'speedDisplay');
                setupDrop('repeatsDropdown', 'n', 'repeatsDisplay');
                setupDrop('silencePauseDropdown', 'silenceMs', 'silencePauseDisplay');
                setupDrop('stretchDropdown', 'stretch', 'stretchDisplay');

                const afterDrop = el.afterDropdown;
                el.afterToggle.onclick = (e) => {
                    e.stopPropagation();
                    afterDrop.classList.toggle('open');
                };
                afterDrop.querySelectorAll('.item').forEach(item => {
                    item.onclick = (e) => {
                        e.stopPropagation();
                        state.settings.after = item.dataset.value;
                        el.afterDisplay.textContent = item.textContent;
                        afterDrop.classList.remove('open');
                    };
                });

                el.themeDark.onclick = () => {
                    document.body.classList.add('dark-theme');
                    localStorage.setItem('hs-theme','dark');
                    el.themeDark.classList.add('active');
                    el.themeLight.classList.remove('active');
                };
                el.themeLight.onclick = () => {
                    document.body.classList.remove('dark-theme');
                    localStorage.setItem('hs-theme','light');
                    el.themeLight.classList.add('active');
                    el.themeDark.classList.remove('active');
                };

                el.cancelLoadBtn.onclick = cancelAllProcessing;

                el.btnReset.onclick = () => {
                    cancelAllProcessing();
                    state.tracks = [];
                    state.segments = [];
                    state.currentTrackIdx = 0;
                    state.currentSegIdx = 0;
                    state.isPlaying = false;
                    state.isTransitioning = false;
                    state.isRawFallback = false;
                    state.isLoaded = false;
                    state.processingQueue = [];
                    state.isProcessing = false;
                    el.audio.pause();
                    if (state.originalFileUrl) URL.revokeObjectURL(state.originalFileUrl);
                    el.audio.src = '';
                    el.fileProgressText.textContent = '0%';
                    updateUI();
                    updatePlaylistUI();
                    activateControls(false);
                    el.trackName.textContent = '—';
                    el.segInfo.textContent = 'Ready';
                    el.timeInfo.textContent = '0.0s / 0.0s';
                    el.segmentProgressFill.style.width = '0%';
                    el.segmentProgressHandle.style.left = '0%';
                };

                document.addEventListener('click', () => {
                    el.popover.classList.remove('active');
                    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
                });

                el.settingsModal.addEventListener('click', (e) => {
                    if (e.target === el.settingsModal) el.settingsModal.classList.remove('active');
                });

                el.speedDisplay.textContent = state.speed.toFixed(1) + 'x';
                setLoopMode(state.loopMode);
                el.silencePauseDisplay.textContent = Math.round(state.settings.silence * 1000) + ' ms';
                el.stretchDisplay.textContent = state.settings.stretch === 'native' ? 'Pitch preserved' : 'Standard';
                el.repeatsDisplay.textContent = String(state.settings.n);
                el.repeatTotal.textContent = String(state.settings.n);
                el.setFrag.value = state.settings.minFrag;
                updateSettingVal('frag', state.settings.minFrag);
                if (state.settings.theme === 'light') {
                    document.body.classList.remove('dark-theme');
                    el.themeLight.classList.add('active');
                    el.themeDark.classList.remove('active');
                } else {
                    document.body.classList.add('dark-theme');
                }
                activateControls(false);
                updateSegmentProgress();
                setGlobalStatus('Ready', null);
            }

            init();
        })();
    