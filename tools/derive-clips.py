#!/usr/bin/env python3

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
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        'normalise_sprites', os.path.join(os.path.dirname(__file__), 'normalise-sprites.py')
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.normalise(path)

def derive_death(image: Image.Image, seed: int) -> list[Image.Image]:
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
