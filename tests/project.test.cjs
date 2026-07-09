const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const defaults = JSON.parse(fs.readFileSync('config/defaultSettings.json', 'utf8'));
const popup = fs.readFileSync('popup.html', 'utf8');
const background = fs.readFileSync('src/background.js', 'utf8');
const content = fs.readFileSync('src/content.js', 'utf8');
const styles = fs.readFileSync('css/styles.css', 'utf8');

const referencedFiles = [
  manifest.action?.default_popup,
  manifest.background?.service_worker,
  ...Object.values(manifest.icons || {}),
  ...(manifest.content_scripts || []).flatMap(entry => [
    ...(entry.js || []),
    ...(entry.css || [])
  ])
].filter(Boolean);

for (const referencedFile of referencedFiles) {
  assert.ok(
    fs.existsSync(path.resolve(referencedFile)),
    `manifest references missing file: ${referencedFile}`
  );
}

const ids = Array.from(popup.matchAll(/\bid="([^"]+)"/g), match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'popup.html contains duplicate ids');

for (const key of Object.keys(defaults)) {
  assert.ok(ids.includes(key), `default setting has no popup control: ${key}`);
}

const labelTokens = popup.match(/<\/?label\b[^>]*>/gi) || [];
let labelDepth = 0;
for (const token of labelTokens) {
  if (/^<\//.test(token)) {
    labelDepth -= 1;
    assert.ok(labelDepth >= 0, 'popup.html has an unmatched closing label');
  } else {
    assert.equal(labelDepth, 0, 'popup.html contains nested labels');
    labelDepth += 1;
  }
}
assert.equal(labelDepth, 0, 'popup.html has an unclosed label');

const configuredModels = Array.from(
  popup.matchAll(/<option value="(deepseek-[^"]+)"/g),
  match => match[1]
);
for (const model of configuredModels) {
  assert.ok(background.includes(`'${model}'`), `background does not allow model: ${model}`);
}
assert.ok(configuredModels.includes(defaults.deepseekModel));

assert.doesNotMatch(content, /\.innerHTML\s*=/, 'content script should not reparse page HTML');
assert.match(content, /translationCachePrefix/, 'content script should define translation cache keys');
assert.match(content, /chrome\.storage\.local\.set/, 'content script should persist translation cache locally');
assert.match(content, /translationCacheDays/, 'content script should use the configured cache duration');
assert.match(content, /return Infinity/, 'translation cache should support permanent retention');
assert.match(content, /translationToggle/, 'content script should render per-paragraph translation toggles');
assert.match(content, /showBottomNotification\('已读取缓存'/, 'cache hits should use the shared bottom-left toast');
assert.doesNotMatch(content, /showBottomNotification\(text\)/, 'copy toast should not display the full selected paragraph');
assert.match(styles, /\.anontranslator-translation-toggle[\s\S]*position:\s*absolute/, 'translation toggle should use document coordinates instead of scroll-following fixed positioning');
assert.match(styles, /clip-path:\s*polygon/, 'translation toggle should draw a graphic triangle instead of using text');
assert.doesNotMatch(background, /LEGACY_SETTING_KEYS/, 'background should not keep removed feature migration code');
assert.doesNotMatch(background, /useWindowsTTS|useVITS|youdao|deepl|caiyun/, 'background should not reference removed providers');

const applyBlueBorderSource = content.slice(
  content.indexOf('function applyBlueBorder'),
  content.indexOf('// 为指定标签添加预选框')
);
assert.doesNotMatch(
  applyBlueBorderSource,
  /extensionClasses\.translation[\s\S]*?\.remove\(\)/,
  'switching paragraphs should preserve previous translations'
);

const restoreSentenceSplittingSource = content.slice(
  content.indexOf('function restoreSentenceSplitting'),
  content.indexOf('function restoreImageCursor')
);
assert.match(
  restoreSentenceSplittingSource,
  /getDirectTranslationDivs\(tag\)[\s\S]*?translationDivs\.forEach\(div => tag\.appendChild\(div\)\)/,
  'restoring original paragraph nodes should reattach preserved translations'
);

console.log('project tests passed');
