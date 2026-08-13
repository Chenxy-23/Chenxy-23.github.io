# Chenxy-23.github.io

我的个人主页与作品集，基于 GitHub Pages 搭建。

🔗 在线访问：<https://chenxy-23.github.io/>

## 页面结构

首页包含四个区块，方便访客一眼看到重点：

1. **Hero 首屏** — 姓名、简介、一键跳转按钮和社交媒体入口
2. **作品集（Projects）** — 图文卡片，展示项目截图、简介与技术标签
3. **视频作品（Videos）** — 支持嵌入 B 站 / YouTube，或本地 mp4
4. **博客（Blog）** — 文章列表
5. **社交媒体 / 联系我（Contact）** — GitHub、Bilibili、微博、邮箱等

```text
.
├── index.html        # 首页
├── style.css         # 样式
├── favicon.svg       # 站点图标
├── posts/            # 博客文章
│   └── hello-world.html
└── assets/           # （可选）作品图片、视频等素材
```

## 如何替换成自己的内容

### 项目图文

编辑 `index.html` 中 `作品集` 一节的每个卡片：

- 封面图：取消注释卡片里的 `<img>` 行，把 `src` 改成你的图片路径（推荐放到 `assets/` 目录）
- 标题与简介：直接改 `<h3>` 和 `<p>` 的文本
- 标签：修改 `<div class="tags">` 里的 `<span>`
- 链接：修改 `work-link` 的 `href`

### 视频

`视频作品` 一节每个卡片里都有注释好的三种方式，任选其一替换占位块：

```html
<!-- B 站嵌入 -->
<iframe class="video-embed" src="https://player.bilibili.com/player.html?bvid=BV1xxxxxxxxx" allowfullscreen></iframe>

<!-- YouTube 嵌入 -->
<iframe class="video-embed" src="https://www.youtube.com/embed/视频ID" allowfullscreen></iframe>

<!-- 本地视频 -->
<video class="video-embed" src="videos/demo.mp4" controls></video>
```

### 社交媒体

在 `社交媒体 / 联系我` 区块和 Hero 首屏里，把每个卡片的 `href` 替换成你的主页链接，
`contact-value` 换成账号名即可。不需要的平台直接删掉对应卡片。

## 本地预览

直接用浏览器打开 `index.html`，或运行：

```bash
python -m http.server 8000
```

然后访问 <http://localhost:8000>。

## 发布说明

用户站点仓库（`username.github.io`）的根目录会被 GitHub Pages 自动发布到
<https://chenxy-23.github.io>，推送代码后通常一两分钟即可生效。
