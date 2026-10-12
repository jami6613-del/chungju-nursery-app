const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function mount(scale = 1) {
  const listeners = {};
  const updates = [];
  const element = {
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (name, fn) => { listeners[name] = fn; },
    removeEventListener: () => {},
  };
  let refs = 0;
  let states = 0;
  const react = {
    useRef: value => ({ current: refs++ === 0 ? element : value }),
    useState: initial => {
      const index = states++;
      return [index === 0 ? scale : initial, value => updates.push([index, value])];
    },
    useEffect: fn => fn(),
    useCallback: fn => fn,
  };
  const source = fs.readFileSync('src/PinchZoomWrapper.tsx', 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }}).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, Date, require: name => {
    if (name === 'react') return react;
    return { jsx: (type, props) => ({ type, props }) };
  }});
  const view = module.exports.PinchZoomWrapper({ children: 'table' });
  function touch(name, points) {
    let prevented = false;
    listeners[name]({ touches: points.map(([clientX, clientY]) => ({ clientX, clientY })),
      preventDefault: () => { prevented = true; } });
    return prevented;
  }
  return { view, updates, touch };
}

test('fast repeated single-finger swipes remain native at normal scale', () => {
  const { view, touch, updates } = mount();
  assert.equal(view.props.style.touchAction, 'pan-x pan-y');
  assert.equal(view.props.children.props.style.transform, 'none');
  assert.equal(touch('touchstart', [[30, 100]]), false);
  assert.equal(touch('touchmove', [[30, 300]]), false);
  touch('touchend', []);
  assert.equal(touch('touchstart', [[30, 100]]), false);
  assert.equal(touch('touchmove', [[230, 100]]), false);
  assert.equal(updates.filter(([index]) => index < 3).length, 0);
});

test('custom two-finger zoom remains available', () => {
  const { touch, updates } = mount();
  touch('touchstart', [[0, 0], [100, 0]]);
  assert.equal(touch('touchmove', [[0, 0], [200, 0]]), true);
  assert.ok(updates.some(([index, value]) => index === 0 && value === 2));
});

test('zoomed view still supports pan and double-tap reset', () => {
  const { view, touch, updates } = mount(2);
  assert.equal(view.props.style.touchAction, 'none');
  touch('touchstart', [[30, 100]]);
  assert.equal(touch('touchmove', [[50, 150]]), true);
  assert.ok(updates.some(([index, value]) => index === 2 && value === 50));
  touch('touchend', []);
  assert.equal(touch('touchstart', [[30, 100]]), false);
  touch('touchend', []);
  assert.equal(touch('touchstart', [[30, 100]]), true);
  assert.ok(updates.some(([index, value]) => index === 0 && value === 1));
});
