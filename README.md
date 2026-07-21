# 7-0 · Sete a Zero

A football skill-betting game prototype. Draft an XI from 81 historical World Cup squads, lock your formation, and bet on how your team performs across a 7-match simulated tournament run. Odds are priced from your specific squad using a Monte Carlo simulation — not set arbitrarily.

## How to run locally

No build step required. Serve the project root over HTTP:

```bash
python3 -m http.server 5173
```

Then open [http://localhost:5173](http://localhost:5173).

> Opening `index.html` directly as a `file://` URL will not work — the browser blocks module loading over the file protocol.

## How to deploy

This is a plain HTML/CSS/JS project with no dependencies to install. It runs on GitHub Pages out of the box:

1. Push the repo to GitHub
2. Go to **Settings → Pages → Source → Deploy from branch**
3. Select `main` / `root`
4. GitHub Pages will serve `index.html` at your Pages URL

## Project structure

```
index.html          Entry point
src/
  styles.css        Custom CSS (Tailwind extensions + animations)
  data.js           Squad pools (81 historical WC squads), formations, opponents
  rng.js            Seeded PRNG + crypto seed generation
  sim.js            Deterministic match simulator (Poisson goal model)
  odds.js           Monte Carlo odds engine (250 samples per session)
  store.js          Application state (custom reactive store)
  app.jsx           React UI (compiled in-browser via Babel)
```

## Stack

- React 18 (UMD, no bundler)
- Tailwind CSS (CDN)
- Babel standalone (in-browser JSX transform)
- No backend, no database, no build step

## Concept

Each draft is unique. The dice rolls a random historical World Cup squad — you pick one player, then it rolls again. After 11 picks from 11 different eras, your XI is locked. The Monte Carlo engine prices every market from your specific squad's attack and defence indices. A stronger XI gets tighter odds. Football knowledge has real value.

Each draw includes one free re-roll. Additional re-rolls cost ₦10 each — spend them on chasing a star striker or saving them for the betting phase.
