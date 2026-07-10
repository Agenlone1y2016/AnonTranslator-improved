const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const defaults = JSON.parse(fs.readFileSync('config/defaultSettings.json', 'utf8'));
const popup = fs.readFileSync('popup.html', 'utf8');
const background = fs.readFileSync('src/background.js', 'utf8');
const content = fs.readFileSync('src/content.js', 'utf8');
const styles = fs.readFileSync('css/styles.css', 'utf8');
const browserFixture = fs.readFileSync('tests/browser-fixture.html', 'utf8');

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
assert.match(content, /translationCacheVersion = 2/, 'translation cache should use exact-text v2 entries');
assert.match(content, /legacyTranslationCachePrefixes/, 'translation cache should prune unsafe v1 entries');
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

const readableBlockSource = content.slice(
  content.indexOf('function isReadableBlock'),
  content.indexOf('function findReadableBlockFromNode')
);
assert.ok(
  readableBlockSource.indexOf('if (!isStrictReadable && !isGenericReadable)') <
    readableBlockSource.indexOf('const textLength = getElementTextLength(element'),
  'readable-block detection should reject unrelated nodes before copying their text'
);
assert.match(
  readableBlockSource,
  /if \(isGenericReadable && !isStrictReadable\)/,
  'explicit role paragraphs should retain strict readable-block behavior'
);
assert.match(
  content,
  /document\.createTreeWalker\(element, NodeFilter\.SHOW_TEXT\)/,
  'readable-block text checks should stop without copying a full large subtree'
);

const readablePathSource = content.slice(
  content.indexOf('function findReadableBlockFromNode'),
  content.indexOf('function findReadableBlockFromEvent')
);
assert.match(
  readablePathSource,
  /if \(eventPath\.length > 0\)[\s\S]*return null;/,
  'composed paths should not be scanned twice'
);

const togglePositionSource = content.slice(
  content.indexOf('function positionTranslationToggle'),
  content.indexOf('function getPageCacheScope')
);
assert.match(togglePositionSource, /removeTranslationDiv\(translationDiv\)/, 'detached translations should release their toggles');
assert.match(togglePositionSource, /translationToggleFrame !== null/, 'toggle positioning should coalesce animation frames');
assert.match(content, /new MutationObserver/, 'translation toggles should react to host-page DOM removal');

const cacheSignatureSource = content.slice(
  content.indexOf('function getTranslationTextSignature'),
  content.indexOf('function isManagedTranslationCacheKey')
);
assert.match(cacheSignatureSource, /String\(text \?\? ''\)/, 'cache signatures should use the exact source text');
assert.doesNotMatch(cacheSignatureSource, /replace\(/, 'cache signatures must not collapse whitespace used by furigana offsets');

const handleClickSource = content.slice(
  content.indexOf('function handleClick'),
  content.indexOf('// 为指定标签添加激活框')
);
assert.match(handleClickSource, /clickedElement\?\.closest\('img, svg image'\)/, 'clicking an image itself should skip paragraph translation');
assert.doesNotMatch(handleClickSource, /targetElement\.querySelector\('img, svg image'\)/, 'inline images should not disable paragraph translation');

const hoverSource = content.slice(
  content.indexOf('function highlightAndCopyPtag'),
  content.indexOf('// 为文档添加鼠标监听器')
);
assert.doesNotMatch(hoverSource, /currentHoveredBlock = toElement/, 'moving directly between paragraphs should not suppress the next hover');
assert.match(hoverSource, /currentHoveredBlock = null/, 'mouseout should allow the next paragraph to receive hover state');

const contextMenuSource = content.slice(
  content.indexOf("doc.addEventListener('contextmenu'"),
  content.indexOf("doc.addEventListener('mouseover'", content.indexOf("doc.addEventListener('contextmenu'"))
);
assert.match(contextMenuSource, /!extensionSettings\.copy/, 'disabled copy mode should preserve the native context menu');

assert.match(browserFixture, /id="cache-double-space"/, 'browser fixture should cover exact whitespace cache keys');
assert.match(browserFixture, /id="cache-single-space"/, 'browser fixture should cover whitespace variants');
assert.match(browserFixture, /id="image-paragraph-text"/, 'browser fixture should cover text beside inline images');

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
