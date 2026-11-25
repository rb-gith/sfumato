# Sfumato

A colour wheel for your phone: drag a dot, see the colours that go with it, and keep the combinations you like.
Works offline, needs no account, and keeps everything on your phone. In English and Italian.

**Open it:** https://rb-gith.github.io/sfumato/ — then in Chrome tap ⋮ → *Install app*.

## What it does

- **Colour wheel** with two kinds of wheel:
  - **Painter** (red, yellow, blue, as taught in art class: the opposite of red is green)
  - **Screen** (red, green, blue light: the opposite of red is cyan)
- **Matching colours** chosen with picture buttons: opposite, neighbours, wide neighbours, triad, split, narrow triangle, square, rectangle, double split and hexagon. Drag the big dot and the others follow.
- **Light and dark:** your colour mixed with white (tints), grey (tones) or black (shades).
- **Learn:** five short pages on primary and secondary colours, warm and cool, light and wavelengths, mixing light vs paint, and what each matching button does, with sources.
- **Brightness** slider, and every colour's code (tap to copy).
- **Palettes:** save, name, rename, delete; share a picture of a palette or copy its codes; open a palette back on the wheel.
- **Colours from a photo:** pick a photo and Sfumato suggests its main colours as pins. Drag a pin to change a colour, and use − / + for 2 to 8 colours. The photo is only read on the phone and is never saved.
- **Did you know?** 24 colour facts, each with its source, some linked to the button you choose.
- **Backup:** export and import your palettes as a file.

## Privacy

Nothing is sent anywhere: no account, no tracking, no ads. Palettes live in the phone's browser storage.

## Files

| File | Purpose |
|---|---|
| `index.html` | The page |
| `styles.css` | The look: neutral white and grey, so nothing tints the colours |
| `lang.js` | All the words, in English and Italian |
| `learn.js` | The Learn tab's text and sources, in English and Italian |
| `facts.js` | The colour facts and their sources, in English and Italian |
| `app.js` | The wheel, palettes, photo colours and backup |
| `sw.js` | The offline helper (bump `VERSION` on every release) |
| `manifest.webmanifest` | Name, icon and ID for installing |
| `icons/` | App icons |

Next: a value study (photo → 2 to 5 grey steps) in the same app.

made by gionzana · [☕ buy me a coffee](https://buymeacoffee.com/gionzana) · find more [apps by me](https://rb-gith.github.io/)
