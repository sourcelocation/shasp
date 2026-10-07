# shasp

A brand compiler. Design tokens ([W3C DTCG](https://www.designtokens.org/tr/drafts/format/)) and the artwork your design tool exports go in; CSS custom properties, typed TypeScript, JSON, Swift, Kotlin and every platform's icons come out, deterministically, so CI can prove the committed output is current.

shasp is what [Rondo](https://github.com/sourcelocation/rondo) and [Invaris](https://github.com/sourcelocation/invaris) build their brands with.

## A brand project

```
brand/
├── brand.config.ts        what to generate
├── tokens/                primitives/color.json, foundation.json, semantic/color.light.json + color.dark.json
├── artwork/exports/       complete SVGs exported from the design file, one per artboard
└── dist/                  generated, committed
```

```ts
// brand.config.ts
import { ArtworkPng, ArtworkSvg, CssEmitter, defineBrand, FaviconSvg, TypeScriptEmitter } from "@sourcelocation/shasp";

export default defineBrand({
  name: "Acme",
  artwork: ["mark", "logo"],
  outputs: (art) => [
    new CssEmitter({ prefix: "ac" }),
    new TypeScriptEmitter({ prefix: "ac" }),
    new ArtworkSvg("dist/svg/logo.svg", art.logo!, "light"),
    new ArtworkSvg("dist/svg/logo-on-dark.svg", art.logo!, "dark"),
    new FaviconSvg("dist/svg/favicon.svg", art.mark!),
    new ArtworkPng("dist/png/avatar.png", art.mark!, {
      width: 1024,
      height: 1024,
      paint: "light",
      padding: 160,
      background: "light",
    }),
  ],
});
```

```bash
shasp build   # write every output
shasp check   # exit 1 when dist/ is not what the sources produce (run it in CI)
```

| Output                                                                                                       | Class                                            |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| CSS custom properties with light/dark themes and text utility classes                                        | `CssEmitter`                                     |
| Typed token tree and a `cssVar()` helper that only accepts real token paths                                  | `TypeScriptEmitter`                              |
| Semantic colours as plain JSON                                                                               | `JsonEmitter`                                    |
| Swift and Kotlin token namespaces                                                                            | `SwiftEmitter`, `KotlinEmitter`                  |
| SVG artwork in ink, on dark, or `currentColor`; an appearance-aware favicon; the app icon on paper           | `ArtworkSvg`, `FaviconSvg`, `AppIconSvg`         |
| PNGs at any size, transparent or on a background                                                             | `ArtworkPng`                                     |
| Apple asset catalog and Icon Composer document; Android launcher, splash, notification drawables and colours | `appleAssets`, `androidArtwork`, `AndroidColors` |

Artwork compositions read the theme colours `color.brand.ink`, `color.brand.paper`, `color.brand.accent` and `color.bg.canvas`.

## Development

Node 24+ and pnpm.

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Contributions are accepted under the [Contributor License Agreement](CONTRIBUTOR_LICENSE_AGREEMENT.md).

## License

shasp is released under the [MIT License](LICENSE).
