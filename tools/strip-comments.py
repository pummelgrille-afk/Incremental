#!/usr/bin/env python3
import ast
import io
import sys
import tokenize
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT = ['tools/derive-clips.py', 'tools/normalise-sprites.py']

def docstring_lines(source):
    tree = ast.parse(source)
    lines = set()
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        body = getattr(node, 'body', [])
        if not body:
            continue
        first = body[0]
        if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
            if isinstance(first.value.value, str):
                if len(body) == 1 and not isinstance(node, ast.Module):
                    continue
                lines.update(range(first.lineno, first.end_lineno + 1))
    return lines

def strip(source):
    drop = docstring_lines(source)
    comments = []
    readline = io.StringIO(source).readline
    for token in tokenize.generate_tokens(readline):
        if token.type == tokenize.COMMENT:
            comments.append(token.start)

    by_line = {}
    for row, col in comments:
        by_line.setdefault(row, col)

    out = []
    for number, line in enumerate(source.split('\n'), start=1):
        if number in drop:
            continue
        if number == 1 and line.startswith('#!'):
            out.append(line)
            continue
        if number in by_line:
            head = line[: by_line[number]].rstrip()
            if head == '':
                continue
            out.append(head)
            continue
        out.append(line.rstrip())

    tidied = []
    for line in out:
        if line == '' and tidied and tidied[-1] == '':
            continue
        tidied.append(line)
    while tidied and tidied[-1] == '':
        tidied.pop()

    return '\n'.join(tidied) + '\n'

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry' in sys.argv
    targets = args or DEFAULT

    for name in targets:
        path = ROOT / name
        before = path.read_text(encoding='utf8')
        after = strip(before)
        compile(after, str(path), 'exec')
        removed = len(before.split('\n')) - len(after.split('\n'))
        print(f'{name}: -{removed} lines')
        if not dry:
            path.write_text(after, encoding='utf8', newline='\n')

if __name__ == '__main__':
    main()
