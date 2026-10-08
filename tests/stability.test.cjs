const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
function loadSource(file, { names, mocks = {}, globals = {}, env } = {}) {
  let source = fs.readFileSync(path.join(root, file), 'utf8');
  if (names) {
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    source = tree.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
      .map((node) => node.getText(tree)).join('\n');
    for (const name of names) assert.match(source, new RegExp(`function ${name}\\(`));
    source += `\nmodule.exports = { ${names.join(', ')} };`;
  }
  if (env) source = source.replaceAll('import.meta.env', JSON.stringify(env));
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  const context = { module, exports: module.exports, require: (id) => id in mocks ? mocks[id] : require(id), atob, Uint8Array, ArrayBuffer, ...globals };
  vm.runInNewContext(js, context, { filename: file });
  return module.exports;
}

const quantities = loadSource('src/App.tsx', { names: ['planQuantityDisplay', 'planQuantityParse', 'planQuantityToParts', 'addPlanQuantity'] });
const ui = loadSource('src/components/ui.tsx');

test('planning display and parsing preserve separate decimal quantities', () => {
  const cases = [
    ['3.5+0.5', 3.5, 0.5], ['3.25 + 0.125', 3.25, 0.125], ['3,5+0,5', 3.5, 0.5],
    ['0.1+0.2', 0.1, 0.2], ['12', 12, 0], ['+0.5', 0, 0.5], ['', 0, 0], ['-', 0, 0],
  ];
  for (const [input, base, extra] of cases) {
    const actual = quantities.planQuantityToParts(input);
    assert.equal(actual.base, base, input);
    assert.equal(actual.extra, extra, input);
  }
  assert.equal(quantities.planQuantityDisplay('3.5', '0.5'), '3.5+0.5');
  assert.equal(quantities.planQuantityDisplay('3.125', ''), '3.125');
});

test('base and extra subtotals remain separate without floating point display noise', () => {
  let base = 0;
  let extra = 0;
  for (const input of ['3.5+0.1', '0.25+0.2', '1.125+0.025']) {
    const parts = quantities.planQuantityToParts(input);
    base = quantities.addPlanQuantity(base, parts.base);
    extra = quantities.addPlanQuantity(extra, parts.extra);
  }
  assert.equal(base, 4.875);
  assert.equal(extra, 0.325);
  assert.equal(quantities.addPlanQuantity(0.1, 0.2), 0.3);
  assert.equal(quantities.addPlanQuantity(0.0000001, 0.0000002), 0.0000003);
  assert.equal(quantities.addPlanQuantity(1.23456789, 0.00000001), 1.2345679);
  assert.equal(quantities.addPlanQuantity(0, 1e-101), 1e-101);
});

// Exercise the actual whiteboard aggregation and footer JSX without auth or live data.
function renderWhiteboardSummary(items) {
  const source = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
  const setupStart = source.indexOf('const trayTotals:');
  const setupEnd = source.indexOf('\n                  return (', setupStart);
  const footerStart = source.indexOf('<div className="shrink-0 border-t-2', setupEnd);
  const footerEnd = source.indexOf('\n                        )}', footerStart);
  assert.ok(setupStart >= 0 && setupEnd > setupStart && footerStart > setupEnd && footerEnd > footerStart);
  const snippet = `module.exports = function(items) { ${source.slice(setupStart, setupEnd)}; return (${source.slice(footerStart, footerEnd)}); };`;
  const js = ts.transpileModule(snippet, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: 'whiteboard-summary.tsx',
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, require, ...quantities });
  return renderToStaticMarkup(module.exports(items));
}

test('whiteboard totals combine decimal base and extra per tray across all rows', () => {
  const items = [
    { tray_type: '200', quantity: '3.5+0.5' },
    { tray_type: '200', quantity: '1.25+0.25' },
    { tray_type: '406', quantity: '2.5+0.5' },
  ];
  const before = JSON.stringify(items);
  const html = renderWhiteboardSummary(items);
  assert.match(html, /200구:<\/span><span>총 5.5판<\/span>/);
  assert.match(html, /406구:<\/span><span>총 3판<\/span>/);
  assert.doesNotMatch(html, /기본|추가|parseInt/);
  assert.equal(JSON.stringify(items), before, 'Original row quantities must remain separate and unchanged');
  assert.match(renderWhiteboardSummary([items[0]]), /총 4판/);
});

test('whiteboard totals preserve small decimals, extra-only rows and custom tray grouping', () => {
  const html = renderWhiteboardSummary([
    { tray_type: '200', quantity: '0.1+0.2' },
    { tray_type: '직접입력', tray_custom: ' 200 ', quantity: '+0.025' },
    { tray_type: '직접입력', tray_custom: '72', quantity: '3,25+0,125' },
    { tray_type: '406', quantity: '' },
    { tray_type: '', quantity: '+0.5' },
  ]);
  assert.match(html, /200구:<\/span><span>총 0.325판<\/span>/);
  assert.match(html, /72구:<\/span><span>총 3.375판<\/span>/);
  assert.match(html, /미지정구:<\/span><span>총 0.5판<\/span>/);
  assert.doesNotMatch(html, /406구|0\.300000|기본|추가/);
  assert.ok(html.indexOf('72구:') < html.indexOf('200구:'), 'Keep numeric tray sorting');
  assert.doesNotMatch(renderWhiteboardSummary([]), /총 /);
});

test('plan to actual API inserts base and extra decimals as distinct fields', async () => {
  const payloads = [];
  const supabase = { from: (table) => {
    assert.equal(table, 'orders');
    return { insert: (payload) => {
      payloads.push(payload);
      return { select: () => ({ single: async () => ({ data: { id: `order-${payloads.length}`, ...payload }, error: null }) }) };
    } };
  } };
  const { addOrdersFromPlanItems } = loadSource('src/lib/planningApi.ts', { mocks: { '../supabaseClient': { supabase } } });
  const fixtures = ['3.5+0.5', '3,25+0,125', '0.1+0.2', '12', '+0.5', ''];
  const items = fixtures.map((quantity) => ({ quantity, orderer: ' 테스트 ', crop: ' 상추 ', plan_date: '2026-10-08', tray_type: '200', seed_owner: '육묘장' }));
  const results = await addOrdersFromPlanItems(items, 'test-user');
  assert.equal(results.length, fixtures.length);
  assert.deepEqual(payloads.map((p) => [p.quantity_base, p.quantity_extra]), [[3.5, .5], [3.25, .125], [.1, .2], [12, 0], [0, .5], [0, 0]]);
  assert.equal(payloads[0].customer_name, '테스트');
  assert.equal(payloads[0].tray_type, '200');
  assert.equal(payloads[0].created_by, 'test-user');
  const empty = await addOrdersFromPlanItems([], 'test-user');
  assert.equal(empty.length, 0);
  assert.equal(payloads.length, fixtures.length);
});

test('TextField forwards login autocomplete to actual input markup', () => {
  for (const [type, autoComplete] of [['email', 'username'], ['password', 'current-password'], ['password', 'new-password']]) {
    const html = renderToStaticMarkup(React.createElement(ui.TextField, { label: 'field', value: '', onChange() {}, type, autoComplete, inputClassName: 'custom-input', disabled: true, step: 'any' }));
    assert.match(html, new RegExp(`autoComplete="${autoComplete}"`, 'i'));
    assert.match(html, new RegExp(`type="${type}"`));
    assert.match(html, /custom-input/);
    assert.match(html, /disabled=""/);
    assert.match(html, /step="any"/);
  }
  let changed;
  const field = ui.TextField({ label: 'field', value: '3.5', onChange(value) { changed = value; } });
  field.props.children[1].props.onChange({ target: { value: '4.25' } });
  assert.equal(changed, '4.25');
});

for (const name of ['PrimaryButton', 'SecondaryButton']) {
  test(`${name} merges className and preserves existing type, handler, disabled, size and theme`, () => {
    const onClick = () => {};
    const button = ui[name]({ children: 'Save', onClick, className: 'w-full shrink-0', disabled: true, type: 'submit', size: 'lg' });
    assert.equal(button.props.onClick, onClick);
    assert.equal(button.props.disabled, true);
    assert.equal(button.props.type, 'submit');
    assert.match(button.props.className, /w-full shrink-0/);
    assert.match(button.props.className, /sm:px-5/);
    assert.match(button.props.className, name === 'PrimaryButton' ? /bg-brand/ : /bg-autumn-surface/);
    const html = renderToStaticMarkup(button);
    assert.match(html, /disabled=""/);
    assert.match(html, /type="submit"/);
    assert.equal(ui[name]({ children: 'Save' }).props.type, 'button');
  });
}

test('VAPID decoder supplies exact ArrayBuffer bytes without prompting for permission', async () => {
  let permissionPrompts = 0;
  const { urlBase64ToArrayBuffer } = loadSource('src/App.tsx', { names: ['urlBase64ToArrayBuffer'], globals: { Notification: { requestPermission() { permissionPrompts++; } } } });
  const bytes = Uint8Array.from([4, 251, 255, 0, 1, 2, 99]);
  const base64 = Buffer.from(bytes).toString('base64url');
  const key = urlBase64ToArrayBuffer(base64);
  assert.ok(key instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(key)], [...bytes]);
  const pushManager = { subscribe: async ({ applicationServerKey, userVisibleOnly }) => {
    assert.ok(applicationServerKey instanceof ArrayBuffer);
    assert.equal(userVisibleOnly, true);
    assert.deepEqual([...new Uint8Array(applicationServerKey)], [...bytes]);
    return { endpoint: 'https://example.invalid/test-only' };
  } };
  await pushManager.subscribe({ applicationServerKey: key, userVisibleOnly: true });
  assert.equal(permissionPrompts, 0);
});

test('role label guard accepts only known numeric 0–3 roles', () => {
  const { isUserRoleLevel } = loadSource('src/App.tsx', { names: ['isUserRoleLevel'] });
  for (const value of [0, 1, 2, 3]) assert.equal(isUserRoleLevel(value), true);
  for (const value of [-1, 4, 1.5, NaN, Infinity, undefined, null, '0']) assert.equal(isUserRoleLevel(value), false);
});

function currentUserClient({ user = { id: 'user-1' }, authError = null, profile = { id: 'user-1', name: null, role_level: 3, is_approved: false }, profileError = null, configured = true } = {}) {
  let reads = 0;
  const client = {
    auth: { getUser: async () => { reads++; return { data: { user }, error: authError }; } },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile, error: profileError }) }) }) }),
  };
  return {
    ...loadSource('src/supabaseClient.ts', { env: configured ? { VITE_SUPABASE_URL: 'https://example.invalid', VITE_SUPABASE_ANON_KEY: 'test-only' } : {}, mocks: { '@supabase/supabase-js': { createClient: () => client } } }),
    reads: () => reads,
  };
}

test('missing auth email normalizes to null without changing valid role or approval', async () => {
  const missing = await currentUserClient().fetchCurrentUser();
  assert.equal(missing.email, null);
  assert.equal(missing.name, null);
  assert.equal(missing.role_level, 3);
  assert.equal(missing.is_approved, false);
  const present = await currentUserClient({ user: { id: 'user-1', email: 'test@example.invalid' }, profile: { id: 'user-1', name: '테스트', role_level: 0, is_approved: true } }).fetchCurrentUser();
  assert.equal(present.email, 'test@example.invalid');
  assert.equal(present.role_level, 0);
  assert.equal(present.is_approved, true);
});

test('unconfigured, unauthenticated and failed profile reads return null safely', async () => {
  const unconfigured = currentUserClient({ configured: false });
  assert.equal(await unconfigured.fetchCurrentUser(), null);
  assert.equal(unconfigured.reads(), 0);
  for (const options of [{ user: null }, { authError: { message: 'test error' } }, { profile: null }, { profileError: { message: 'test error' } }]) {
    assert.equal(await currentUserClient(options).fetchCurrentUser(), null);
  }
});

test('actual LoginPage renders the requested login attributes and submit button', () => {
  const { LoginPage } = loadSource('src/App.tsx', {
    names: ['LoginPage'],
    globals: {
      React,
      useAuth: () => ({ user: null, isLoading: false, refresh: async () => {}, signOut: async () => {}, touchActivity: () => {} }),
      useNavigate: () => () => {},
      AutumnAtmosphere: () => null,
      TextField: ui.TextField,
      PrimaryButton: ui.PrimaryButton,
      LAST_LOGIN_EMAIL_KEY: 'qa-test-email',
      localStorage: { getItem: () => null },
    },
  });
  const html = renderToStaticMarkup(React.createElement(LoginPage));
  assert.match(html, /type="email"[^>]*autoComplete="username"/i);
  assert.match(html, /type="password"[^>]*autoComplete="current-password"/i);
  assert.match(html, /<button type="submit"/);
  assert.match(html, /autumn-welcome/);
});

test('actual push gate requests only the mocked permission and sends an ArrayBuffer key', async () => {
  let permissionCalls = 0;
  let subscribeCalls = 0;
  let saved = 0;
  let completed = 0;
  const storage = new Map();
  const keyBytes = [4, 251, 255, 0, 1, 2, 99];
  const gateReact = { ...React, useState: (initial) => [initial, () => {}], useCallback: (callback) => callback };
  const notification = { requestPermission: async () => { permissionCalls++; return 'granted'; } };
  const { PushPermissionGate } = loadSource('src/App.tsx', {
    names: ['PushPermissionGate', 'urlBase64ToArrayBuffer'],
    globals: {
      React: gateReact,
      window: { Notification: notification },
      Notification: notification,
      navigator: { serviceWorker: { ready: Promise.resolve({ pushManager: {
        getSubscription: async () => null,
        subscribe: async (options) => {
          subscribeCalls++;
          assert.equal(options.userVisibleOnly, true);
          assert.ok(options.applicationServerKey instanceof ArrayBuffer);
          assert.deepEqual([...new Uint8Array(options.applicationServerKey)], keyBytes);
          return { endpoint: 'https://example.invalid/qa-only' };
        },
      } }) } },
      VAPID_PUBLIC_KEY: Buffer.from(keyBytes).toString('base64url'),
      PUSH_CONSENT_STORAGE_KEY: 'qa-consent',
      savePushSubscription: async (id, sub) => { assert.equal(id, 'qa-user'); assert.equal(sub.endpoint, 'https://example.invalid/qa-only'); saved++; },
      localStorage: { setItem: (key, value) => storage.set(key, value) },
      AutumnAtmosphere: () => null,
      PrimaryButton: ui.PrimaryButton,
    },
  });
  const tree = PushPermissionGate({ userId: 'qa-user', onSuccess: () => completed++ });
  const button = tree.props.children.find((child) => child?.type === ui.PrimaryButton);
  assert.ok(button);
  assert.equal(permissionCalls, 0, 'No permission prompt on render');
  await button.props.onClick();
  assert.equal(permissionCalls, 1);
  assert.equal(subscribeCalls, 1);
  assert.equal(saved, 1);
  assert.equal(completed, 1);
  assert.equal(storage.get('qa-consent_qa-user'), '1');
});
