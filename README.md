# HablaSlice

A Progressive Web App (PWA) for language learning that slices audio files into segments based on silence detection. Perfect for shadowing practice, pronunciation training, and listening comprehension exercises.

The application is available at the link: https://dotermine.github.io/HablaSlice/

## Features

- **Silence-based segmentation** - Automatically splits audio files into segments at silence points
- **Multi-file support** - Load entire folders of audio files
- **Seamless playback** - Merges all files into a single continuous stream for uninterrupted background playback
- **Segment repetition** - Repeat each segment N times for focused practice
- **Speed control** - Adjust playback speed from 0.5x to 2.0x
- **Waveform visualization** - Interactive waveform with progress indicator
- **Dark / Light theme** - Material Design 3 styling with AMOLED-friendly dark theme
- **Media Session API** - Works with lock screen controls on mobile devices
- **Offline capable** - PWA with service worker support
- **Persistent state** - Remembers your last session


<img width="357" height="657" alt="scr2" src="https://github.com/user-attachments/assets/48111b7e-3448-4ac1-a8da-bd82e5220357" />

<img width="357" height="657" alt="scr3" src="https://github.com/user-attachments/assets/5a216cf0-86ef-47a6-9dbd-9fbc395f3d9d" />

<img width="357" height="162" alt="scr1" src="https://github.com/user-attachments/assets/0b21bf33-bf3d-4a5a-840a-11d0bb568476" />


## How It Works

1. **Load audio files** - Select individual files or entire folders
2. **Silence detection** - The app analyzes audio and splits at silence points based on:
   - Silence threshold (dB) - Lower values detect more silence
   - Minimum silence duration - Minimum silence length to create a split
3. **Seamless merging** - All files are combined into one continuous stream
4. **Practice mode** - Each segment repeats N times before moving to the next

## Controls

- **Play / Pause** - Center button
- **Previous / Next** - Navigate between segments
- **Speed** - Adjust playback speed
- **Repeats** - Set number of repetitions per segment
- **Jump** - Go directly to a specific segment
- **Settings** - Adjust silence detection parameters

## Installation

### As a Web App

1. Open `index.html` in your browser
2. For PWA installation, the browser will prompt you to install

### As a PWA on Mobile

1. Open the page in Chrome or Safari
2. Select "Add to Home Screen" or "Install App"
3. The app will work offline after first load

## Usage Tips

### For Language Learning

1. Load audio files with native speaker recordings
2. Each file will be split into individual phrases or sentences
3. Set repeats to 3-5 for intensive practice
4. Start with slower speed (0.7x-0.8x) for difficult passages
5. Gradually increase speed as you improve

## Settings Reference

### Quick Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Silence gap | Comfort noise between repeats | 0.3s |
| After file ends | What happens when a file completes | Next track |

### Segmentation Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Silence threshold | Sensitivity of silence detection (-60 to -10 dB) | -40 dB |
| Min silence duration | Minimum silence to create a split (0.1-3.0s) | 0.5s |

*Note: Changes to segmentation settings require re-processing the audio file.*

## Key Technical Decisions

1. **Merged Buffer Approach** - All files are decoded and merged into a single AudioBuffer to ensure seamless background playback and prevent audio focus loss during file transitions.

2. **Single Audio Element** - A single `<audio>` element is used with a dynamically generated WAV URL from the merged buffer, eliminating the need to reload src during file switching.

3. **Web Audio API Integration** - The audio element is connected through Web Audio API for gain control and noise generation during silence gaps.

4. **Silence Detection** - Custom algorithm that analyzes audio amplitude and splits at silence points based on user-configurable thresholds.

5. **State Persistence** - Playback state and settings are saved to localStorage for session restoration.
