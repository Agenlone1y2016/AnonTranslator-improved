const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/background.js', 'utf8');
const chrome = {
  runtime: {
    lastError: null,
    getURL: path => path,
    onInstalled: { addListener() {} },
    onMessage: { addListener() {} }
  },
  storage: {
    sync: {
      get() {},
      set() {},
      remove() {}
    },
    local: {
      get() {}
    }
  }
};

const context = vm.createContext({
  AbortController,
  URLSearchParams,
  chrome,
  clearTimeout,
  console,
  fetch,
  setTimeout
});
vm.runInContext(source, context, { filename: 'src/background.js' });

function evaluate(expression) {
  return vm.runInContext(expression, context);
}

assert.equal(evaluate("normalizeLanguageForGoogle('ZH', false)"), 'zh-CN');
assert.equal(evaluate("normalizeLanguageForGoogle('', true)"), 'auto');
assert.equal(evaluate("decodeHtmlEntities('&lt;猫&#x1F431;&gt;')"), '<猫🐱>');
assert.equal(evaluate("decodeHtmlEntities('&#x110000;')"), '&#x110000;');

const annotations = JSON.parse(JSON.stringify(evaluate(`
  normalizeWordAnnotations(
    '魔法学校へ行った',
    [
      { surface: '魔', reading: 'マ' },
      { surface: '法', reading: 'ホウ' },
      { surface: '学', reading: 'ガク' },
      { surface: '校', reading: 'コウ' },
      { surface: '行った', reading: 'イッタ' }
    ]
  )
`)));
assert.deepEqual(annotations, {
  annotations: [
    { start: 0, end: 4, reading: 'まほうがくこう' },
    { start: 5, end: 8, reading: 'いった' }
  ]
});

assert.throws(
  () => evaluate("parseJsonOrThrow('<html>', '测试接口')"),
  /测试接口 返回的内容不是有效 JSON/
);

(async () => {
  await assert.rejects(
    evaluate("translateText('a'.repeat(MAX_TRANSLATION_CHARACTERS + 1), 'ja', 'zh-CN', 'google')"),
    /单次翻译最多支持/
  );
  await assert.rejects(
    evaluate("translateText({}, 'ja', 'zh-CN', 'google')"),
    /没有提供翻译文本/
  );

  context.fetch = async () => new Response(
    JSON.stringify([[['猫', 'cat']]]),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
  assert.equal(await evaluate("googleTranslate('cat', 'en', 'ja')"), '猫');

  chrome.storage.local.get = (_keys, callback) => {
    callback({ deepseekApiKey: 'test-key' });
  };
  let capturedRequest;
  context.fetch = async (url, options) => {
    capturedRequest = { url, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            translation: '魔法学校',
            annotations: [{ surface: '魔法学校', reading: 'まほうがっこう' }]
          })
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const deepseekResult = JSON.parse(JSON.stringify(
    await evaluate("deepseekTranslate('魔法学校', 'ja', 'zh-CN', 'deepseek-v4-pro')")
  ));
  assert.equal(capturedRequest.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(capturedRequest.body.model, 'deepseek-v4-pro');
  assert.deepEqual(capturedRequest.body.thinking, { type: 'disabled' });
  assert.deepEqual(deepseekResult.furiganaAnnotations, [
    { start: 0, end: 4, reading: 'まほうがっこう' }
  ]);

  context.fetch = async () => new Response(JSON.stringify({
    choices: [{ finish_reason: 'length', message: { content: '{}' } }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(
    evaluate("deepseekTranslate('長文', 'ja', 'zh-CN', 'deepseek-v4-flash')"),
    /输出达到长度上限/
  );

  console.log('background tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
