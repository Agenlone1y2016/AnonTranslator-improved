# AnonTranslator Improved

![AnonTranslator icon](img/icon128.png)

基于 [raindrop213/AnonTranslator](https://github.com/raindrop213/AnonTranslator) 的改进版 Chrome 扩展。它面向日文网页小说、生肉阅读和本地 HTML/EPUB 阅读场景，可以识别网页中的正文段落，复制原文，并使用 Google 或 DeepSeek 翻译。

这个版本重点改进了 DeepSeek 翻译、日语假名标注、段落识别和阅读时的交互体验。

![Preview](img/preview.gif)

## 功能亮点

- 支持 Google 翻译和 DeepSeek API 翻译。
- DeepSeek 首次翻译时同时返回译文和词语级假名标注，使用真实 `<ruby><rt>` 渲染。
- 假名标注显示在翻译区域中的原文行里，不改写网页原始正文。
- 改进正文段落识别，适配更多小说站点和本地阅读页面。
- 点击段落不会强制滚动居中，阅读位置更稳定。
- 切换段落时保留之前的翻译结果，方便反复回看。
- DeepSeek API Key 只保存在 `chrome.storage.local`，不会通过 Chrome Sync 同步。

## 安装

1. 打开本仓库页面：[Agenlone1y2016/AnonTranslator-improved](https://github.com/Agenlone1y2016/AnonTranslator-improved)。
2. 点击 `Code`，选择 `Download ZIP`，解压到本地。
3. 打开 Chrome 的扩展程序页面：`chrome://extensions/`。
4. 打开右上角的 `开发者模式`。
5. 点击 `加载已解压的扩展程序`，选择解压后的项目文件夹。

也可以使用 Git：

```bash
git clone https://github.com/Agenlone1y2016/AnonTranslator-improved.git
```

然后在 Chrome 中加载克隆出来的文件夹。

## DeepSeek 配置

1. 在 [DeepSeek Platform](https://platform.deepseek.com/) 创建 API Key。
2. 打开扩展设置中的 `Translator > DeepSeek`。
3. 填写 API Key，选择模型并保存。

当前支持的模型：

- `deepseek-v4-flash`
- `deepseek-v4-pro`

## 使用方式

1. 左键点击段落：复制并翻译当前文本段落。
2. 右键点击段落：复制高亮句子。
3. 按 <kbd>Num 0</kbd> 或 <kbd>F1</kbd>：重新复制当前文本段落。
4. 按 <kbd>↑</kbd>/<kbd>↓</kbd>：切换段落，并复制、翻译；备用键位为 <kbd>Num 2</kbd>/<kbd>Num 1</kbd>。
5. 启用 DeepSeek 时，翻译区域会额外显示带假名标注的原文行。

通过剪贴板还可以搭配 [LunaTranslator](https://github.com/HIllya51/LunaTranslator) 做多方翻译、语素分析、查词和 Anki 工作流。

## 适合场景

- 在线小说站点，例如 [小説家になろう](https://syosetu.com/)、[カクヨム](https://kakuyomu.jp/)。
- 本地 HTML/EPUB 阅读页面。
- 自建书库，例如 Calibre-web。
- 其他以正文段落为主的日文阅读网页。

如果 Chrome 扩展权限被设置成“在特定网站上”，部分页面可能无法正常翻译。更稳定的方式是在 Chrome 中允许扩展“在所有网站上”运行，或者按需修改 `manifest.json` 中的 `matches`。

例如：

```json
"matches": [
  "http://localhost:8083/*",
  "http://127.0.0.1:8083/*",
  "https://kakuyomu.jp/*",
  "https://*.syosetu.com/*",
  "https://reader.ttsu.app/*"
]
```

## 开发与测试

本项目没有运行时 npm 依赖。需要 Node.js 20 或更高版本。

```bash
npm test
```

测试会检查：

- `manifest.json` 引用的文件是否存在；
- popup 设置项和默认配置是否一致；
- DeepSeek 模型配置是否同步；
- 翻译切换时是否保留旧段落结果；
- Google/DeepSeek 翻译核心逻辑和错误处理。

## 授权与来源

本项目基于原版 AnonTranslator 修改，保留 MIT License。感谢原作者 [raindrop213](https://github.com/raindrop213) 的开源工作。

原版 Chrome 商店页面：[AnonTranslator](https://chromewebstore.google.com/detail/anontranslator/echegehpmakkcfcadfjljpcallkhpldi)

---

![Screenshot](img/img1.png)
