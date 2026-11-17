const path = require('path');

/**
 * Resolves a client-supplied relative upload path into a vault-contained target.
 * Strips leading ../ and absolute prefixes; any path that would still resolve
 * outside the vault (mid-path ../, dot-only names) is flattened to the vault root.
 */
function resolveUploadTarget(uploadsDir, rawRel) {
  const ROOT = path.resolve(uploadsDir);
  let clean = String(rawRel === undefined || rawRel === null ? '' : rawRel)
    .replace(/\\/g, '/')
    .replace(/^(\.\.[\/\\])+/, '')
    .replace(/^\/+/, '');
  if (!clean || clean === '.') clean = 'file';

  let resolved = path.resolve(ROOT, clean);
  // Strict prefix check (with separator) so sibling dirs like "AirBridgeBackup"
  // can never pass, and the vault root itself is never a file target.
  if (!resolved.startsWith(ROOT + path.sep)) {
    clean = path.basename(clean);
    if (!clean || clean === '.' || clean === '..') clean = 'file';
    resolved = path.resolve(ROOT, clean);
  }

  return {
    cleanRel: clean,
    targetDir: path.dirname(resolved),
    fileName: path.basename(resolved),
    isNested: path.dirname(resolved) !== ROOT,
  };
}

module.exports = { resolveUploadTarget };
