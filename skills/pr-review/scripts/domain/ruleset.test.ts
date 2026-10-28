import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { IndexSchema, withText, type IndexEntry } from './ruleset.ts';

const firstEntry = (): IndexEntry => {
  const entry = IndexSchema.parse(index)[0];
  if (entry === undefined) throw new Error('the index has no entry');
  return entry;
};

const index = [{ id: 'ddd', title: 'Domain-Driven Design', author: 'Eric Evans', focus: 'Domain Modeling', when_to_use: 'Strategic modeling.', review_checklist: 'Guard aggregates.', tree_url: 'https://books.example/ddd', canonical_url: 'https://github.com/ciembor/agent-rules-books/blob/main/ddd/ddd.md' }];

test('an index entry is read from its canonical GitHub file and fetched from its raw address', () => {
  const entry = firstEntry();
  assert.deepEqual(entry, {
    url: 'https://github.com/ciembor/agent-rules-books/blob/main/ddd/ddd.md',
    rawUrl: 'https://raw.githubusercontent.com/ciembor/agent-rules-books/main/ddd/ddd.md',
    title: 'Domain-Driven Design',
    focus: 'Domain Modeling',
    whenToUse: 'Strategic modeling.',
  });
});

test('an index entry that is not a file on github.com is refused with the reason', () => {
  const bad = [{ ...index[0], canonical_url: 'https://books.example/ddd.md' }];
  assert.throws(() => IndexSchema.parse(bad), (error: unknown) => z.prettifyError(error as z.ZodError).includes('is not a file on github.com'));
});

test('a ruleset is the index entry with the text read for it, and no text is no ruleset', () => {
  const entry = firstEntry();
  assert.deepEqual(withText(entry, '# Rules'), { url: entry.url, title: entry.title, focus: entry.focus, whenToUse: entry.whenToUse, text: '# Rules' });
  assert.throws(() => withText(entry, undefined));
});
