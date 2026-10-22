import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';

export function readRawJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function writeRawJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

export function readRawYaml(filePath) {
  return parse(readFileSync(filePath, 'utf8'));
}

export function readDomainJson(filePath, factory) {
  return factory.fromRaw(readRawJson(filePath));
}

export function writeDomainJson(filePath, domainObject) {
  return writeRawJson(filePath, domainObject.toContract());
}

export function readDomainYaml(filePath, factory) {
  return factory.fromRaw(readRawYaml(filePath));
}

export function writeDomainYaml(filePath, domainObject) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, stringify(domainObject.toContract(), { lineWidth: 0 }), 'utf8');
  return filePath;
}

export function writeTextFile(filePath, text) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, 'utf8');
  return filePath;
}

export function listSnapshotFiles(snapshotDir) {
  if (!existsSync(snapshotDir)) return [];
  return readdirSync(snapshotDir, { recursive: true })
    .map(String)
    .filter((relPath) => statSync(join(snapshotDir, relPath)).isFile())
    .sort();
}

export function readSnapshotText(snapshotDir, relativePath) {
  const fullPath = join(snapshotDir, relativePath);
  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) return '';
  const latin1 = readFileSync(fullPath, 'latin1');
  if (latin1.includes('\0')) return '';
  return readFileSync(fullPath, 'utf8');
}
