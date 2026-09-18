# HablaSlice — optimized PWA

This is a dependency-free browser PWA replacement for a silence-aware audio splitter/player.

## What changed

- **No cumulative timecode math.** Segment boundaries are absolute media times derived from the Web Audio clock and periodically re-anchored to `HTMLMediaElement.currentTime`. Segments are never positioned by adding the duration of earlier segments.
- **Hysteresis VAD.** Separate open/close thresholds, speech attack time, minimum silence duration, minimum segment duration and boundary padding reduce chatter, bleed and accidental cuts.
- **Adaptive noise floor.** During the first second the analyzer estimates a conservative noise floor and adjusts the opening threshold within the configured limit.
- **Immediate playback.** The native media element is allowed to buffer/play as soon as the file is opened; analysis runs concurrently through an `AudioWorklet`.
- **Incremental segment list.** Segments are inserted as silence boundaries are detected rather than waiting for a full-file decode.
- **Segment playback without re-exporting audio.** A segment is played by seeking the original media element to an absolute start time and stopping at its absolute end. This avoids creating one decoded AudioBuffer per segment and keeps memory use low.
- **Repeat.** Repeat loops only the active segment.
- **PWA/offline shell.** Service worker caches the application shell. User audio is local and is not uploaded.
- **Apple-inspired UI.** English-only labels, no emoji controls, SVG icons, 44px+ controls, dark/light palettes matching the requested values.

## Important browser behavior

A local audio file is not demuxed into independent compressed chunks by the Web Audio API. Therefore this implementation deliberately does **not** pretend that arbitrary MP3/M4A byte ranges can safely be decoded independently. Playback uses the browser's native media pipeline while VAD observes its decoded PCM stream through `MediaElementAudioSourceNode`.

This provides true lazy/incremental analysis and avoids the large upfront `decodeAudioData(file)` operation. The first detected segments become available while playback is already running.

For maximum boundary precision, keep playback at 1× during analysis. The analyzer periodically re-anchors its audio-clock mapping to the media element; changing playback speed is supported for playback, but analysis boundaries are inherently most stable at 1×.

## Run

Serve the directory from an HTTP(S) origin because `AudioWorklet`, module scripts and service workers are restricted on `file://` in many browsers.

Examples:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Detection controls

- **Silence threshold:** signal level that begins/ends speech detection.
- **Minimum silence:** how long quiet audio must persist before a boundary is committed.
- **Minimum segment:** prevents tiny accidental segments.
- **Boundary padding:** a small amount of audio retained around speech onset/end to prevent hard clipping.

The defaults intentionally favor avoiding bleed/cutoff over aggressively removing every millisecond of silence.
