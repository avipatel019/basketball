# Hoops3 — Open & Customizable 3v3 Tournament Maker 🏀

Build and run your own 3-on-3 basketball tournament right in the browser.
Pick a format, add as many teams as you want, bend the rules to fit your run,
and keep score live. No accounts, no sign-up, no backend — everything saves to
your browser's local storage.

## Preview

Open `index.html` in any modern browser — no build step or dependencies required.

```bash
# optional: serve locally
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Features

- **Three formats**
  - **Single Elimination** — classic knockout bracket. Any number of teams;
    byes are seeded to the top teams automatically.
  - **Round Robin** — everyone plays everyone (single or double), with live
    standings. Schedule is built so no team plays twice in the same round.
  - **Pool Play + Playoffs** — a round-robin pool, then the top _N_ teams
    advance into a seeded knockout bracket.
- **Fully customizable rules** — game target score, win-by-2, scoring style
  (FIBA 3x3 1 & 2 pts, streetball 2 & 3, or custom), game clock length, and the
  number of courts running at once.
- **Unlimited teams** — add one at a time or paste a whole list. Recolor each
  team, reorder seeds, shuffle the draw, and add optional player rosters.
- **Live scoreboard** — per-game point buttons that match your scoring style, a
  start/pause/reset game clock, automatic win detection, and one-tap "set
  winner". Bracket winners advance automatically.
- **Standings** with games played, W–L, points for/against, and differential
  (with sensible tiebreakers).
- **Champion** banner when the tournament is decided.
- **Open & portable** — auto-saves as you go, **export** to a `.json` file and
  **import** it back later or on another device, **print** a clean bracket, and
  toggle **light/dark** themes.

## Formats at a glance

| Format | Best for | Decides winner by |
| --- | --- | --- |
| Single Elimination | Fast, one-day knockouts | Last team standing |
| Round Robin | Small leagues, fairest schedule | Standings |
| Pool Play + Playoffs | Bigger events | Pool seeds → bracket |

## Tech

Plain HTML, CSS, and vanilla JavaScript — no frameworks, no dependencies. The
tournament engine (bracket seeding, round-robin scheduling, standings) is
written as pure functions and exposed on `window.Hoops3` for tinkering in the
console.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App structure: setup, games/bracket, standings, scoreboard |
| `styles.css` | Theming (light/dark), layout, bracket & scoreboard styling |
| `script.js` | State, persistence, tournament logic, rendering, scoring |

## Customizing

- **Rules & format** live in the Setup tab — no code needed.
- **Defaults** (starting rules, team colors) are in the `DEFAULT_RULES` and
  `PALETTE` constants at the top of `script.js`.
- **Brand colors / theme** are CSS variables in the `:root` and
  `[data-theme]` blocks of `styles.css` (`--accent` is the basketball orange).

## Data & privacy

Everything stays on your device in `localStorage`. Use **Export** to back a
tournament up or move it between devices; **New** clears the current one.
