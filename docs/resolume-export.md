# Resolume Arena advanced-output export

## Where the format came from

Not from documentation. The element names, attribute names and nesting were read off two
files written by a real **Resolume Arena 7.27.0 (rev 14395)** install:

| File | Root element | Notes |
|---|---|---|
| `~/Documents/Resolume Arena/Preferences/AdvancedOutput.xml` | `<ScreenSetup>` | The live screen setup. Arena reads it at launch and rewrites it on quit. |
| `~/Documents/Resolume Arena/Presets/Advanced Output/output_map_1.xml` | `<XmlState>` | A saved preset. Wraps a `<ScreenSetup>` and omits `<SoftEdging>`. |

Both forms are supported, because they are not interchangeable — the preset wrapper and the
preferences file differ in more than the root tag.

## The conformance rule

`src/lib/__tests__/resolume-schema.test.ts` holds the complete set of
`element path [attributes]` shapes extracted mechanically from those two files, and asserts
that **every shape the exporter emits appears in that set**, across six combinations of
target and array layout.

This exists because the one failure mode that really hurts is inventing a plausible-looking
parameter. A missing feature is obvious; a `<Param name="SoftEdgeLeft">` that Arena does not
recognise produces a file that loads, looks fine, and is quietly wrong. The test also
asserts it can catch an invented element, so it cannot pass vacuously.

If you need to add a shape, add it to `REFERENCE_SHAPES` **with a real Arena file that
contains it**. Not because it looks right.

## What the file contains

One `<Screen>` per projector, each holding one `<Slice>`:

- **`InputRect`** — the region of the composition that projector shows, *including* its
  share of the overlap. This is the whole point of the export: the tedious, error-prone
  part of setting up a blend by hand.
- **`OutputRect`** — the projector's full native raster, `0,0 → w,h`.
- **`Warper`** — an identity 4×4 Bezier control grid plus an identity homography, every
  control point exactly on the output rect, so warping starts from a known-good state.
- **`OutputDevice`** — a `OutputDeviceVirtual`.

`CurrentCompositionTextureSize` is set to the blended canvas size.

Tiles are placed on an integer pixel pitch of `native × (1 − overlap)`, and the canvas is
sized from the last tile's far edge rather than from a separate rounding of the total — so
the tiles and the canvas can never disagree by a pixel.

## What it deliberately does NOT contain

### Soft-edge (blend) parameters

Neither reference file had blending enabled, so the per-slice soft-edge parameter names are
unknown. They are not guessed. The global `<SoftEdging>` block with its `Power` parameter
*is* written into the preferences form, because a real file contained it.

**You set the blends in Arena**, on each slice edge, using the widths the app gives you (in
projector pixels, on screen and in the PDF). The per-projector schedule marks which edges of
each position carry a soft edge with `L`/`R`/`T`/`B`.

### Real output devices

A physical display's `deviceId` and `idHash` are properties of the machine Arena is running
on. They cannot be synthesised elsewhere. Every screen is therefore written as a **Virtual**
device; assign each one to a physical output once the file is loaded.

## Verified vs assumed

| Claim | Status |
|---|---|
| Element/attribute vocabulary matches a real Arena 7.27 file | **Verified** — extracted mechanically from the two files above and asserted in CI |
| Output is well-formed XML | **Verified** — parsed with `DOMParser` in the tests |
| Slice geometry is arithmetically correct | **Verified** — pitch, overlap and canvas size asserted in `resolume.test.ts` |
| Arena loads the generated file and produces the intended blend | **NOT VERIFIED** — never round-tripped through a running Arena |

That last row is the honest gap. The structure conforms and the geometry is right, but no
generated file has been opened in Arena and looked at. Do that before trusting it on a show.

## Before you use it

Back up your existing `AdvancedOutput.xml` before replacing it. Arena reads it at launch and
**overwrites it on quit**, so a bad swap loses the setup that was there. The preset form is
the safer route: drop it in `Presets/Advanced Output/` and load it from inside Arena.
