import { z } from 'zod';
import { ChangedFileSchema } from './contracts.g.ts';

export type Range = { start: number; end: number };
export type RemovedRange = Range & { content: string };
export type Hunks = { added: Range[]; removed: RemovedRange[] };
export type ChangedFile = z.infer<typeof ChangedFileSchema>;

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function pushAdded(ranges: Range[], line: number): void {
  const last = ranges.at(-1);
  if (last !== undefined && last.end === line - 1) last.end = line;
  else ranges.push({ start: line, end: line });
}

function pushRemoved(ranges: RemovedRange[], line: number, text: string): void {
  const last = ranges.at(-1);
  if (last !== undefined && last.end === line - 1) {
    last.end = line;
    last.content = `${last.content}\n${text}`;
  } else {
    ranges.push({ start: line, end: line, content: text });
  }
}

export function parseHunks(lines: string[]): Hunks {
  const hunks: Hunks = { added: [], removed: [] };
  let oldLine = 0;
  let newLine = 0;
  for (const line of lines) {
    const hunk = HUNK.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
    } else if (line.startsWith('+')) {
      pushAdded(hunks.added, newLine);
      newLine += 1;
    } else if (line.startsWith('-')) {
      pushRemoved(hunks.removed, oldLine, line.slice(1));
      oldLine += 1;
    } else if (line.startsWith(' ')) {
      oldLine += 1;
      newLine += 1;
    }
  }
  return hunks;
}

function pathOf(header: string): string | undefined {
  const name = header.split('\t')[0] ?? '';
  return name === '/dev/null' ? undefined : name.replace(/^[ab]\//, '');
}

function fileOf(section: string): ChangedFile[] {
  const lines = section.split('\n');
  const start = lines.findIndex((line) => HUNK.test(line));
  const header = start === -1 ? lines : lines.slice(0, start);
  const oldPath = pathOf(header.find((line) => line.startsWith('--- '))?.slice(4) ?? '/dev/null');
  const newPath = pathOf(header.find((line) => line.startsWith('+++ '))?.slice(4) ?? '/dev/null');
  const path = newPath ?? oldPath;
  return path === undefined ? [] : [{ path, ...parseHunks(start === -1 ? [] : lines.slice(start)) }];
}

export function parseDiff(text: string): ChangedFile[] {
  return text.split(/^(?=diff --git )/m)
    .filter((section) => section.startsWith('diff --git '))
    .flatMap(fileOf);
}

export const ChangedFilesSchema = z.string().transform(parseDiff).pipe(z.array(ChangedFileSchema));

export const changedFiles = (text: string): ChangedFile[] => ChangedFilesSchema.parse(text);
