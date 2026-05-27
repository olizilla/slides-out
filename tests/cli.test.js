import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../bin/slides-out.js', import.meta.url));

test('CLI: prints usage and exits with 0 when run with no arguments', () => {
  const output = execSync(`node "${cliPath}"`, { encoding: 'utf8' });
  assert.match(output, /Usage:/);
  assert.match(output, /Options:/);
});

test('CLI: prints usage and exits with 0 when run with --help or -h', () => {
  const output1 = execSync(`node "${cliPath}" --help`, { encoding: 'utf8' });
  assert.match(output1, /Usage:/);

  const output2 = execSync(`node "${cliPath}" -h`, { encoding: 'utf8' });
  assert.match(output2, /Usage:/);
});

test('CLI: fails with code 1 when extra positional arguments are provided', () => {
  assert.throws(() => {
    execSync(`node "${cliPath}" 123 456`, { stdio: 'pipe' });
  }, (err) => {
    assert.equal(err.status, 1);
    const stderr = err.stderr.toString();
    assert.match(stderr, /Error: Too many positional arguments/);
    return true;
  });
});

test('CLI: validates options and flags', () => {
  // Invalid max-slides
  assert.throws(() => {
    execSync(`node "${cliPath}" 123 --max-slides abc`, { stdio: 'pipe' });
  }, (err) => {
    assert.equal(err.status, 1);
    assert.match(err.stderr.toString(), /--max-slides must be a valid number/);
    return true;
  });

  // Invalid alt-text
  assert.throws(() => {
    execSync(`node "${cliPath}" 123 --alt-text invalid`, { stdio: 'pipe' });
  }, (err) => {
    assert.equal(err.status, 1);
    assert.match(err.stderr.toString(), /--alt-text must be one of/);
    return true;
  });

  // Invalid text strategy
  assert.throws(() => {
    execSync(`node "${cliPath}" 123 --text invalid`, { stdio: 'pipe' });
  }, (err) => {
    assert.equal(err.status, 1);
    assert.match(err.stderr.toString(), /--text must be one of/);
    return true;
  });

  // Invalid format
  assert.throws(() => {
    execSync(`node "${cliPath}" 123 --format invalid`, { stdio: 'pipe' });
  }, (err) => {
    assert.equal(err.status, 1);
    assert.match(err.stderr.toString(), /--format must be one of/);
    return true;
  });

  // Invalid presentation URL
  assert.throws(() => {
    execSync(`node "${cliPath}" https://google.com`, { stdio: 'pipe' });
  }, (err) => {
    assert.equal(err.status, 1);
    assert.match(err.stderr.toString(), /Invalid Google Slides URL/);
    return true;
  });

  // Invalid pub-date precision/format
  assert.throws(() => {
    execSync(`node "${cliPath}" 123 --pub-date 2026-05-25Tinvalid`, { stdio: 'pipe' });
  }, (err) => {
    assert.equal(err.status, 1);
    assert.match(err.stderr.toString(), /Invalid date format/);
    return true;
  });
});
