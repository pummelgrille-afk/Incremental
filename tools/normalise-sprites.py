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
     and the renderer can anchor on the centre — but trim **every frame of a
     unit to the same box**, which is the whole reason this step is not inside
     `normalise`. See `trim_together`.
"""

from PIL import Image
import numpy as np
import os
import re
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

    # Not trimmed here — see `trim_together`. A frame cropped to its own bounds
    # is a frame that moves.
    return result


FRAME_SUFFIX = re.compile(r'-(idle|attack|hit|death)-\d+$')


def clip_group(name: str) -> str:
    """
    The unit a file belongs to.

    `bolt-attack-2.png`, `bolt-idle-1.png` and `bolt.png` are all one group.
    Grouping by *unit* rather than by clip is deliberate: the renderer sizes a
    sprite once, from its idle frame, and then swaps textures underneath that
    scale. Frames of different dimensions would be drawn at different sizes, so
    a unit would change size when it attacked.
    """
    return FRAME_SUFFIX.sub('', os.path.splitext(name)[0])


def trim_together(images: dict[str, Image.Image]) -> dict[str, Image.Image]:
    """
    Crop every frame of a unit to one shared box.

    Trimming each frame to its own bounds — which is what a single-image
    pipeline naturally does — makes the art jitter: frame two is two pixels
    narrower, so it is centred differently and scaled differently, and a
    stationary unit appears to shuffle on the spot. The union of the frames'
    bounds is the smallest box that holds all of them, so the unit stays put and
    the animation is the only thing moving.
    """
    boxes = [image.getbbox() for image in images.values()]
    boxes = [box for box in boxes if box is not None]
    if not boxes:
        return images

    union = (
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    )
    return {name: image.crop(union) for name, image in images.items()}


def main() -> int:
    if not os.path.isdir(SOURCE):
        print(f'no source directory at {SOURCE}', file=sys.stderr)
        return 1

    os.makedirs(TARGET, exist_ok=True)

    groups: dict[str, list[str]] = {}
    for name in sorted(os.listdir(SOURCE)):
        if name.endswith('.png'):
            groups.setdefault(clip_group(name), []).append(name)

    for group, names in sorted(groups.items()):
        normalised = {name: normalise(os.path.join(SOURCE, name)) for name in names}
        trimmed = trim_together(normalised)

        for name, image in trimmed.items():
            target_path = os.path.join(TARGET, name)
            image.save(target_path, optimize=True)

            before = os.path.getsize(os.path.join(SOURCE, name))
            after = os.path.getsize(target_path)
            colours = len(image.convert('RGB').getcolors(1 << 16) or [])
            shared = f'  (shared box, {len(names)} frames)' if len(names) > 1 else ''
            print(
                f'{name:24} {image.size[0]:>2}x{image.size[1]:<2}  '
                f'{colours:>3} colours  {before // 1024:>4}KB -> {after / 1024:5.1f}KB{shared}'
            )

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
