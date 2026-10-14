# Nu_Territory

Interactive 3D map of the **Competitive Positioning Framework** (slide 149 of the Nu Asset Comms Planning deck, Colírio / QNCO).
Every brand on the chart is clickable and opens its brand bench (slides 150–263): brand reading, ETFs, highlights and "Para a Nu Asset".

## Views

- **Pontos / Logos**: dots coloured by category, or each brand's logo as a tile.
- **Mapa / Galeria** (logos only): tiles at their exact chart positions, or a curved 3D gallery ordered from complex to simple.
- **3D / Vista do slide**: depth separates Brazilian and global brands; the slide view is the flat front view identical to slide 149.
- Filters (Todos / Bancos / Gestoras), search (`/` or ⌘K), ← → to step through brands, Esc to close.

The scene renders on demand: with no input it draws nothing and stays still.

## Data

- `src/data/brands.json`: positions read from the slide's element coordinates via the Google Slides API (normalised to −1…1 on each axis) plus the bench text.
- `src/data/logos.ts`: logos embedded as data URIs, from the MIT-licensed npm packages `logos-bancos-br` (Banco Central / Open Finance sources) and `@thesvg/icons`. Brands without a logo file render as a monogram tile.
- Bank vs. asset-manager classification and the Brasil/Global depth axis are editorial choices, not read from the slide.

## Stack

React 18 · TypeScript · Vite · Tailwind CSS · [shadcn/ui](https://ui.shadcn.com) (new-york style, components in `src/components/ui`) · three.js.
Theme tokens live in `src/index.css` (Nu purple `#820AD1` on black).

## Typeface

The UI is set in **Nu Sans Text** (Nubank, Regular cut only; hierarchy comes from size and tracking, `font-synthesis: none` prevents fake bold).
The font file is proprietary and is **not committed**. Place it at `public/fonts/NuSansText-Regular.woff2` before running; without it the page falls back to the system sans.

```bash
npm install
npm run dev     # local dev server
npm run build   # type-check + single self-contained dist/index.html
```
