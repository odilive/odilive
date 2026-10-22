const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const data = require('../development-overlay-data.js');
const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
const coordinates = [{ lat: 37, lng: 126 }, { lat: 37.1, lng: 126 }, { lat: 37, lng: 126.1 }];
function row(id, extra = {}) {
  return { id, neighborhood_id: 'hood', name: '구역', polygon: coordinates,
    label_lat: null, label_lng: null, created_at: '2026-10-22T14:21:54Z', ...extra };
}
const clone = value => JSON.parse(JSON.stringify(value));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

function harness(initial = []) {
  const state = { rows: clone(initial), log: [], readGate: null, failUpsert: false, loseResponse: false, failDelete: false };
  class Query {
    constructor() { this.operation = 'read'; this.filters = []; }
    select() { return this; }
    eq(key, value) { this.filters.push(r => r[key] === value); return this; }
    in(key, values) { this.filters.push(r => values.includes(r[key])); this.ids = Array.from(values); return this; }
    upsert(rows, options) { assert.equal(options.onConflict, 'id'); this.operation = 'upsert'; this.rows = clone(rows); return this; }
    delete() { this.operation = 'delete'; return this; }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
    async execute() {
      state.log.push({ operation: this.operation, rows: this.rows, ids: this.ids });
      if (this.operation === 'read') {
        if (state.readGate) await state.readGate.promise;
        return { data: clone(state.rows.filter(r => this.filters.every(f => f(r)))), error: null };
      }
      if (this.operation === 'upsert') {
        if (state.failUpsert) return { error: { message: 'upsert failed' } };
        const saved = this.rows.map(r => {
          const existing = state.rows.find(old => old.id === r.id);
          if (existing) { Object.assign(existing, r); return existing; }
          const next = { ...r, created_at: '2026-10-23T00:00:00Z' }; state.rows.push(next); return next;
        });
        if (state.loseResponse) { state.loseResponse = false; return { error: { message: 'response lost' } }; }
        return { data: clone(saved), error: null };
      }
      assert(this.ids, 'deletion must always target explicit IDs');
      assert(this.filters.length >= 2, 'deletion must also be scoped to its neighborhood');
      if (state.failDelete) return { error: { message: 'delete failed' } };
      state.rows = state.rows.filter(r => !this.filters.every(f => f(r)));
      return { error: null };
    }
  }
  const polygon = { myData: { id: 'hood', developmentOverlays: [] } };
  const context = {
    DevelopmentOverlayData: data, activePolygon: polygon,
    sb: { from(table) { assert.equal(table, 'development_overlays'); return new Query(); } },
    renderDevelopmentOverlays: () => { context.renders++; }, renders: 0,
    window: { crypto: { randomUUID } }, console: { error() {} },
  };
  vm.createContext(context);
  vm.runInContext(admin.slice(admin.indexOf('async function loadDevelopmentOverlays(polygon)'), admin.indexOf('function finishDrawing()')), context);
  return { state, polygon, context, load: () => context.loadDevelopmentOverlays(polygon), save: () => context.saveDevelopmentOverlays(polygon) };
}

test('exact duplicates prefer moved coordinates, regardless of response order', () => {
  const old = row('old');
  const moved = row('moved', { label_lat: 37.512085213171, label_lng: 126.942134024934 });
  for (const rows of [[old, moved], [moved, old]]) {
    const result = data.deduplicate(rows);
    assert.equal(result.length, 1); assert.equal(result[0], moved);
  }
});

test('different boundaries, names and parent neighborhoods are never merged', () => {
  const rows = [row('a'), row('b', { polygon: coordinates.concat({ lat: 37.2, lng: 126.2 }) }),
    row('c', { name: '다른 구역' }), row('d', { neighborhood_id: 'other' })];
  assert.equal(data.deduplicate(rows).length, 4);
});

test('coordinate object key order does not create false distinctions', () => {
  assert.equal(data.deduplicate([row('a'), row('b', { polygon: coordinates.map(p => ({ lng: p.lng, lat: p.lat })) })]).length, 1);
});

test('load removes the old duplicate from editor but records both saved IDs', async () => {
  const h = harness([row('old'), row('moved', { label_lat: 37.5, label_lng: 126.9 })]);
  await h.load();
  assert.equal(h.polygon.myData.developmentOverlays.length, 1);
  assert.equal(h.polygon.myData.developmentOverlays[0].id, 'moved');
  assert.deepEqual(Array.from(h.polygon.myData.developmentOverlaySavedIds).sort(), ['moved', 'old']);
});

test('duplicate in-flight loads share one request; reopening preserves local edits', async () => {
  const h = harness([row('saved')]); h.state.readGate = deferred();
  const first = h.load(), second = h.load();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state.log.length, 1);
  h.state.readGate.resolve(); await Promise.all([first, second]);
  h.polygon.myData.developmentOverlays[0].label_lat = 37.55;
  await h.load();
  assert.equal(h.state.log.length, 1);
  assert.equal(h.polygon.myData.developmentOverlays[0].label_lat, 37.55);
});

test('loaded row and identical unsaved local row do not become two rows', async () => {
  const h = harness([row('saved')]);
  h.polygon.myData.developmentOverlays = [row(undefined, { label_lat: 37.5, label_lng: 126.9 })];
  await h.load(); assert.equal(h.polygon.myData.developmentOverlays.length, 1);
  assert.equal(h.polygon.myData.developmentOverlays[0].label_lat, 37.5);
});

test('late response for a different selected neighborhood never redraws it', async () => {
  const h = harness([row('saved')]); h.state.readGate = deferred();
  const loading = h.load(); h.context.activePolygon = { myData: { id: 'other' } };
  h.state.readGate.resolve(); await loading;
  assert.equal(h.context.renders, 0); assert.equal(h.polygon.myData.developmentOverlaysLoaded, true);
});

test('save keeps moved ID and coordinates, preserves multiple legitimate overlays', async () => {
  const moved = row('moved', { label_lat: 37.512085213171, label_lng: 126.942134024934 });
  const h = harness([row('old'), moved, row('second', { name: '두 번째' }), row('other', { neighborhood_id: 'other' })]);
  assert.equal((await h.save()).error, null);
  assert.equal(h.state.rows.length, 3);
  assert.deepEqual(h.state.rows.find(r => r.id === 'moved'), moved);
  assert(h.state.rows.some(r => r.id === 'second')); assert(h.state.rows.some(r => r.id === 'other'));
  assert(h.state.log.findIndex(r => r.operation === 'upsert') < h.state.log.findIndex(r => r.operation === 'delete'));
});

test('failed upsert leaves all original database rows intact', async () => {
  const initial = [row('old'), row('moved', { label_lat: 37.5, label_lng: 126.9 })];
  const h = harness(initial); h.state.failUpsert = true;
  assert((await h.save()).error); assert.deepEqual(h.state.rows, initial);
  assert(!h.state.log.some(r => r.operation === 'delete'));
});

test('lost write response can be retried without generating a second new ID', async () => {
  const h = harness(); await h.load();
  h.polygon.myData.developmentOverlays.push(row(undefined));
  h.state.loseResponse = true;
  assert((await h.save()).error);
  const id = h.polygon.myData.developmentOverlays[0].id;
  assert.equal((await h.save()).error, null);
  assert.equal(h.state.rows.length, 1); assert.equal(h.state.rows[0].id, id);
});

test('deletion failure can be retried without reinserting the keeper', async () => {
  const h = harness([row('old'), row('moved', { label_lat: 37.5, label_lng: 126.9 })]);
  h.state.failDelete = true; assert((await h.save()).error);
  h.state.failDelete = false; assert.equal((await h.save()).error, null);
  assert.equal(h.state.rows.length, 1); assert.equal(h.state.rows[0].id, 'moved');
});

test('only explicitly removed known rows are deleted, not later unseen rows', async () => {
  const h = harness([row('saved')]); await h.load();
  h.state.rows.push(row('unseen', { name: '다른 탭에서 추가' }));
  h.polygon.myData.developmentOverlays = [];
  await h.save(); assert.deepEqual(h.state.rows.map(r => r.id), ['unseen']);
});

test('save wrapper blocks double clicks and releases the lock after errors', async () => {
  const gate = deferred(), button = {}, context = {
    document: { querySelector: () => button }, console: { error() {} }, alert() {},
    saveNeighborhoodData: async () => { context.calls++; await gate.promise; throw Error('failed'); }, calls: 0,
  };
  vm.createContext(context);
  vm.runInContext(admin.slice(admin.indexOf('var isNeighborhoodSaveRunning ='), admin.indexOf('async function saveNeighborhoodData()')), context);
  const first = context.saveData(), second = context.saveData();
  assert.equal(context.calls, 1); assert.equal(button.disabled, true);
  gate.resolve(); await Promise.all([first, second]);
  assert.equal(context.isNeighborhoodSaveRunning, false); assert.equal(button.disabled, false);
});

test('public and admin inline scripts parse and both load the shared policy', () => {
  for (const name of ['index.html', 'admin.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
    assert(html.includes('src="development-overlay-data.js"'));
    for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      if (script[1].trim()) new vm.Script(script[1], { filename: name });
    }
  }
});
