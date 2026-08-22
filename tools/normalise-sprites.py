#!/usr/bin/env python3
"""
Normalise supplied pixel art into game-ready sprites.

Run by hand when new art arrives, never as part of the build — it needs Pillow
and NumPy, which a TypeScript project has no business depending on at build
time. The output is committed; the input is kept beside it so the step can
always be re-run.

    python tools/normalise-sprites.py

## Why this exists

The ten sprites supplied with the Phase 29 reskin were **JPEG-compressed before
their backgrounds were removed**. Measured before this step ran:

  - 4,000-16,600 unique colours each, at a block size real pixel art would
    express in a few dozen;
  - 1-3% partially transparent pixels, which is a soft halo where a cutout
    should have a hard edge;
  - a detectable cell period of 9-25px on canvases of ~500px, cropped to
    non-round dimensions so no exact grid divides them.

They are recoverable rather than lost: the grid is still there, just smeared.
This resamples onto that grid, quantises the palette, and hardens the alpha —
which both fixes the art and takes it from ~130KB to ~1KB apiece, for images the
game draws about thirty pixels across.

## What it does, and why in this order

  1. **Hard-threshold alpha** first, so the halo cannot bleed into the colour
     averages taken in step 2.
  2. **Resample to the native grid** with a box filter over each cell, ignoring
     transparent pixels so an edge cell takes the colour of the art rather than
     a mix of art and nothing.
  3. **Quantise** to a fixed palette size. JPEG noise is thousands of colours
     that were never authored; collapsing them is what makes the result read as
     pixel art rather than as a photograph of pixel art.
  4. **Trim** fully transparent borders, so the sprite's own bounds are its art
     and the renderer can anchor on the centre.
"""

from PIL import Image
import numpy as np
import os
import sys

SOURCE = 'src/assets/sprites/raw'
TARGET = 'src/assets/sprites'

# The native grid, from docs/design/art-style.md. Measured, not chosen: the
# supplied art's cell period lands at 11-14px on a ~500px canvas.
NATIVE = 40

# Colours per sprite after quantisation. Enough for a body, a shadow, a
# highlight and a rim on each of two materials; far below the thousands JPEG
# left behind.
PALETTE_SIZE = 24

# Anything below this is background, anything above is art. Pixel art has no
# soft edges, so there is no middle to preserve.
ALPHA_CUTOFF = 128


def normalise(path: str) -> Image.Image:
    source = Image.open(path).convert('RGBA')
    a = np.asarray(source).astype(np.float32)

    rgb, alpha = a[..., :3], a[..., 3]
    solid = alpha >= ALPHA_CUTOFF

    h, w = solid.shape
    out_rgb = np.zeros((NATIVE, NATIVE, 3), np.float32)
    out_a = np.zeros((NATIVE, NATIVE), np.float32)

    # Cell boundaries are computed rather than assumed: the supplied images are
    # cropped to non-round sizes, so the grid does not divide them evenly.
    ys = np.linspace(0, h, NATIVE + 1).round().astype(int)
    xs = np.linspace(0, w, NATIVE + 1).round().astype(int)

    for j in range(NATIVE):
        for i in range(NATIVE):
            cell = solid[ys[j]:ys[j + 1], xs[i]:xs[i + 1]]
            if cell.size == 0:
                continue

            covered = cell.mean()
            # A cell is art only if the art actually covers most of it. Half a
            # cell of art beside half a cell of nothing is an edge, and an edge
            # belongs to the background — otherwise every sprite grows a
            # one-pixel fringe of averaged colour.
            if covered < 0.5:
                continue

            block = rgb[ys[j]:ys[j + 1], xs[i]:xs[i + 1]][cell]
            out_rgb[j, i] = block.mean(axis=0)
            out_a[j, i] = 255

    small = Image.fromarray(
        np.dstack([out_rgb.round().astype(np.uint8), out_a.astype(np.uint8)]),
        'RGBA',
    )

    # Quantise the colours only, with the alpha put back afterwards: Pillow's
    # quantiser works in RGB, and letting it see the alpha channel spends
    # palette entries describing transparency that is already binary.
    mask = small.getchannel('A')
    flat = small.convert('RGB').quantize(colors=PALETTE_SIZE, method=Image.MEDIANCUT)
    result = flat.convert('RGBA')
    result.putalpha(mask)

    return result.crop(result.getbbox() or (0, 0, NATIVE, NATIVE))


def main() -> int:
    if not os.path.isdir(SOURCE):
        print(f'no source directory at {SOURCE}', file=sys.stderr)
        return 1

    os.makedirs(TARGET, exist_ok=True)
    for name in sorted(os.listdir(SOURCE)):
        if not name.endswith('.png'):
            continue

        source_path = os.path.join(SOURCE, name)
        target_path = os.path.join(TARGET, name)

        image = normalise(source_path)
        image.save(target_path, optimize=True)

        before = os.path.getsize(source_path)
        after = os.path.getsize(target_path)
        colours = len(image.convert('RGB').getcolors(1 << 16) or [])
        print(
            f'{name:16} {image.size[0]:>2}x{image.size[1]:<2}  '
            f'{colours:>3} colours  {before // 1024:>4}KB -> {after / 1024:5.1f}KB'
        )

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
