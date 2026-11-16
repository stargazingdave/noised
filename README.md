# 🌧️ Noised

> [!WARNING]
> **This version of Noised is deprecated.** Timing issues in the original implementation made audio playback unreliable.
>
> Use [the new version (`noised-web`)](https://github.com/stargazingdave/noised-web) instead. Its implementation fixes the timing issues and improves parameter control and live playback management.
>
> This repository remains available for reference.

A lightweight TypeScript library for procedural **rain** and **thunder** sound generation using the Web Audio API.  
Perfect for ambience apps, games, or chill projects.

---

## 🎧 Features

- 🌧️ Realistic rain synthesis with adjustable drop rate, pitch, decay, and EQ
- ⚡ Procedural thunder bursts with reverb, stereo spread, and randomness
- 🎚️ Full parameter control with support for oscillation and randomization
- 📦 Easily importable into any modern JS/TS project
- 🪶 Lightweight, no dependencies

---

## 🚀 Installation

```bash
npm install noised
```

---

## 🛠️ Usage

```ts
import { RainGenerator, ThunderGenerator } from 'noised';

// Create audio context
const audioCtx = new AudioContext();

// Setup rain
const rain = new RainGenerator(audioCtx, yourRainParams);
rain.start();

// Setup thunder
const thunder = new ThunderGenerator(audioCtx, yourThunderParams);
thunder.trigger(); // on demand
```

## 📦 Build
```bash
npm run build
```

For dev mode with watch:
```bash
npm run dev
```

## 🧙 Author
The name is David Portal, hi 😊
You can find more of my projects at [davidportal.dev](https://davidportal.dev).
