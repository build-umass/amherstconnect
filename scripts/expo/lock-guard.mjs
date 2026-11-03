import assert from 'node:assert/strict';

export const packageGroups = ['dependencies', 'devDependencies'];
export const direct = manifest => Object.assign({}, ...packageGroups.map(k => manifest[k] ?? {}));
export function stableVersion(value) {
  assert.match(value ?? '', /^\d+\.\d+\.\d+$/, 'Only stable numeric package versions are automated');
  return value.split('.').map(Number);
}
export function isPatch(from, to) {
  const a = stableVersion(from), b = stableVersion(to);
  return a[0] === b[0] && a[1] === b[1] && b[2] > a[2];
}
function closure(lock, names) {
  function locate(from, name) {
    let parent = from;
    for (;;) {
      const path = `${parent ? `${parent}/` : ''}node_modules/${name}`;
      if (lock.packages[path]) return path;
      if (!parent) return null;
      const index = parent.lastIndexOf('/node_modules/');
      parent = index < 0 ? '' : parent.slice(0, index);
    }
  }
  const seen = new Set(), queue = names.map(name => locate('', name)).filter(Boolean);
  while (queue.length) {
    const path = queue.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    const pkg = lock.packages[path];
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) {
      const child = locate(path, name);
      if (child) queue.push(child);
    }
  }
  return seen;
}

// Also used in the credentialed publication job. It has no npm dependencies.
export function validateCandidate(beforePkg, beforeLock, afterPkg, afterLock, changes) {
  assert.equal(afterLock.lockfileVersion, beforeLock.lockfileVersion);
  assert.equal(afterLock.lockfileVersion, 3);
  const names = changes.map(c => c.name);
  assert.ok(names.length > 0 && new Set(names).size === names.length, 'Expected distinct planned changes');
  for (const pkg of [beforePkg, afterPkg]) assert.equal(pkg.expo?.install?.exclude?.length ?? 0, 0);
  const strip = pkg => Object.fromEntries(Object.entries(pkg).filter(([k]) => !packageGroups.includes(k)));
  assert.deepEqual(strip(afterPkg), strip(beforePkg), 'Only dependency ranges may change');
  assert.deepEqual(strip(afterLock.packages['']), strip(beforeLock.packages['']), 'Lockfile root metadata must be preserved');
  assert.deepEqual({ ...afterLock, packages: null }, { ...beforeLock, packages: null }, 'Lockfile metadata must be preserved');
  for (const group of packageGroups) {
    assert.deepEqual(Object.keys(afterPkg[group] ?? {}).sort(), Object.keys(beforePkg[group] ?? {}).sort(), 'Do not add/remove direct dependencies');
    assert.deepEqual(afterLock.packages[''][group] ?? {}, afterPkg[group] ?? {});
    for (const [name, value] of Object.entries(beforePkg[group] ?? {})) {
      const change = changes.find(c => c.name === name);
      if (!change) {
        assert.equal(afterPkg[group][name], value, `Unplanned manifest change: ${name}`);
        assert.equal(afterLock.packages[`node_modules/${name}`]?.version, beforeLock.packages[`node_modules/${name}`]?.version, `Unrelated direct update: ${name}`);
      } else {
        assert.match(name, /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i);
        assert.equal(change.from, beforeLock.packages[`node_modules/${name}`].version);
        assert.ok(isPatch(change.from, change.to), `Not a patch update: ${name}`);
        const prefix = value.match(/^([~^]?)\d+\.\d+\.\d+$/)?.[1];
        assert.notEqual(prefix, undefined, `Unsupported manifest range: ${name}`);
        assert.equal(afterPkg[group][name], `${prefix}${change.to}`);
        assert.equal(afterLock.packages[`node_modules/${name}`]?.version, change.to);
      }
    }
  }
  assert.ok(names.every(name => Object.hasOwn(direct(beforePkg), name)), 'Unknown planned package');
  const allowed = new Set([...closure(beforeLock, names), ...closure(afterLock, names)]);
  const changed = [];
  for (const path of new Set([...Object.keys(beforeLock.packages), ...Object.keys(afterLock.packages)])) {
    if (!path || JSON.stringify(beforeLock.packages[path]) === JSON.stringify(afterLock.packages[path])) continue;
    assert.ok(allowed.has(path), `Unrelated lockfile change: ${path}`);
    const item = afterLock.packages[path];
    if (item) {
      assert.ok(item.resolved?.startsWith('https://registry.npmjs.org/'), `Non-registry lock entry: ${path}`);
      assert.match(item.integrity ?? '', /^sha(256|384|512)-[A-Za-z0-9+/=]+$/);
    }
    changed.push(path);
  }
  return changed.sort();
}
