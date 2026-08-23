#!/usr/bin/env python3
"""
Derive animation frames from a sprite that already exists.

    python tools/derive-clips.py

It is **not** a substitute for drawn animation. It cannot invent a pose, a
recoil or a limb, so it does not attempt an `attack` or a craft's `idle` —
those need a hand, and art-style.md §7 says what they need to satisfy.

It *is* the right tool for two clips whose motion is not a new drawing:

**`death`**, because a death is the craft coming apart — the same pixels, lit,
displaced outward and thinned. Every frame is a transformation of the unit's own
art, which is why the result still looks like that unit while it dies, the
property a generated *replacement* sprite would lose immediately.

**A projectile's `idle`**, because a comet's motion is its tail guttering, not a
change of pose. Dropping and dimming the sparse outer pixels frame to frame is
literally what a burning thing does, and it is the difference between a shot
that flies and a decal being dragged across the screen.

Before this, a kill simply stopped existing. There was no death feedback on the
field at all beyond a damage number, which art-style.md §6 rule 5's argument
about telegraphs applies to just as well in reverse: the most important events
are the ones that must not be inferred.

Frames are written into `src/assets/sprites/raw/`, and `normalise-sprites.py`
takes them from there like anything else. One pipeline, no special case
downstream.

Two details are load-bearing, and both were wrong in the first attempt:

**Frames are generated on the untrimmed native canvas**, by running the raw
sprite through the normaliser's own `normalise()` and *not* trimming. Frames of
a unit are cropped to one shared box, and a box is only meaningful if every
image in the group shares a canvas — deriving from the already-trimmed sprite
gave frames a different canvas from the base, so the union came out wrong.

**Nothing is drawn outside the base sprite's own bounds.** Otherwise the shared
box grows to fit the debris, the base sprite is padded to match, and every unit
is silently redrawn ~15% smaller because the renderer scales by the longest
edge. A piece thrown past the edge is clipped instead, which at a quarter alpha
is invisible anyway.
"""

from PIL import Image
import numpy as np
import math
import os
import sys

SPRITES = 'src/assets/sprites'
RAW = 'src/assets/sprites/raw'

DEATH_KEYS = ('contact-1', 'contact-2', 'contact-3')

FLICKER_KEYS = ('projectile-1', 'projectile-2')

FLICKER_FRAMES = 4

TAIL_NEIGHBOURS = 9

TAIL_DROP = 0.3

BODY_PULSE = 0.16

DEATH_FRAMES = 5

BLOCK = 2

MAX_DRIFT = 7.0

def native(path: str) -> Image.Image:
    """
    The raw sprite on the native grid, untrimmed.

    Reuses `normalise-sprites.py`'s own resampling rather than reimplementing
    it, so a change to the grid or the palette reaches derived frames too. The
    hyphen in the filename is why this goes through importlib.
    """
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        'normalise_sprites', os.path.join(os.path.dirname(__file__), 'normalise-sprites.py')
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.normalise(path)

def derive_death(image: Image.Image, seed: int) -> list[Image.Image]:
    """
    Break a sprite apart over `DEATH_FRAMES`.

    Frame 1 is a **flash**: the silhouette intact, lit almost to white. It is
    there so the moment of death is a single unmistakable event before the
    shape starts to disagree with itself — the same reason a hit flashes.

    The rest displace each block outward from the centre of mass, thin the
    population, and fade. Direction comes from the block's own position, so a
    craft comes apart along its own shape rather than in a uniform ring, and
    the jitter is seeded per unit so a death looks the same every time it plays.
    """
    rgba = np.asarray(image).astype(np.int16)
    height, width = rgba.shape[:2]
    alpha = rgba[..., 3]

    ys, xs = np.nonzero(alpha > 0)
    if len(xs) == 0:
        return []

    centre_x, centre_y = xs.mean(), ys.mean()
    left, right = int(xs.min()), int(xs.max())
    top, bottom = int(ys.min()), int(ys.max())
    rng = np.random.default_rng(seed)

    blocks = []
    for by in range(0, height, BLOCK):
        for bx in range(0, width, BLOCK):
            cell = alpha[by : by + BLOCK, bx : bx + BLOCK]
            if not (cell > 0).any():
                continue

            dx, dy = (bx + BLOCK / 2) - centre_x, (by + BLOCK / 2) - centre_y
            length = max(1e-3, (dx * dx + dy * dy) ** 0.5)
            blocks.append(
                {
                    'x': bx,
                    'y': by,
                    'dx': dx / length + rng.uniform(-0.35, 0.35),
                    'dy': dy / length + rng.uniform(-0.35, 0.35),
                    'life': rng.uniform(0.8, 1.45),
                }
            )

    frames: list[Image.Image] = []

    for index in range(DEATH_FRAMES):
        t = index / (DEATH_FRAMES - 1)
        out = np.zeros((height, width, 4), np.int16)

        if index == 0:
            lit = np.minimum(255, rgba[..., :3] + 150)
            out[..., :3] = lit
            out[..., 3] = alpha
            frames.append(Image.fromarray(out.astype(np.uint8), 'RGBA'))
            continue

        shade = 1.0 - 0.45 * t

        for block in blocks:
            if t > block['life']:
                continue

            offset_x = int(round(block['dx'] * MAX_DRIFT * t))
            offset_y = int(round(block['dy'] * MAX_DRIFT * t))

            for y in range(block['y'], min(block['y'] + BLOCK, height)):
                for x in range(block['x'], min(block['x'] + BLOCK, width)):
                    if alpha[y, x] == 0:
                        continue

                    ty, tx = y + offset_y, x + offset_x
                    if not (top <= ty <= bottom and left <= tx <= right):
                        continue

                    out[ty, tx, :3] = (rgba[y, x, :3] * shade).astype(np.int16)
                    out[ty, tx, 3] = 255

        frames.append(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA'))

    return frames

def derive_flicker(image: Image.Image, seed: int) -> list[Image.Image]:
    """
    Make a comet gutter.

    Two things move, and neither is the silhouette:

    **The tail thins.** Sparse outer pixels — those with few neighbours — drop
    out and return on a per-pixel, per-frame basis. That is what a trail of
    burning material does, and it is cheap to read at 14px.

    **The body pulses.** The dense core brightens and dims across the loop, so
    the shot has a heartbeat even when the tail happens to be full.

    Nothing is displaced. A projectile is drawn rotated to its heading and sized
    to its hitbox; art that wandered inside the frame would drift off the thing
    it represents, and at these speeds that reads as a bad hitbox rather than as
    animation.
    """
    rgba = np.asarray(image).astype(np.int16)
    height, width = rgba.shape[:2]
    alpha = rgba[..., 3]
    rng = np.random.default_rng(seed)

    solid = (alpha > 0).astype(np.int16)
    neighbours = np.zeros_like(solid)
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            neighbours += np.roll(np.roll(solid, dy, axis=0), dx, axis=1)

    phase = rng.random((height, width))

    frames: list[Image.Image] = []

    for index in range(FLICKER_FRAMES):
        t = index / FLICKER_FRAMES
        out = np.zeros((height, width, 4), np.int16)

        pulse = 1.0 + BODY_PULSE * math.sin(2 * math.pi * t)

        for y in range(height):
            for x in range(width):
                if alpha[y, x] == 0:
                    continue

                if neighbours[y, x] < TAIL_NEIGHBOURS:
                    if ((phase[y, x] + t) % 1.0) < TAIL_DROP:
                        continue
                    out[y, x, :3] = rgba[y, x, :3]
                else:
                    out[y, x, :3] = np.clip(rgba[y, x, :3] * pulse, 0, 255)

                out[y, x, 3] = 255

        frames.append(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA'))

    return frames

def main() -> int:
    if not os.path.isdir(SPRITES):
        print(f'no sprites at {SPRITES}', file=sys.stderr)
        return 1

    for seed, key in enumerate(DEATH_KEYS):
        source = os.path.join(RAW, f'{key}.png')
        if not os.path.exists(source):
            print(f'skipping {key}: no sprite', file=sys.stderr)
            continue

        image = native(os.path.join(RAW, f'{key}.png'))
        frames = derive_death(image, seed)

        for index, frame in enumerate(frames, start=1):
            path = os.path.join(RAW, f'{key}-death-{index}.png')
            frame.save(path)

        print(f'{key}: {len(frames)} death frames at {image.size[0]}x{image.size[1]}')

    for seed, key in enumerate(FLICKER_KEYS, start=100):
        source = os.path.join(RAW, f'{key}.png')
        if not os.path.exists(source):
            print(f'skipping {key}: no sprite', file=sys.stderr)
            continue

        image = native(source)
        for index, frame in enumerate(derive_flicker(image, seed), start=1):
            frame.save(os.path.join(RAW, f'{key}-idle-{index}.png'))

        print(f'{key}: {FLICKER_FRAMES} idle frames at {image.size[0]}x{image.size[1]}')

    print('\nnow run: python tools/normalise-sprites.py')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
