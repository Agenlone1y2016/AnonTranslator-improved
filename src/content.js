/* content.js */

(() => {
    'use strict';

/* ------------------------------------------------------------全局变量 */

// 记录最后点击的段落
let lastClickedPtag = null;

// 插件开关状态
let pluginEnabled = false;

// 设置只在启动时读取一次，后续由 storage.onChanged 实时更新。
const extensionSettings = {};

// 可读文本块。现代阅读站常用 div/article/section，而不只使用 p 标签。
const strictReadableTags = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'LI', 'BLOCKQUOTE', 'PRE', 'FIGCAPTION', 'DT', 'DD', 'TD', 'TH'
]);
const genericReadableTags = new Set(['DIV', 'ARTICLE', 'SECTION', 'MAIN']);
const strictReadableSelector = [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'li', 'blockquote', 'pre', 'figcaption', 'dt', 'dd', 'td', 'th',
    '[role="paragraph"]'
].join(',');
const readableSelector = `${strictReadableSelector},div,article,section,main`;
const extensionClasses = {
    translation: 'anontranslator-translation',
    translationError: 'anontranslator-translation-error',
    sentence: 'anontranslator-sentence',
    splitSentences: 'anontranslator-split-sentences',
    hovered: 'anontranslator-hovered',
    selected: 'anontranslator-selected',
    furiganaSource: 'anontranslator-furigana-source-line'
};

// 当前鼠标预选的文本块
let currentHoveredBlock = null;

// 防止同一文档被重复绑定监听器
const initializedDocuments = new WeakSet();

// 保存插件覆盖前的局部样式，避免清空网页原有的整个 style 属性
const originalVisualStyles = new WeakMap();

// 保存句子拆分前的原始节点，切换段落或关闭插件时完整还原页面。
const originalBlockContents = new WeakMap();
const splitBlocks = new Set();

// 临时覆盖图片鼠标样式时，只恢复插件改动过的局部属性。
const originalImageCursors = new WeakMap();
let currentHoveredImage = null;

// 存储定时器的变量
let notificationTimeout;

// 创建并添加复制通知元素到文档
const copyNotificationId = 'anontranslator-copy-notification';
const copyNotification = document.getElementById(copyNotificationId) || document.createElement('div');
copyNotification.id = copyNotificationId;
if (!copyNotification.isConnected) {
    document.documentElement.appendChild(copyNotification);
}


/* ------------------------------------------------------------总开关 */

function initializeSettings(data) {
    Object.assign(extensionSettings, data);
    pluginEnabled = Boolean(extensionSettings.pluginSwitch);
    if (pluginEnabled) {
        // 启动鼠标和键盘监听器
        addMouseListener(document);
    }
}

// 优先从后台读取“默认值 + 已保存值”，后台不可用时再退回同步存储。
chrome.runtime.sendMessage({ type: 'getSettings' }, (response) => {
    if (!chrome.runtime.lastError && response && !response.error) {
        initializeSettings(response);
        return;
    }

    chrome.storage.sync.get(null, initializeSettings);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;

    for (const [key, change] of Object.entries(changes)) {
        extensionSettings[key] = change.newValue;
    }

    if (changes.extraImage && !extensionSettings.extraImage) {
        restoreImageCursor(currentHoveredImage);
        currentHoveredImage = null;
    }
    if (!changes.pluginSwitch) return;

    pluginEnabled = Boolean(extensionSettings.pluginSwitch);
    if (pluginEnabled) {
        addMouseListener(document);
    } else {
        if (currentHoveredBlock && currentHoveredBlock !== lastClickedPtag) {
            restoreOutline(currentHoveredBlock);
        }
        document.querySelectorAll(`.${extensionClasses.translation}`).forEach(div => div.remove());
        Array.from(splitBlocks).forEach(restoreSentenceSplitting);
        if (lastClickedPtag) {
            restoreOutline(lastClickedPtag);
        }
        currentHoveredBlock = null;
        lastClickedPtag = null;
        restoreImageCursor(currentHoveredImage);
        currentHoveredImage = null;
        copyNotification.classList.remove('show');
    }
});


/* ------------------------------------------------------------文本模块 */

// 分割成列表
function parseStringToArray(str) {
    return typeof str === 'string'
        ? str.split('/').map(value => value.trim()).filter(Boolean)
        : [];
}

function getElementText(element) {
    return (element?.textContent || '').replace(/\s+/g, ' ').trim();
}

function isReadableBlock(element) {
    if (!(element instanceof Element) || !element.isConnected) {
        return false;
    }

    if (
        element.classList.contains(extensionClasses.translation) ||
        element.closest(`.${extensionClasses.translation}`) ||
        element.matches('button,input,textarea,select,option,[role="button"],[hidden],[aria-hidden="true"]') ||
        element.closest('[contenteditable="true"]')
    ) {
        return false;
    }

    const text = getElementText(element);
    if (!text) {
        return false;
    }

    if (strictReadableTags.has(element.nodeName) || element.getAttribute('role') === 'paragraph') {
        return true;
    }

    if (!genericReadableTags.has(element.nodeName) || text.length > 5000) {
        return false;
    }

    // 容器里已经有更精确的段落标签时，不把整个章节/页面误判成一个段落。
    if (element.querySelector(strictReadableSelector)) {
        return false;
    }

    // 对通用容器选择最靠近文字的叶子节点。
    return !Array.from(element.children).some(child => {
        if (child.classList.contains(extensionClasses.translation)) {
            return false;
        }
        return genericReadableTags.has(child.nodeName) && getElementText(child);
    });
}

function findReadableBlockFromNode(node, eventPath = []) {
    for (const pathNode of eventPath) {
        if (isReadableBlock(pathNode)) {
            return pathNode;
        }
    }

    let element = node instanceof Element ? node : node?.parentElement;
    while (element) {
        if (isReadableBlock(element)) {
            return element;
        }
        element = element.parentElement;
    }
    return null;
}

function findReadableBlockFromEvent(event) {
    if (
        event.target instanceof Element &&
        (
            event.target.closest('a,button,input,textarea,select,option,[role="button"],[contenteditable="true"]') ||
            event.target.closest(`.${extensionClasses.translation}`)
        )
    ) {
        return null;
    }

    const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : [];
    return findReadableBlockFromNode(event.target, eventPath);
}

function applyOutline(tag, width, style, color, radius) {
    if (!originalVisualStyles.has(tag)) {
        originalVisualStyles.set(tag, {
            outline: tag.style.outline,
            borderRadius: tag.style.borderRadius
        });
    }

    tag.style.outline = `${width} ${style} ${color}`;
    tag.style.borderRadius = radius;
}

function restoreOutline(tag) {
    if (!tag) return;

    const originalStyles = originalVisualStyles.get(tag);
    if (originalStyles) {
        tag.style.outline = originalStyles.outline;
        tag.style.borderRadius = originalStyles.borderRadius;
        originalVisualStyles.delete(tag);
    } else {
        tag.style.removeProperty('outline');
        tag.style.removeProperty('border-radius');
    }

    tag.classList.remove(extensionClasses.hovered);
    tag.classList.remove(extensionClasses.selected);
}

function getDirectTranslationDivs(tag) {
    return Array.from(tag?.children || []).filter(child => {
        return child.classList.contains(extensionClasses.translation);
    });
}

function canSafelySplitSentences(tag) {
    // 仅处理纯文本块；已有翻译是插件自己的节点，不应妨碍再次拆句。
    return Array.from(tag.childNodes).every(node => {
        return node.nodeType === Node.TEXT_NODE ||
            (
                node.nodeType === Node.ELEMENT_NODE &&
                node.classList.contains(extensionClasses.translation)
            );
    });
}

function cloneContentForText(source) {
    const container = document.createElement('div');
    if (source instanceof Element) {
        const clone = source.cloneNode(true);
        while (clone.firstChild) {
            container.appendChild(clone.firstChild);
        }
    } else {
        // 保留兼容入口；扩展自身的调用统一传入 DOM 节点，避免重新解析网页 HTML。
        container.textContent = String(source ?? '');
    }
    return container;
}

// 清理文本
function cleanText(source, symbolPairs) {
    const furiganaContainer = cloneContentForText(source);
    const normalizedSymbolPairs = symbolPairs
        .map(pair => Array.from(pair))
        .filter(pair => pair.length >= 2)
        .map(pair => [pair[0], pair[pair.length - 1]]);

    function removeTranslationDivs(element) {
        element.querySelectorAll(`.${extensionClasses.translation}`).forEach(translationDiv => {
            translationDiv.parentNode.removeChild(translationDiv);
        });
    }

    function processRubyTags(element, withFurigana) {
        element.querySelectorAll('ruby').forEach(ruby => {
            ruby.querySelectorAll('rp').forEach(rp => rp.remove());
            ruby.querySelectorAll('rt').forEach(rt => {
                const textNode = withFurigana ? document.createTextNode(`(${rt.textContent})`) : document.createTextNode('');
                rt.parentNode.replaceChild(textNode, rt);
            });
        });
    }

    // 初次处理：移除翻译内容并处理 ruby 标签（保留振假名）
    removeTranslationDivs(furiganaContainer);
    processRubyTags(furiganaContainer, true);
    let textFurigana = furiganaContainer.textContent;

    // 再次处理：移除翻译内容和所有 rt、rp 标签（去除振假名）
    const plainContainer = cloneContentForText(source);
    removeTranslationDivs(plainContainer);
    plainContainer.querySelectorAll('rt, rp').forEach(tag => tag.remove());
    let originalText = plainContainer.textContent;

    let trimmedText = originalText.trimStart();
    let leadingSpaces = originalText.substring(0, originalText.length - trimmedText.length);

    if (!trimmedText) {
        return { text: '-', textFurigana: '-', space: leadingSpaces, symbolPair: null };
    }

    let finalText = trimmedText.trim();
    textFurigana = textFurigana.trim();
    let hasEnclosingSymbols = normalizedSymbolPairs.some(pair => {
        return finalText.startsWith(pair[0]) && finalText.endsWith(pair[1]);
    });

    let symbolPair = null;
    if (hasEnclosingSymbols) {
        symbolPair = normalizedSymbolPairs.find(pair => {
            return finalText.startsWith(pair[0]) && finalText.endsWith(pair[1]);
        });

        finalText = finalText.substring(symbolPair[0].length, finalText.length - symbolPair[1].length).trim();
        if (textFurigana.startsWith(symbolPair[0]) && textFurigana.endsWith(symbolPair[1])) {
            textFurigana = textFurigana
                .substring(symbolPair[0].length, textFurigana.length - symbolPair[1].length)
                .trim();
        }
    }

    return { text: finalText, textFurigana: textFurigana, space: leadingSpaces, symbolPair: symbolPair };
}

// 显示复制内容函数
function showCopyNotification(text, duration = 1000) {
    copyNotification.textContent = `${text}`;
    copyNotification.classList.add('show');

    // 清除之前的定时器
    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
    }

    // 设置新的定时器
    notificationTimeout = setTimeout(() => {
        copyNotification.classList.remove('show');
    }, duration);
}

// 复制文本到剪贴板
function copyTextToClipboard(text) {
    if (!extensionSettings.copy) return;

    if (document.hasFocus()) {
        const copyPromise = navigator.clipboard?.writeText
            ? navigator.clipboard.writeText(text)
            : fallbackCopyText(text);
        copyPromise.then(() => {
            if (extensionSettings.showCopyContent) {
                showCopyNotification(text);
            }
        }).catch(error => {
            console.warn('[AnonTranslator] Failed to copy text:', error);
        });
    } else {
        console.warn('[AnonTranslator] Document is not focused; copy skipped.');
    }
}

function fallbackCopyText(text) {
    return new Promise((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.documentElement.appendChild(textarea);
        textarea.select();

        try {
            if (document.execCommand('copy')) {
                resolve();
            } else {
                reject(new Error('浏览器拒绝了复制命令'));
            }
        } catch (error) {
            reject(error);
        } finally {
            textarea.remove();
        }
    });
}

// 复制指定文本块
function copyBlockText(tag) {
    const textObj = cleanText(tag, parseStringToArray(extensionSettings.symbolPairs));
    const textToCopy = extensionSettings.ignoreFurigana ? textObj.text : textObj.textFurigana;
    copyTextToClipboard(textToCopy);
}

// 复制指定句子
function copySentenceText(tag) {
    const textObj = cleanText(tag, parseStringToArray(extensionSettings.symbolPairs));
    const textToCopy = extensionSettings.ignoreFurigana ? textObj.text : textObj.textFurigana;
    copyTextToClipboard(textToCopy);
}


/* ------------------------------------------------------------翻译模块 */

// 发送消息到背景脚本并获取翻译结果
function requestTranslation(tag, translationDiv, text, fromLang, toLang, translator, color, callback, model) {
    chrome.runtime.sendMessage({ 
        action: "translate", 
        text: text, 
        from: fromLang, 
        to: toLang, 
        translator: translator,
        model: model
    }, function(response) {
        if (!translationDiv.isConnected || !tag.contains(translationDiv)) {
            return;
        }
        if (chrome.runtime.lastError) {
            renderTranslationError(translationDiv, color, chrome.runtime.lastError.message);
            return;
        }
        if (response?.ok && response.translatedText) {
            const p = document.createElement('div');
            p.style.color = color;
            p.dataset.translationProvider = response.provider || translator;
            if (response.warning) {
                p.title = response.warning;
                console.warn(`[AnonTranslator] ${response.warning}`);
            }
            if (callback) {
                callback(response.translatedText, p, response, translationDiv);
            } else {
                p.textContent = response.translatedText;
            }
            translationDiv.appendChild(p);
        } else {
            renderTranslationError(translationDiv, color, response?.error || '翻译没有返回结果');
        }
    });
}

function renderTranslationError(translationDiv, color, error) {
    const errorDiv = document.createElement('div');
    errorDiv.className = extensionClasses.translationError;
    errorDiv.style.color = color;
    errorDiv.textContent = `翻译失败：${error}`;
    translationDiv.appendChild(errorDiv);
    console.error('[AnonTranslator] Translation failed:', error);
}

function appendAnnotatedText(container, text, annotations) {
    const characters = Array.from(text);
    const safeAnnotations = Array.isArray(annotations) ? annotations : [];
    let cursor = 0;

    safeAnnotations.forEach(annotation => {
        const start = Number(annotation?.start);
        const end = Number(annotation?.end);
        const reading = typeof annotation?.reading === 'string'
            ? annotation.reading
            : '';

        if (
            !Number.isInteger(start) ||
            !Number.isInteger(end) ||
            start < cursor ||
            end <= start ||
            end > characters.length ||
            !reading
        ) {
            return;
        }

        container.appendChild(document.createTextNode(
            characters.slice(cursor, start).join('')
        ));

        const ruby = document.createElement('ruby');
        ruby.className = 'anon-furigana';
        ruby.appendChild(document.createTextNode(
            characters.slice(start, end).join('')
        ));

        const rt = document.createElement('rt');
        rt.textContent = reading;
        ruby.appendChild(rt);
        container.appendChild(ruby);
        cursor = end;
    });

    container.appendChild(document.createTextNode(
        characters.slice(cursor).join('')
    ));
}

function createFuriganaSourceLine(textObj, annotations) {
    const sourceLine = document.createElement('div');
    sourceLine.className = extensionClasses.furiganaSource;

    if (textObj.space) {
        sourceLine.appendChild(document.createTextNode(textObj.space));
    }
    if (textObj.symbolPair) {
        sourceLine.appendChild(document.createTextNode(textObj.symbolPair[0]));
    }

    appendAnnotatedText(sourceLine, textObj.text, annotations);

    if (textObj.symbolPair) {
        sourceLine.appendChild(document.createTextNode(textObj.symbolPair[1]));
    }
    return sourceLine;
}

// 翻译文本并显示结果
function translate(tag) {
    const textObj = cleanText(tag, parseStringToArray(extensionSettings.symbolPairs));
    const existingTranslation = tag.querySelector(`.${extensionClasses.translation}`);

    // 点击失败的段落时允许直接重试，不需要先切换到其他段落。
    if (existingTranslation?.querySelector(`.${extensionClasses.translationError}`)) {
        existingTranslation.remove();
    }

    if (
        (extensionSettings.google || extensionSettings.deepseek) &&
        !tag.querySelector(`.${extensionClasses.translation}`)
    ) {
        const translationDiv = document.createElement('div');
        translationDiv.className = extensionClasses.translation;
        tag.appendChild(translationDiv);

        const translatedTextCallback = (translatedText, p, response, currentTranslationDiv) => {
            if (
                response?.provider === 'deepseek' &&
                !currentTranslationDiv.querySelector(`.${extensionClasses.furiganaSource}`)
            ) {
                const sourceLine = createFuriganaSourceLine(
                    textObj,
                    response.furiganaAnnotations
                );
                if (response.warning) {
                    sourceLine.title = response.warning;
                    console.warn(`[AnonTranslator] ${response.warning}`);
                }
                currentTranslationDiv.insertBefore(sourceLine, currentTranslationDiv.firstChild);
            }

            if (textObj.symbolPair) {
                p.textContent = textObj.space + textObj.symbolPair[0] + translatedText + textObj.symbolPair[1];
            } else {
                p.textContent = textObj.space + translatedText;
            }
        };

        if (extensionSettings.google) {
            requestTranslation(
                tag,
                translationDiv,
                textObj.text,
                extensionSettings.googleFrom,
                extensionSettings.googleTo,
                'google',
                extensionSettings.googleColor,
                translatedTextCallback
            );
        }
        if (extensionSettings.deepseek) {
            requestTranslation(
                tag,
                translationDiv,
                textObj.text,
                extensionSettings.deepseekFrom,
                extensionSettings.deepseekTo,
                'deepseek',
                extensionSettings.deepseekColor,
                translatedTextCallback,
                extensionSettings.deepseekModel
            );
        }
    }
}

/* ------------------------------------------------------------用户界面交互模块 */

// 获取下一个或上一个非空标签
function getValidTag(currentTag, direction = 'down') {
    const root = currentTag.getRootNode();
    if (!root || typeof root.querySelectorAll !== 'function') {
        return null;
    }

    const readableBlocks = Array.from(root.querySelectorAll(readableSelector)).filter(isReadableBlock);
    const currentIndex = readableBlocks.indexOf(currentTag);
    if (currentIndex === -1) {
        return null;
    }

    return direction === 'down'
        ? readableBlocks[currentIndex + 1] || null
        : readableBlocks[currentIndex - 1] || null;
}


// 按标点和长度拆分纯文本，并用 DOM API 创建安全的句子节点。
function createSentenceFragment(text, sentenceThreshold, sentenceDelimiters) {
    const fragment = document.createDocumentFragment();
    const threshold = Number.isFinite(Number(sentenceThreshold)) && Number(sentenceThreshold) > 0
        ? Number(sentenceThreshold)
        : 50;
    const delimiters = new Set(sentenceDelimiters.flatMap(delimiter => Array.from(delimiter)));
    const sentenceParts = [];
    let currentPart = '';

    for (const character of Array.from(text)) {
        currentPart += character;
        if (delimiters.has(character)) {
            sentenceParts.push(currentPart);
            currentPart = '';
        }
    }
    if (currentPart) {
        sentenceParts.push(currentPart);
    }

    const mergedSentences = [];
    let pendingSentence = '';
    for (const sentence of sentenceParts) {
        if (pendingSentence && Array.from(pendingSentence + sentence).length > threshold) {
            mergedSentences.push(pendingSentence);
            pendingSentence = sentence;
        } else {
            pendingSentence += sentence;
        }
    }
    if (pendingSentence || sentenceParts.length === 0) {
        mergedSentences.push(pendingSentence);
    }

    for (const sentence of mergedSentences) {
        const span = document.createElement('span');
        span.className = extensionClasses.sentence;
        span.textContent = sentence;
        fragment.appendChild(span);
    }
    return fragment;
}

function splitTagSentences(tag, sentenceThreshold, sentenceDelimiters) {
    if (!canSafelySplitSentences(tag) || originalBlockContents.has(tag)) {
        return;
    }

    const translationDivs = getDirectTranslationDivs(tag);
    translationDivs.forEach(div => div.remove());

    const originalContent = document.createDocumentFragment();
    const text = tag.textContent || '';
    while (tag.firstChild) {
        originalContent.appendChild(tag.firstChild);
    }
    originalBlockContents.set(tag, originalContent);
    tag.appendChild(createSentenceFragment(text, sentenceThreshold, sentenceDelimiters));
    translationDivs.forEach(div => tag.appendChild(div));
    tag.classList.add(extensionClasses.splitSentences);
    splitBlocks.add(tag);
}

function restoreSentenceSplitting(tag) {
    const originalContent = originalBlockContents.get(tag);
    if (!tag || !originalContent) return;

    const translationDivs = getDirectTranslationDivs(tag);
    tag.replaceChildren();
    tag.appendChild(originalContent);
    translationDivs.forEach(div => tag.appendChild(div));
    tag.classList.remove(extensionClasses.splitSentences);
    originalBlockContents.delete(tag);
    splitBlocks.delete(tag);
}

function restoreImageCursor(image) {
    if (!image || !originalImageCursors.has(image)) return;
    image.style.cursor = originalImageCursors.get(image);
    originalImageCursors.delete(image);
}

function getSafeImageUrl(image) {
    const rawUrl = image.nodeName === 'IMG'
        ? image.currentSrc || image.src
        : image.getAttribute('href') || image.getAttribute('xlink:href');
    if (!rawUrl) return null;

    try {
        const url = new URL(rawUrl, document.baseURI);
        if (['http:', 'https:', 'blob:', 'file:'].includes(url.protocol)) {
            return url.href;
        }
        if (url.protocol === 'data:' && /^data:image\//i.test(url.href)) {
            return url.href;
        }
        return null;
    } catch (_) {
        return null;
    }
}

// 处理点击事件
function handleClick(event) {
    if (!pluginEnabled || event.button !== 0) return;

    const targetElement = findReadableBlockFromEvent(event);
    if (!targetElement) return;

    // 检查目标元素是否包含图片
    if (!targetElement.querySelector('img, svg image')) {
        applyBlueBorder(targetElement, () => {
            copyBlockText(targetElement);
            translate(targetElement);
        });
    }
}

// 为指定标签添加激活框
function applyBlueBorder(tag, callback, options = {}) {
    if (!pluginEnabled || !tag.isConnected) return;

    // 如果有上一个被点击的标签且不是当前标签
    if (lastClickedPtag && lastClickedPtag !== tag) {
        // 只还原句子拆分和激活框；翻译结果保留，方便之后反复查看。
        restoreSentenceSplitting(lastClickedPtag);
        // 移除上一个激活框
        restoreOutline(lastClickedPtag);
    }

    // 检查并分割句子
    if (!tag.classList.contains(extensionClasses.splitSentences)) {
        splitTagSentences(
            tag,
            extensionSettings.sentenceThreshold,
            parseStringToArray(extensionSettings.sentenceDelimiters)
        );
    }

    // 为当前标签应用激活框
    tag.classList.add(extensionClasses.selected);
    lastClickedPtag = tag;
    applyOutline(
        tag,
        extensionSettings.borderWidth,
        extensionSettings.borderStyle,
        extensionSettings.selectedBorderColor,
        extensionSettings.borderRadius
    );
    
    // 鼠标点击时目标已经可见，不改变阅读位置。键盘切换时才做最小必要滚动。
    if (extensionSettings.scrollSwitch && options.scroll) {
        const behavior = ['auto', 'smooth', 'instant'].includes(extensionSettings.scrollIntoView)
            ? extensionSettings.scrollIntoView
            : 'auto';
        tag.scrollIntoView({ behavior, block: 'nearest', inline: 'nearest' });
    }

    if (callback) callback();
}

// 为指定标签添加预选框，并绑定点击事件
function highlightAndCopyPtag(doc) {
    doc.addEventListener('mouseover', (event) => {
        if (!pluginEnabled) return;

        const targetElement = findReadableBlockFromEvent(event);
        if (targetElement === currentHoveredBlock) return;

        if (currentHoveredBlock && currentHoveredBlock !== lastClickedPtag) {
            restoreOutline(currentHoveredBlock);
        }
        currentHoveredBlock = targetElement;

        if (
            targetElement &&
            targetElement !== lastClickedPtag &&
            !targetElement.classList.contains(extensionClasses.hovered)
        ) {
            targetElement.classList.add(extensionClasses.hovered);
            applyOutline(
                targetElement,
                extensionSettings.borderWidth,
                extensionSettings.borderStyle,
                extensionSettings.freeBorderColor,
                extensionSettings.borderRadius
            );
        }
    }, true);

    doc.addEventListener('mouseout', (event) => {
        if (!pluginEnabled) return;

        const fromElement = findReadableBlockFromEvent(event);
        const toElement = findReadableBlockFromNode(event.relatedTarget);

        if (
            fromElement &&
            fromElement === currentHoveredBlock &&
            toElement !== fromElement
        ) {
            if (fromElement !== lastClickedPtag) {
                restoreOutline(fromElement);
            }
            currentHoveredBlock = toElement;
        }
    }, true);

    doc.addEventListener('click', handleClick, true);
}

// 为文档添加鼠标和键盘监听器
function addMouseListener(doc) {
    if (!doc || initializedDocuments.has(doc)) return;
    initializedDocuments.add(doc);

    highlightAndCopyPtag(doc);

    // 键盘事件，包括箭头键和数字键盘 0
    doc.addEventListener('keydown', function(event) {
        if (!pluginEnabled) return;

        const eventTarget = event.target instanceof Element ? event.target : null;
        if (
            !lastClickedPtag ||
            eventTarget?.closest('input,textarea,select,[contenteditable="true"]')
        ) {
            return;
        }

        const isNext = event.key === 'ArrowDown' || event.code === 'Numpad1';
        const isPrevious = event.key === 'ArrowUp' || event.code === 'Numpad2';
        if (isNext || isPrevious) {
            const newTag = getValidTag(lastClickedPtag, isNext ? 'down' : 'up');
            if (newTag) {
                event.preventDefault();
                applyBlueBorder(newTag, () => {
                    copyBlockText(newTag);
                    translate(newTag);
                }, { scroll: true });
            }
            return;
        }

        if (
            event.key === 'F1' ||
            event.code === 'Numpad0'
        ) {
            event.preventDefault();
            copyBlockText(lastClickedPtag);
        }
    });

    // 仅在扩展生成的句子上接管右键，用于复制当前句子。
    doc.addEventListener('contextmenu', function(event) {
        if (!pluginEnabled) return;

        const targetElement = event.target instanceof Element ? event.target : null;
        const sentence = targetElement?.closest(`.${extensionClasses.sentence}`);
        if (sentence && lastClickedPtag?.contains(sentence)) {
            event.preventDefault();
            copySentenceText(sentence);
        }
    });

    doc.addEventListener('mouseover', (event) => {
        if (!pluginEnabled) return;

        const targetElement = event.target instanceof Element ? event.target : null;
        const sentence = targetElement?.closest(`.${extensionClasses.sentence}`);
        if (sentence) {
            sentence.style.backgroundColor = extensionSettings.sentenceColor;
        }

        // 图片本身也能被识别；鼠标离开后恢复网页原有 cursor。
        const image = targetElement?.closest('img, svg image');
        if (extensionSettings.extraImage && image && !image.closest('a')) {
            if (!originalImageCursors.has(image)) {
                originalImageCursors.set(image, image.style.cursor);
            }
            image.style.cursor = 'pointer';
            currentHoveredImage = image;
        }
    });

    doc.addEventListener('mouseout', (event) => {
        if (!pluginEnabled) return;

        const targetElement = event.target instanceof Element ? event.target : null;
        const sentence = targetElement?.closest(`.${extensionClasses.sentence}`);
        if (sentence && !sentence.contains(event.relatedTarget)) {
            sentence.style.backgroundColor = '';
        }

        const image = targetElement?.closest('img, svg image');
        if (image && !image.contains(event.relatedTarget)) {
            restoreImageCursor(image);
            if (currentHoveredImage === image) {
                currentHoveredImage = null;
            }
        }
    });

    doc.addEventListener('click', (event) => {
        if (!pluginEnabled || !extensionSettings.extraImage) return;

        const targetElement = event.target instanceof Element ? event.target : null;
        const image = targetElement?.closest('img, svg image');
        if (!image || image.closest('a')) return;

        const url = getSafeImageUrl(image);
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    });
}

})();
