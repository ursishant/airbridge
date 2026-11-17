const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { resolveUploadTarget } = require('../lib/uploadPaths');

const VAULT = path.resolve('/tmp/airbridge-test-vault');

describe('resolveUploadTarget', () => {
  it('preserves nested folder structure', () => {
    const t = resolveUploadTarget(VAULT, 'project/src/app.ts');
    assert.equal(t.cleanRel, 'project/src/app.ts');
    assert.equal(t.targetDir, path.join(VAULT, 'project', 'src'));
    assert.equal(t.fileName, 'app.ts');
    assert.equal(t.isNested, true);
  });

  it('normalizes windows backslashes', () => {
    const t = resolveUploadTarget(VAULT, 'project\\src\\app.ts');
    assert.equal(t.cleanRel, 'project/src/app.ts');
    assert.equal(t.targetDir, path.join(VAULT, 'project', 'src'));
  });

  it('strips leading ../ sequences', () => {
    const t = resolveUploadTarget(VAULT, '../../etc/x.txt');
    assert.equal(t.cleanRel, 'etc/x.txt');
    assert.equal(t.targetDir, path.join(VAULT, 'etc'));
  });

  it('flattens mid-path escape attempts to the vault root', () => {
    const t = resolveUploadTarget(VAULT, 'a/../../evil/x.txt');
    assert.equal(t.cleanRel, 'x.txt');
    assert.equal(t.targetDir, VAULT);
    assert.equal(t.fileName, 'x.txt');
    assert.equal(t.isNested, false);
  });

  it('flattens deep escape attempts to the vault root', () => {
    const t = resolveUploadTarget(VAULT, 'sub/../../../../tmp/pwn.txt');
    assert.equal(t.cleanRel, 'pwn.txt');
    assert.equal(t.targetDir, VAULT);
  });

  it('treats absolute paths as vault-relative', () => {
    const t = resolveUploadTarget(VAULT, '/abs/path/x.txt');
    assert.equal(t.cleanRel, 'abs/path/x.txt');
    assert.equal(t.targetDir, path.join(VAULT, 'abs', 'path'));
  });

  it('keeps plain files at the vault root', () => {
    const t = resolveUploadTarget(VAULT, 'notes.txt');
    assert.equal(t.cleanRel, 'notes.txt');
    assert.equal(t.targetDir, VAULT);
    assert.equal(t.isNested, false);
  });

  it('falls back to a safe name for empty or dot-only input', () => {
    for (const raw of ['', '.', '..', 'a/..']) {
      const t = resolveUploadTarget(VAULT, raw);
      assert.equal(t.cleanRel, 'file');
      assert.equal(t.targetDir, VAULT);
      assert.equal(t.fileName, 'file');
    }
  });

  it('never resolves outside the vault', () => {
    const raws = ['a/../../evil', '..', '../..', 'a/b/../../../../x', '/etc/passwd', 'a/..'];
    for (const raw of raws) {
      const t = resolveUploadTarget(VAULT, raw);
      const resolved = path.resolve(t.targetDir, t.fileName);
      assert.ok(
        resolved.startsWith(VAULT + path.sep),
        `${JSON.stringify(raw)} escaped to ${resolved}`
      );
    }
  });
});
