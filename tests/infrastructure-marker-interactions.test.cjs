const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const interactionCode = html.slice(
  html.indexOf('var infoWindow = new kakao.maps.InfoWindow'),
  html.indexOf('function updateBrandMarkers()'),
);

function harness(touch) {
  const opened = [];
  let prevented = 0;
  function element(tagName) {
    return {
      tagName,
      style: {},
      children: [],
      events: {},
      appendChild(child) { this.children.push(child); },
      addEventListener(name, handler) { this.events[name] = handler; },
    };
  }
  const context = {
    map: {},
    document: { createElement: element },
    window: {
      matchMedia: () => ({ matches: touch }),
      open: (...args) => opened.push(args),
    },
    kakao: { maps: {
      InfoWindow: function () {
        this.setContent = content => { this.content = content; };
        this.open = (map, marker) => { this.map = map; this.marker = marker; };
        this.close = () => { this.map = null; this.marker = null; };
      },
      event: {
        addListener: (marker, name, handler) => { marker.events[name] = handler; },
        preventMap: () => { prevented++; },
      },
    } },
  };
  vm.createContext(context);
  vm.runInContext(interactionCode, context);
  function bind(brand, name = '테스트 지점', url = 'http://place.map.kakao.com/123') {
    const marker = { events: {}, setClickable(value) { this.clickable = value; } };
    context.bindInfrastructureMarkerEvents(marker, brand, { place_name: name, place_url: url });
    return marker;
  }
  return { context, bind, opened, prevented: () => prevented };
}

test('inline scripts remain valid JavaScript', () => {
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (script[1].trim()) new vm.Script(script[1]);
  }
});

for (const brand of ['대형슈퍼', '대형마트']) {
  test(`${brand}: desktop keeps hover name and direct click`, () => {
    const h = harness(false);
    const marker = h.bind(brand);
    assert.equal(marker.clickable, true);
    marker.events.mouseover();
    assert.equal(h.context.infoWindow.marker, marker);
    assert.equal(h.context.infoWindow.content.tagName, 'div');
    assert.equal(h.context.infoWindow.content.children[0].textContent, '테스트 지점');
    assert.equal(h.context.infoWindow.content.children.length, 1);
    marker.events.mouseout();
    assert.equal(h.context.infoWindow.map, null);
    marker.events.click();
    assert.deepEqual(h.opened, [['http://place.map.kakao.com/123', '_blank']]);
  });

  test(`${brand}: first touch shows persistent name/link without opening URL`, () => {
    const h = harness(true);
    const marker = h.bind(brand, '슈퍼 <b>지점</b>');
    marker.events.mouseover();
    assert.equal(h.context.infoWindow.map, undefined);
    marker.events.click();
    assert.equal(h.opened.length, 0);
    assert.equal(h.context.infoWindow.marker, marker);
    const content = h.context.infoWindow.content;
    assert.equal(content.tagName, 'a');
    assert.equal(content.href, 'https://place.map.kakao.com/123');
    assert.equal(content.target, '_blank');
    assert.equal(content.rel, 'noopener noreferrer');
    assert.equal(content.children[0].textContent, '슈퍼 <b>지점</b>');
    assert.equal(content.children[1].textContent, '카카오맵에서 보기 ↗');
    marker.events.mouseout();
    assert.equal(h.context.infoWindow.marker, marker);
    marker.events.click();
    assert.equal(h.opened.length, 0, 'second marker tap must not unexpectedly navigate');
    let stopped = 0;
    for (const name of ['pointerdown', 'mousedown', 'touchstart', 'click']) {
      content.events[name]({ stopPropagation() { stopped++; } });
    }
    assert.equal(stopped, 4);
    assert.equal(h.prevented(), 4);
  });
}

test('touch switches between places and closes without stale ownership', () => {
  const h = harness(true);
  const first = h.bind('대형슈퍼', '슈퍼');
  const second = h.bind('대형마트', '마트');
  first.events.click();
  second.events.click();
  assert.equal(h.context.infoWindow.marker, second);
  assert.equal(h.context.infoWindow.content.children[0].textContent, '마트');
  h.context.closeInfrastructureInfo();
  assert.equal(h.context.infoWindow.map, null);
  assert.equal(h.context.infrastructureInfoMarker, null);
});

test('missing URL only displays a name, with no broken link', () => {
  const h = harness(true);
  h.bind('대형마트', '링크 없는 마트', '').events.click();
  assert.equal(h.context.infoWindow.content.tagName, 'div');
  assert.equal(h.context.infoWindow.content.children.length, 1);
  assert.equal(h.opened.length, 0);
});

test('other brands retain direct navigation on desktop and touch', () => {
  for (const touch of [false, true]) {
    for (const brand of ['다이소', '올리브영', '스타벅스']) {
      const h = harness(touch);
      const marker = h.bind(brand);
      assert.equal(marker.events.mouseover, undefined);
      marker.events.click();
      assert.equal(h.opened.length, 1);
    }
  }
});

test('explore and neighborhood automatic paths both use shared interactions', () => {
  assert.equal((html.match(/bindInfrastructureMarkerEvents\(marker, brand, place\);/g) || []).length, 2);
  assert(!html.includes('bindInfrastructureMarkerHover'));
  for (const event of ['click', 'dragstart', 'zoom_changed']) {
    assert(html.includes(`addListener(map, "${event}", function () {\n        closeInfrastructureInfo();`));
  }
});
