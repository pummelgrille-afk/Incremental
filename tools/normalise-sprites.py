#!/usr/bin/env python3

from PIL import Image
import numpy as np
import os
import re
import sys

SOURCE = 'src/assets/sprites/raw'
TARGET = 'src/assets/sprites'

NATIVE = 40

PALETTE_SIZE = 24

ALPHA_CUTOFF = 128

def normalise(path: str) -> Image.Image:
    source = Image.open(path).convert('RGBA')

    if max(source.size) <= NATIVE:
        a = np.asarray(source).astype(np.float32)
        solid = a[..., 3] >= ALPHA_CUTOFF
        rgb = a[..., :3] * solid[..., None]
        small = Image.fromarray(
            np.dstack([rgb.round().astype(np.uint8), (solid * 255).astype(np.uint8)]),
            'RGBA',
        )
        return quantise(small)

    a = np.asarray(source).astype(np.float32)

    rgb, alpha = a[..., :3], a[..., 3]
    solid = alpha >= ALPHA_CUTOFF

    h, w = solid.shape
    out_rgb = np.zeros((NATIVE, NATIVE, 3), np.float32)
    out_a = np.zeros((NATIVE, NATIVE), np.float32)

    ys = np.linspace(0, h, NATIVE + 1).round().astype(int)
    xs = np.linspace(0, w, NATIVE + 1).round().astype(int)

    for j in range(NATIVE):
        for i in range(NATIVE):
            cell = solid[ys[j]:ys[j + 1], xs[i]:xs[i + 1]]
            if cell.size == 0:
                continue

            covered = cell.mean()
            if covered < 0.5:
                continue

            block = rgb[ys[j]:ys[j + 1], xs[i]:xs[i + 1]][cell]
            out_rgb[j, i] = block.mean(axis=0)
            out_a[j, i] = 255

    small = Image.fromarray(
        np.dstack([out_rgb.round().astype(np.uint8), out_a.astype(np.uint8)]),
        'RGBA',
    )

    return quantise(small)

def quantise(image: Image.Image) -> Image.Image:
    mask = image.getchannel('A')
    flat = image.convert('RGB').quantize(colors=PALETTE_SIZE, method=Image.MEDIANCUT)
    result = flat.convert('RGBA')
    result.putalpha(mask)
    return result

FRAME_SUFFIX = re.compile(r'-(idle|attack|hit|death)-\d+$')

def clip_group(name: str) -> str:
    return FRAME_SUFFIX.sub('', os.path.splitext(name)[0])

def trim_together(images: dict[str, Image.Image]) -> dict[str, Image.Image]:
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
