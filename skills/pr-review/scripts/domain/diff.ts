import { z } from 'zod';
import { ChangedFileSchema, type ChangedFile, type LineRange, type RemovedLines } from './contracts.g.ts';

const HUNK_START = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

const hunkStart = z.string().regex(HUNK_START).transform((line) => {
  const [, oldStart = '', newStart = ''] = HUNK_START.exec(line) ?? [];
  return { old: Number(oldStart), new: Number(newStart) };
});

type Hunks = { added: LineRange[]; removed: RemovedLines[] };
type State = Hunks & { old: number; new: number };

const initial: State = { old: 0, new: 0, added: [], removed: [] };

function withAdded(ranges: LineRange[], line: number): LineRange[] {
  const last = ranges.at(-1);
  return last !== undefined && last.end === line - 1
    ? [...ranges.slice(0, -1), { start: last.start, end: line }]
    : [...ranges, { start: line, end: line }];
}

function withRemoved(ranges: RemovedLines[], line: number, text: string): RemovedLines[] {
  const last = ranges.at(-1);
  return last !== undefined && last.end === line - 1
    ? [...ranges.slice(0, -1), { start: last.start, end: line, content: `${last.content}\n${text}` }]
    : [...ranges, { start: line, end: line, content: text }];
}

function step(state: State, line: string): State {
  if (HUNK_START.test(line)) {
    const start = hunkStart.parse(line);
    return { ...state, old: start.old, new: start.new };
  }
  if (line.startsWith('+')) return { ...state, new: state.new + 1, added: withAdded(state.added, state.new) };
  if (line.startsWith('-')) return { ...state, old: state.old + 1, removed: withRemoved(state.removed, state.old, line.slice(1)) };
  if (line.startsWith(' ')) return { ...state, old: state.old + 1, new: state.new + 1 };
  return state;
}

export function parseHunks(lines: string[]): Hunks {
  const { added, removed } = lines.reduce<State>(step, initial);
  return { added, removed };
}

function pathFrom(header: string[], prefix: string): string | undefined {
  const line = header.find((candidate) => candidate.startsWith(prefix));
  if (line === undefined) return undefined;
  const [name = ''] = line.slice(prefix.length).split('\t');
  return name === '/dev/null' ? undefined : name.replace(/^[ab]\//, '');
}

function fileOf(section: string): ChangedFile[] {
  const lines = section.split('\n');
  const start = lines.findIndex((line) => HUNK_START.test(line));
  const header = start === -1 ? lines : lines.slice(0, start);
  const path = pathFrom(header, '+++ ') ?? pathFrom(header, '--- ');
  if (path === undefined) return [];
  return [{ path, ...parseHunks(start === -1 ? [] : lines.slice(start)) }];
}

export function parseDiff(text: string): ChangedFile[] {
  return text.split(/^(?=diff --git )/m)
    .filter((section) => section.startsWith('diff --git '))
    .flatMap(fileOf);
}

export const ChangedFilesSchema = z.string().transform(parseDiff).pipe(z.array(ChangedFileSchema));

export const changedFiles = (text: string): ChangedFile[] => ChangedFilesSchema.parse(text);
