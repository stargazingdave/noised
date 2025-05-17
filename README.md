# 🌧️ Noised

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
I'll soon add a website with more of my projects.