# AudioSync Hub 🔊

A cross-platform desktop application that plays audio simultaneously through **multiple audio output devices** connected to your PC — including Bluetooth speakers, wired headphones, and USB DACs.

Built with **Electron + React + TypeScript** on the frontend and a native **Python WASAPI Loopback Engine** on the backend for zero-latency, crystal-clear multi-device audio routing on Windows.

![AudioSync Hub Screenshot](docs/screenshot.png)

---

## ✨ Features

- **Multi-Device Audio Output** — Route system audio to multiple speakers/headphones at the same time
- **Native WASAPI Loopback** — Captures audio at the OS level using Windows Audio Session API (no browser hacks)
- **Per-Device Volume Control** — Adjust volume independently for each device, with up to 200% boost
- **Latency Offset Slider** — Fine-tune sync delay per device in milliseconds to align Bluetooth with wired
- **Live Device Discovery** — Refresh detects newly connected Bluetooth/USB devices in real-time via PowerShell
- **Zero-Feedback Architecture** — No echo, no feedback loops — pure loopback capture routed directly to output
- **Micro-Drift Correction** — Automatically corrects hardware clock drift between devices without audible artifacts
- **Beautiful Dark UI** — Glassmorphism design with smooth animations and live status indicators

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│         Electron Main Process           │
│  ┌───────────┐    ┌──────────────────┐  │
│  │  BrowserWindow │  │  engine.exe (Python) │  │
│  │  React + TS UI │◄─►│  PyAudioWPatch       │  │
│  │  (renderer)    │IPC│  WASAPI Loopback     │  │
│  └───────────┘    └──────────────────┘  │
└─────────────────────────────────────────┘
         ▲                    ▲
         │                    │
    User Controls       System Audio
    (volume, delay,     (Spotify, YouTube,
     device select)      games, etc.)
```

### How It Works

1. **Loopback Capture** — The Python engine hooks into the default Windows speaker's WASAPI loopback endpoint, capturing all system audio as raw PCM float32 data.
2. **C-Level Callbacks** — `PyAudioWPatch` uses PortAudio's native C callbacks for both input and output streams, running entirely outside Python's GIL for glitch-free performance.
3. **Per-Device Buffering** — Each output device has its own lock-free deque + bytearray buffer. Volume is applied as numpy multiplication with soft-clipping (`np.clip`) for boost mode.
4. **Micro-Drift Correction** — The output callback monitors buffer fill level and silently skips or duplicates individual frames (~0.02ms) to keep devices in perfect sync without audible pops.
5. **Device Discovery** — Uses PowerShell `Get-PnpDevice` for live device enumeration (bypasses PortAudio's cached device list) and cross-references names to PyAudio indices.

---

## 🚀 Quick Start

### Option 1: Portable .exe (No Install Needed)

1. Download `AudioSyncHub-Windows-Portable.zip` from [Releases](https://github.com/Keerthu-1811/AudioSync-Hub/releases)
2. Extract the zip
3. Run `AudioSync Hub.exe`
4. Click **START ENGINE**, select your devices, and enjoy!

### Option 2: Development Setup

**Prerequisites:**
- [Node.js](https://nodejs.org/) v18+
- [Python](https://python.org/) 3.10+
- Windows 10/11

```bash
# Clone the repo
git clone https://github.com/Keerthu-1811/AudioSync-Hub.git
cd AudioSync-Hub

# Install Node dependencies
npm install

# Set up Python virtual environment
cd scratch
python -m venv venv
.\venv\Scripts\activate
pip install pyaudiowpatch numpy pycaw
cd ..

# Run in development mode
npm run dev
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Tailwind CSS v4 |
| **Desktop Shell** | Electron 42 |
| **Audio Engine** | Python 3.13, PyAudioWPatch (PortAudio + WASAPI) |
| **Device Enum** | PowerShell `Get-PnpDevice`, pycaw (COM) |
| **IPC** | JSON over stdin/stdout pipes |
| **Packaging** | PyInstaller (engine.exe), electron-builder |

---

## 📁 Project Structure

```
AudioSync-Hub/
├── electron/
│   ├── main.js          # Electron main process, spawns engine
│   └── preload.js       # Secure IPC bridge
├── src/
│   └── App.tsx          # React UI with glassmorphism design
├── engine.py            # Python WASAPI audio engine
├── bin/
│   └── engine.exe       # Compiled standalone engine
├── package.json         # Node config + electron-builder settings
└── README.md
```

---

## 🔧 Building from Source

```bash
# Compile the Python engine to a standalone .exe
.\scratch\venv\Scripts\activate
pyinstaller --onefile --noconsole --distpath bin --name engine engine.py

# Build the full Electron app
npm run build

# Package for Windows distribution
npm run package
```

---

## ⚠️ Known Limitations

- **Windows Only** — WASAPI loopback is a Windows-specific API. macOS/Linux support is planned for future releases.
- **Default Speaker Capture** — The engine captures audio from the system's default output device. If you change your default speaker while the engine is running, restart the engine.
- **Bluetooth Latency** — Bluetooth devices inherently have 50-200ms of latency. Use the per-device delay slider to align them with wired devices.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [PyAudioWPatch](https://github.com/s0d3s/PyAudioWPatch) — WASAPI loopback support for Python
- [Electron](https://electronjs.org/) — Cross-platform desktop framework
- [Lucide Icons](https://lucide.dev/) — Beautiful open-source icons
