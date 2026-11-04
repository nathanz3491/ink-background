# @nathanzhou/ink-background

A living background for the web: a puddle of ink marbling in paper-coloured
water, drawn by one WebGL shader. It drifts on its own and reacts to nothing:
no pointer, no scroll, no other effects.

It is the background of [nathanz.cloud](https://nathanz.cloud), packaged on its own.

- Works with plain JavaScript, or as a React component.
- No dependencies. React is only needed for the component.
- Uses any colours you give it, including CSS variables, and follows your theme when it switches.
- Paces itself to about 60fps on any display, and lowers its resolution only when the GPU keeps falling behind.
- Stops drawing while the tab is hidden or the canvas is off-screen.
- Shows one still frame to people who ask for reduced motion.

## Credit required

The [license](LICENSE) is MIT with one extra condition. Anywhere people can see
this background, you must also show a visible credit reading
**"Background by Nathan Zhou"** or **"Background by nathanz.cloud"**, linked to
https://nathanz.cloud. A footer line is enough, for example:

```html
<footer>Background by <a href="https://nathanz.cloud">nathanz.cloud</a></footer>
```

## Install

```bash
npm i @nathanzhou/ink-background
```

## Use

### React

```tsx
import { InkBackground } from "@nathanzhou/ink-background/react";

export default function Page() {
  return (
    <>
      <InkBackground />
      <main>…</main>
    </>
  );
}
```

By default the layer is fixed behind the whole page (`z-index: -1`). If your
page or body has an opaque background, it covers the layer. Either remove that
background, or give the page a positioned wrapper and use
`position="absolute"` inside it.

| Prop | Default | |
| --- | --- | --- |
| `colors` | `PALETTES.light` | Any of `paper`, `wash`, `body`, `deep`, `core`; see [Colours](#colours) |
| `presence` | `"calm"` | `"calm"` keeps the centre as plain paper for text to sit on; `"full"` puts ink everywhere |
| `still` | `false` | Draw one still frame instead of animating |
| `position` | `"fixed"` | `"absolute"` fills the nearest positioned ancestor instead of the viewport |
| `zIndex` | `-1` | |
| `className`, `style` | | Applied to the layer |

If WebGL is unavailable, a soft gradient in the same colours shows instead.

### Plain JavaScript

```html
<canvas id="ink" style="position: fixed; inset: 0; width: 100%; height: 100%; z-index: -1"></canvas>
<script type="module">
  import { createInk } from "@nathanzhou/ink-background";

  const ink = createInk(document.getElementById("ink"), { presence: "calm" });
  // later: ink.setColors({ body: "teal" }); ink.setPresence("full"); ink.destroy();
</script>
```

The ink draws at the canvas's own size, so style the canvas to cover whatever
it should. `createInk` returns:

- `supported`: `false` when WebGL is unavailable, in which case the canvas is left untouched;
- `setColors(colors)` and `setPresence(presence)`, which change the ink without restarting it;
- `destroy()`, which stops drawing and removes every listener.

### Colours

The ink is mixed from five colours. Each can be any CSS colour, including
`var(--token)`:

| Slot | What it colours |
| --- | --- |
| `paper` | The water, and everything the ink has not reached |
| `wash` | The faint halo at the ink's edge |
| `body` | The ink itself |
| `deep` | Ink that has dried darker |
| `core` | The darkest centres |

Any slot you leave out comes from `PALETTES.light`. A dark palette ships too:

```ts
import { PALETTES } from "@nathanzhou/ink-background";
createInk(canvas, { colors: PALETTES.dark });
```

Colours given as `var(--token)` are read again whenever the root element's
`class`, `data-theme` or `style` changes, or the system colour scheme flips. A
theme switch done that way needs no extra code.

## Develop

```bash
npm install
npm test            # unit tests (jsdom)
npm run typecheck
npm run build       # dist/: ESM + CJS + types
npm run example     # builds, then serves the repo; open http://localhost:4173/example
```

`example/index.html` uses the built `dist/` with CSS-variable colours and has
buttons for presence and theme. The tests cannot run WebGL. To check the ink
itself, open the example in a browser.

## Publish

```bash
npm login
npm publish --access public
```

Scoped packages are private by default, so `--access public` is needed the
first time. `prepublishOnly` runs the typecheck, the tests and the build first.
