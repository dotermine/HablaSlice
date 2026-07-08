# HablaSlice

**Smart player for learning foreign languages with automatic fragmentation**

HablaSlice is a progressive web application (PWA) for learning foreign languages through listening to audio materials. It automatically splits audio files into meaningful fragments based on pauses and allows you to repeat them with a comfortable silence interval, creating ideal conditions for imitation learning.


<img width="1080" height="1989" alt="p1" src="https://github.com/user-attachments/assets/011e66a8-4278-42ec-a325-60c73b4820e6" />
<img width="1075" height="2012" alt="p2" src="https://github.com/user-attachments/assets/cc080cc7-cefa-4b7e-847f-742d2e26f940" />
<img width="1075" height="2015" alt="p3" src="https://github.com/user-attachments/assets/8dfe3cfe-a54b-4362-a429-985ed9ebcbe4" />
<img width="963" height="435" alt="p5" src="https://github.com/user-attachments/assets/741f81cc-f760-49f3-beb9-4c738501118b" />

## Features

### Automatic segmentation
- Smart division of audio into fragments by silence
- Adjustable sensitivity threshold and minimum pause duration
- Support for all popular audio formats (MP3, WAV, OGG, M4A, FLAC, AAC, OPUS, WEBM)

### Intelligent repetition
- Configurable number of repetitions for each fragment
- Silence interval between repetitions with comfort noise
- Muting original sound in pause zones for clean perception

### Flexible control
- Playback speed adjustment
- Switching between files and folders
- Control via lock screen (Media Session API)
- Wake Lock support to prevent screen sleep

### PWA capabilities
- Works in browser without installation
- Offline mode support
- Ability to install on home screen
- Works on iOS, Android and Desktop

## Quick Start

### Online version
1. Open the application in a browser
2. Click the "Open" button in the bottom panel
3. Select one or more audio files or an entire folder
4. Enjoy automatic splitting and repetition

### Installation as PWA
- **Chrome / Edge**: Click "Install" in the address bar or through the menu
- **Safari (iOS)**: Tap "Share" -> "Add to Home Screen"
- **Firefox**: PWA support is limited, use other browsers

## Controls

### Main elements
| Element | Action |
|---------|----------|
| Play/Pause | Playback/Pause |
| Previous | Previous fragment |
| Next | Next fragment |
| Open | Open file(s) or folder |
| Settings | Settings |
| Speed | Speed adjustment |
| Repeats | Number of repeats |

## Settings

### Quick settings (applied instantly)
- **Silence between repeats** — pause with comfort noise between repetitions
- **After file ends** — action after file completion: Loop / Next track / Stop

### Segmentation settings (require reanalysis)
- **Silence detection threshold** — sensitivity threshold for silence (-60 to -10 dB)
- **Minimum silence duration** — minimum pause duration for separation (0.1-3 sec)

## Technical Stack
- **Pure HTML/CSS/JavaScript** — no external dependencies
- **Web Audio API** — volume control and noise generation
- **Media Session API** — lock screen control
- **Wake Lock API** — preventing screen sleep
- **Service Worker** — offline mode and caching
- **LocalStorage** — saving settings and state

## How it works
1. **Audio loading**: The application reads selected files through File API
2. **Silence analysis**: Analyzes the audio track to determine pauses
3. **Segmentation**: Splits audio into fragments based on found pauses
4. **Playback**: Plays fragments with the specified number of repetitions
5. **Intelligent pauses**: Inserts comfort noise between repetitions, muting original sound
6. **Switching**: Automatically moves to the next file or loops

## Ideal usage scenario
1. Load an audio course or podcast in the language you're learning
2. The application will automatically split it into phrases
3. Set 3-5 repetitions and 0.5-1 sec pause
4. Repeat after the speaker during pauses
5. Gradually increase speed to 1.2-1.5x for perception training

## Known limitations
- When loading large folders (>50 files), analysis may take time
- Some browsers may limit the number of simultaneous files
- On iOS, version 15+ is required for full PWA functionality

---

**HablaSlice** — from Spanish "Habla" (speak) and English "Slice" (to cut). Speak fluently, fragment by fragment!
