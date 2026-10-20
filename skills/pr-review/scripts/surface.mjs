const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function pushAdded(ranges, line) {
  const last = ranges.at(-1);
  if (last !== undefined && last.end === line - 1) {
    ranges.splice(-1, 1, { start: last.start, end: line });
    return;
  }
  ranges.push({ start: line, end: line });
}

function pushRemoved(ranges, line, text) {
  const last = ranges.at(-1);
  if (last !== undefined && last.end === line - 1) {
    ranges.splice(-1, 1, { start: last.start, end: line, content: `${last.content}\n${text}` });
    return;
  }
  ranges.push({ start: line, end: line, content: text });
}

export function parseHunks(lines) {
  const file = { added: [], removed: [] };
  let oldLine = 0;
  let newLine = 0;
  for (const line of lines) {
    const hunk = HUNK.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
    } else if (line.startsWith('+')) {
      pushAdded(file.added, newLine);
      newLine += 1;
    } else if (line.startsWith('-')) {
      pushRemoved(file.removed, oldLine, line.slice(1));
      oldLine += 1;
    } else if (line.startsWith(' ')) {
      oldLine += 1;
      newLine += 1;
    }
  }
  return file;
}

function pathOf(header) {
  const name = header.split('\t')[0];
  return name === '/dev/null' ? undefined : name.replace(/^[ab]\//, '');
}

export function parseDiff(text) {
  const sections = text.split(/^(?=diff --git )/m).filter((section) => section.startsWith('diff --git '));
  return sections.map((section) => {
    const lines = section.split('\n');
    const start = lines.findIndex((line) => HUNK.test(line));
    const header = start === -1 ? lines : lines.slice(0, start);
    const oldHeader = header.find((line) => line.startsWith('--- '));
    const newHeader = header.find((line) => line.startsWith('+++ '));
    const oldPath = pathOf(oldHeader === undefined ? '/dev/null' : oldHeader.slice(4));
    const newPath = pathOf(newHeader === undefined ? '/dev/null' : newHeader.slice(4));
    const body = start === -1 ? [] : lines.slice(start);
    return { path: newPath === undefined ? oldPath : newPath, ...parseHunks(body) };
  }).filter((file) => file.path !== undefined);
}

export function intersect(a, b) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (start <= end) result.push({ start, end });
    if (a[i].end < b[j].end) i += 1;
    else j += 1;
  }
  return result;
}

export function union(a, b) {
  const sorted = [...a, ...b].sort((x, y) => x.start - y.start);
  const result = [];
  for (const range of sorted) {
    const last = result.at(-1);
    if (last !== undefined && range.start <= last.end + 1) {
      result.splice(-1, 1, { start: last.start, end: Math.max(last.end, range.end) });
    } else {
      result.push({ ...range });
    }
  }
  return result;
}

const rangesAt = (map, path) => (map.has(path) ? map.get(path) : []);

export function threadRanges(threads) {
  const sides = { head: new Map(), base: new Map() };
  for (const thread of threads.filter((candidate) => candidate.state !== 'resolved')) {
    const side = sides[thread.side];
    side.set(thread.path, union(rangesAt(side, thread.path), [thread.lines]));
  }
  return sides;
}

const numbersOnly = (ranges) => ranges.map(({ start, end }) => ({ start, end }));

export function wholeSurface(changeSet) {
  return { files: changeSet.files.map((file) => ({ path: file.path, added: file.added, removed: numbersOnly(file.removed) })) };
}

export function narrowSurface(changeSet, changedSince, threads) {
  const files = changeSet.files.map((file) => ({
    path: file.path,
    added: intersect(file.added, union(rangesAt(changedSince, file.path), rangesAt(threads.head, file.path))),
    removed: intersect(file.removed, rangesAt(threads.base, file.path)),
  })).filter((file) => file.added.length + file.removed.length > 0);
  return { files };
}

export const isText = (text) => !text.includes('\0');

export function numbered(text) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return Object.fromEntries(lines.map((line, i) => [i + 1, line]));
}

const inside = (ranges, line) => ranges.some((range) => range.start <= line && line <= range.end);

export function fragments(lines, added, removed) {
  const head = [];
  for (const [name, text] of Object.entries(lines)) {
    const number = Number(name);
    const kind = inside(added, number) ? 'surface' : 'context';
    const last = head.at(-1);
    if (last !== undefined && last.kind === kind) {
      head.splice(-1, 1, { ...last, lines: { ...last.lines, [number]: text } });
    } else {
      head.push(kind === 'surface' ? { kind, side: 'head', lines: { [number]: text } } : { kind, lines: { [number]: text } });
    }
  }
  const base = removed.map((hunk) => ({ kind: 'surface', side: 'base', lines: Object.fromEntries(hunk.content.split('\n').map((text, i) => [hunk.start + i, text])) }));
  return [...head, ...base];
}

export function removedLines(hunks, ranges) {
  return ranges.map((range) => {
    const hunk = hunks.find((candidate) => candidate.start <= range.start && range.end <= candidate.end);
    if (hunk === undefined) throw new Error(`no removed hunk holds lines ${range.start}-${range.end}`);
    return { ...range, content: hunk.content.split('\n').slice(range.start - hunk.start, range.end - hunk.start + 1).join('\n') };
  });
}

export function span(lines) {
  const numbers = Object.keys(lines).map(Number);
  return { start: Math.min(...numbers), end: Math.max(...numbers) };
}

export const FILE_LINES = 200;
export const FILE_TOO_LARGE = 'File too large';

export function tooLarge(counts) {
  return counts.filter((file) => file.lines > FILE_LINES).map((file) => `${file.path} is ${file.lines} lines long, which breaks ${FILE_TOO_LARGE}`);
}

export function anchorInside(anchor, files) {
  if (anchor.kind === 'pull-request') return true;
  const file = files.find((candidate) => candidate.path === anchor.path);
  if (file === undefined) return false;
  const copied = Object.entries(anchor.lines);
  if (copied.length === 0) return false;
  return file.fragments.some((fragment) => fragment.kind === 'surface' && fragment.side === anchor.side
    && copied.every(([number, text]) => fragment.lines[number] === text));
}
