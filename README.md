# AnonTranslator II

![AnonTranslator II icon](img/icon128.png)

[中文](#中文) | [English](#english)

![Preview](img/translation-preview.png)

## 中文

基于 [raindrop213/AnonTranslator](https://github.com/raindrop213/AnonTranslator) 的二代改进版 Chrome 扩展。它面向日文网页小说、生肉阅读和本地 HTML/EPUB 阅读场景，可以识别网页中的正文段落，复制原文，并使用 Google 或 DeepSeek 翻译。

这个版本改进了 DeepSeek 翻译、日语假名标注、段落识别、翻译缓存和阅读时的交互体验。

### 功能亮点

- 面向日文网页小说、本地 HTML/EPUB 和自建书库阅读场景。
- 支持 Google 翻译和 DeepSeek API 翻译。
- DeepSeek 翻译可同时生成中文译文和日语假名标注。
- 使用 ruby 假名标注辅助阅读，不改写网页原始正文。
- 支持本地缓存翻译结果，刷新页面后可复用已有译文。
- DeepSeek API Key 只保存在 `chrome.storage.local`，不会通过 Chrome Sync 同步。

### 安装

1. 打开本仓库页面：[Agenlone1y2016/AnonTranslator-II](https://github.com/Agenlone1y2016/AnonTranslator-II)。
2. 点击 `Code`，选择 `Download ZIP`，解压到本地。
3. 打开 Chrome 的扩展程序页面：`chrome://extensions/`。
4. 打开右上角的 `开发者模式`。
5. 点击 `加载已解压的扩展程序`，选择解压后的项目文件夹。

也可以使用 Git：

```bash
git clone https://github.com/Agenlone1y2016/AnonTranslator-II.git
```

然后在 Chrome 中加载克隆出来的文件夹。

### DeepSeek 配置

1. 在 [DeepSeek Platform](https://platform.deepseek.com/) 创建 API Key。
2. 打开扩展设置中的 `Translator > DeepSeek`。
3. 填写 API Key，选择模型并保存。

当前支持的模型：

- `deepseek-v4-flash`
- `deepseek-v4-pro`

### 使用方式

1. 左键点击段落：复制并翻译当前文本段落。
2. 点击翻译结果旁的小三角：展开或收起该段的假名标注和译文。
3. 右键点击段落：复制高亮句子。
4. 启用 DeepSeek 时，翻译区域会额外显示带假名标注的原文行。
5. 在 `Translator` 中启用 `Cache Translation` 并选择 `Cache Duration`，刷新页面后可复用之前的翻译结果；`Clear Cache` 按钮可随时清除本机已保存的译文。

### 适合场景

- 在线小说站点，例如 [小説家になろう](https://syosetu.com/)、[カクヨム](https://kakuyomu.jp/)。
- 本地 HTML/EPUB 阅读页面。
- 自建书库，例如 Calibre-web。
- 其他以正文段落为主的日文阅读网页。

### 开发与测试

普通用户安装和使用扩展不需要 npm 或 Node.js。只有开发者运行测试时需要 Node.js 20 或更高版本。

```bash
npm install
npm test
```

测试会检查：

- `manifest.json` 引用的文件是否存在，扩展与 npm 包版本号是否一致；
- popup 设置项和默认配置是否一致，DeepSeek 模型配置是否同步；
- content 脚本在模拟浏览器（jsdom）中的真实行为：段落识别、翻译渲染与折叠、引号剥离、句子拆分与还原、翻译缓存的写入/命中/旧版清理、扩展重载后的降级提示；
- Google/DeepSeek 翻译核心逻辑和错误处理。

### 授权与来源

本项目基于原版 AnonTranslator 修改，保留 MIT License。

---

## English

AnonTranslator II is a second-generation modified Chrome extension based on [raindrop213/AnonTranslator](https://github.com/raindrop213/AnonTranslator). It is built for reading Japanese web novels, raw Japanese text, and local HTML/EPUB reading pages. The extension can detect readable text blocks on a page, copy the original text, and translate it with Google or DeepSeek.

This version focuses on DeepSeek translation, Japanese furigana rendering, paragraph detection, translation caching, and a smoother reading flow.

### Highlights

- Built for Japanese web novels, local HTML/EPUB pages, and self-hosted reading libraries.
- Supports Google Translate and DeepSeek API translation.
- DeepSeek translation can return both Chinese translations and Japanese furigana annotations.
- Uses ruby-based furigana to support reading without rewriting the original page content.
- Caches translation results locally so previous translations can be reused after refreshing.
- The DeepSeek API key is stored only in `chrome.storage.local` and is not synced through Chrome Sync.

### Installation

1. Open this repository: [Agenlone1y2016/AnonTranslator-II](https://github.com/Agenlone1y2016/AnonTranslator-II).
2. Click `Code`, choose `Download ZIP`, and unzip the archive.
3. Open Chrome's extensions page: `chrome://extensions/`.
4. Enable `Developer mode`.
5. Click `Load unpacked` and select the unzipped project folder.

You can also clone the repository:

```bash
git clone https://github.com/Agenlone1y2016/AnonTranslator-II.git
```

Then load the cloned folder from Chrome's extensions page.

### DeepSeek Setup

1. Create an API key on [DeepSeek Platform](https://platform.deepseek.com/).
2. Open the extension settings and go to `Translator > DeepSeek`.
3. Enter your API key, choose a model, and save.

Supported models:

- `deepseek-v4-flash`
- `deepseek-v4-pro`

### Usage

1. Left-click a paragraph to copy and translate it.
2. Click the small triangle beside a translation to collapse or expand that paragraph's result.
3. Right-click a paragraph to copy the highlighted sentence.
4. When DeepSeek is enabled, the translation area also shows the original Japanese line with furigana annotations.
5. In `Translator`, enable `Cache Translation` and choose `Cache Duration` to reuse previous results after refreshing a page; the `Clear Cache` button removes all locally stored translations at any time.

### Recommended Use Cases

- Japanese web novel sites such as [小説家になろう](https://syosetu.com/) and [カクヨム](https://kakuyomu.jp/).
- Local HTML/EPUB reading pages.
- Self-hosted libraries such as Calibre-web.
- Other Japanese reading pages that are mainly organized as text paragraphs.

### Development and Testing

Users do not need npm or Node.js to install and use the extension. Node.js 20 or newer is only required for developers who want to run the tests.

```bash
npm install
npm test
```

The tests check:

- whether every file referenced by `manifest.json` exists and the extension version matches the npm package version;
- whether popup settings match the default settings and DeepSeek model options stay in sync;
- real content-script behavior in a simulated browser DOM (jsdom): paragraph detection, translation rendering and collapsing, quote stripping, sentence splitting and restoration, translation cache write/hit/legacy cleanup, and graceful degradation after the extension is reloaded;
- Google and DeepSeek translation core logic and error handling.

### License and Credits

This project is modified from the original AnonTranslator and keeps the MIT License.

---

![Screenshot](img/img1.png)
