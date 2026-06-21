# Ember & Oak — Candle Landing Page

A responsive, single-page marketing site for a hand-poured candle brand,
showcasing different candles and their signature scents.

## Preview

Open `index.html` in any modern browser — no build step or dependencies required.

```bash
# optional: serve locally
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Features

- **Hero** with an animated, flickering CSS candle and glowing ambiance.
- **Scent collections** — browse by mood: Fresh, Warm, Woody, Floral.
- **Product grid** of 8 candles with full fragrance notes (top / heart / base),
  price, and burn time. Filter by scent family.
- **Scent Finder** — pick a mood ("Unwind", "Get cozy", "Romance"…) and get a
  matched candle recommendation.
- **Add-to-cart** counter with toast notifications.
- **Reviews**, brand **story**, and a **newsletter** signup with validation.
- Fully **responsive** with a mobile nav drawer, scroll-reveal animations, and a
  `prefers-reduced-motion` fallback.

## Tech

Plain HTML, CSS, and vanilla JavaScript — no frameworks. All candle artwork is
rendered with CSS (no image assets), so the page is fully self-contained.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and content |
| `styles.css` | Styling, layout, and candle/flame artwork |
| `script.js` | Product rendering, filtering, scent finder, cart, animations |

## Customizing

Edit the `products` array in `script.js` to change candles, scents, prices, or
colors. Brand colors and fonts live in the `:root` block of `styles.css`.
