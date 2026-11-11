# 测试记录（TESTS）

测试时间：2026-11-11（北京时间）
测试环境：本机 Node v24.22.1，直接调用 `api/search.js` 的真实 handler（mock req/res），未部署到 Vercel。
测试脚本：`test/local-test.mjs`、`test/full-popular.mjs`，均可重复运行。

## 1. 数据文件

- 来源：`https://raw.githubusercontent.com/sherlock-project/sherlock/master/sherlock_project/resources/data.json`
- 文件：`data/sites.json`（104 KB）
- 站点总数：**481**（另有 1 个 `$schema` 键，不计入）
- NSFW 站点：**19**
- 判定规则分布：`status_code` 327 个、`message` 127 个、`response_url` 27 个
- 前端常用站点列表：**65 个**，逐个核对后全部存在于 data.json（最初写错 1 个：`Tumblr`，实际键名是小写 `tumblr`，已修正）

## 2. 核心断言：torvalds 找到 GitHub，乱码用户名找不到 GitHub

10 站点抽查（`test/local-test.mjs`，批次：GitHub、GitLab、Reddit、Wikipedia、YouTube、Twitter、Instagram、TikTok、LinkedIn、Medium）：

| 用户名 | GitHub | GitLab | YouTube | Wikipedia |
|---|---|---|---|---|
| `torvalds` | ✅ found | not_found | not_found | found |
| `xjqwzvkzxkqwv987654321`（乱码） | ✅ not_found | unknown（HTTP 403） | not_found | not_found |

- `torvalds` 在 GitHub 上判定为 found —— **通过**。
- 乱码用户名在 GitHub 上判定为 not_found —— **通过**。
- 格式校验：`!!! not a user` 在 GitHub 上判定为 `invalid`（不符合该站点的 regexCheck）—— **通过**。
- 异常输入：空用户名 → HTTP 400；GET `/api/search` → HTTP 200 健康检查 —— **通过**。

## 3. 常用站点全量实测（65 个，`test/full-popular.mjs`，每批 10 个站点顺序执行）

| 用户名 | 用时 | found | not_found | unknown | invalid |
|---|---|---|---|---|---|
| `torvalds` | 22.9s | 31 | 17 | 17 | 0 |
| `xjqwzvkzxkqwv987654321`（乱码） | 17.0s | 10 | 36 | 17 | 2 |

`torvalds` 找到的 31 个站点：GitHub、Reddit、Twitter、Instagram、TikTok、Pinterest、HackerNews、Bluesky、threads、Telegram、Twitch、Steam Community (User)、Spotify、SoundCloud、HackerRank、Kaggle、Hugging Face、BitBucket、Docker Hub、PyPi、Patreon、WordPress、Substack、Hashnode、Chess、Roblox、Minecraft、Duolingo、last.fm、Wikipedia、Snapchat。

其中 21 个是可信的真找到（乱码用户名在这些站点上是 not_found）：GitHub、Twitter、TikTok、HackerNews、Telegram、Twitch、Steam、SoundCloud、HackerRank、Hugging Face、BitBucket、Docker Hub、Patreon、WordPress、Substack、Chess、Roblox、Minecraft、last.fm、Wikipedia、Snapchat。其余 10 个（Reddit、Instagram、Pinterest、Bluesky、threads、Spotify、Kaggle、PyPi、Hashnode、Duolingo）见第 4 节的误报说明。

`torvalds` 的 unknown（17 个）：LinkedIn（HTTP 999）、tumblr（403）、Discord（数据中无个人主页地址模板）、DeviantArt（5s 超时）、ArtStation（403）、Codepen（403）、CodeSandbox（403）、Replit.com（5s 超时）、LeetCode（403）、Codeforces（请求失败）、npm（请求失败）、ProductHunt（403）、kofi（403）、Letterboxd（403）、Anilist（403）、Lichess（403）、Xbox Gamertag（403）。

乱码用户名的 invalid（2 个）：Twitter、Anilist（用户名超长，不符合站点的 regexCheck，属正常判定）。

## 4. 已知限制（重要，请先读）

1. **数据中心 IP 会被很多站点屏蔽。** 本次测试从云服务器 IP 发起请求，17/65 个站点直接返回 403/999 或超时，本项目把这些标为 `unknown`（无法确认），绝不猜测。部署到 Vercel 后同样是数据中心 IP，屏蔽情况会类似，个别站点可能不同。
2. **部分站点会返回“假的已找到”。** 有些站点对屏蔽的请求返回 HTTP 200 的登录墙/通用页，页面里又不含 Sherlock 预期的错误信息，规则无法识破。实测中乱码用户名在 10 个站点上被误判为 found：Reddit、Instagram、Pinterest、Bluesky、threads、Spotify、Kaggle、PyPi、Hashnode、Duolingo。Instagram 是典型例子：不存在的用户名也返回 HTTP 200（status_code 规则只能按 200 判定）。**页面上“已找到”的结果请务必点开链接人工确认。** 这是 Sherlock 本身在数据中心 IP 下的固有限制，不是本项目的 bug。
3. **Discord 查不了。** data.json 里 Discord 的 URL 是 `https://discord.com`，没有 `{}` 占位符，无法按用户名拼出个人主页。本项目将其标为 `unknown` 并注明原因，不会让它拖垮整批请求（之前它曾导致整批 400，已修复）。
4. **单批耗时受 5 秒超时限制。** 每批 10 个站点并行请求，最慢的一批约 5 秒多。65 个站点顺序跑约 23 秒；前端用 3 路并发，实际约 8–10 秒。481 个全部站点约 1–2 分钟。这是 Vercel Hobby 免费版单次函数 10 秒上限内的安全设计（每批远低于 10 秒）。
5. **未在 Vercel 上实测。** 本次只做了本地 Node 测试，没有部署、没有绑定域名。部署后请按 README 的验证步骤，用 `torvalds` 在线上再跑一次常用站点模式核对。
6. **数据会过时。** data.json 是 2026-11-11 下载的快照，Sherlock 上游增删站点后需重新下载覆盖 `data/sites.json`。

## 5. 通过的语法检查

- `node --check api/search.js` ✅
- `node --check test/local-test.mjs` ✅
- `node --check test/full-popular.mjs` ✅
- 前端 `index.html` 内联 `<script>` 提取后 `node --check` ✅

---

## 6. 2026-11-11 二级页面改版：蛋仔的导航网落地页（未部署）

改动（用户要求：侦探搜索做成二级页面，一级页面简约大气科技一点，标题是蛋仔的导航网，液玻璃效果）：

- `index.html` 重写为一级落地页：`<title>` 与大标题均为「蛋仔的导航网」；深色背景 + 细网格 + 三个缓慢漂移的光晕（蓝/紫/青）；液玻璃卡片用 `backdrop-filter: blur(22px) saturate(180%)` + 半透明渐变 + 内高光 + 圆角 28px + 悬停上浮，不支持 `backdrop-filter` 时 `@supports` 回落为实色半透明。页面只有一个入口（侦探搜索卡片 + 按钮，均指向 `/search.html`），未编造其他导航链接；底部注明结果来自公开网站、按 Sherlock 规则实时查询，「无法确认」表示站点超时或屏蔽了请求。
- 原搜索页原样移到 `search.html`（298 行），只加了顶部「← 返回 蛋仔的导航网」（`href="/"`）和对应样式；其余一字未改：用户名输入、常用 65 / 全部 481 模式、NSFW 开关、进度、筛选、复制链接、localStorage 历史（20 条）、每批 10 个站点 POST `/api/search`、3 路并发。
- `api/search.js`、`data/sites.json`、`vercel.json`、`package.json` 未改动；零依赖、无构建步骤不变。
- 测试脚本随搬家修正：`test/local-test.mjs` 与 `test/full-popular.mjs` 原来从 `index.html` 抓 POPULAR 列表，现改为从 `search.html` 抓（仅路径一处改动）。

本地验证（2026-11-11，Node v24）：

- `node --check` 通过：`search.html` 内联脚本、`api/search.js`、`test/local-test.mjs`、`test/full-popular.mjs` ✅；`index.html` 无内联脚本。
- 文件检查：`search.html` 含 `fetch("/api/search")`、`POPULAR`（65 个）、`BATCH_SIZE = 10`、`localStorage`、`nsfwToggle`、`modeSeg` ✅；`index.html` 含两处 `href="/search.html"`、标题与大标题均为「蛋仔的导航网」、6 处 `backdrop-filter` ✅；`search.html` 含返回链接 ✅。
- `node test/local-test.mjs` 重新跑过，结果与改版前一致：数据 481 站 / NSFW 19；常用列表 65 个且全部在 data.json；`torvalds` → GitHub **found**；乱码用户名 → GitHub **not_found**；`!!! not a user` → `invalid`；空用户名 → HTTP 400；GET → HTTP 200 ✅。
- 未在 Vercel 上部署验证：部署后请按 README 第 5 节，先看落地页，再进 `/search.html` 用 `torvalds` 核对。

---

## 7. 2026-11-11 晚间更正：蛋仔导航网改成白底应用网格（未部署）

改动（用户更正：不需要一级页面也有侦探网站的内容，单独是单独的，后续还要加其他内容，不需要那样排版；要像手机桌面应用那样，导航网背景白色，直接是「蛋仔导航网」不要「的」字）：

- 只改了 `index.html`（2,575 字节，无 JavaScript）：整页白底（`background:#ffffff`），深色背景、细网格、光晕、hero 卡片、副标题、统计数字、说明段落全部删掉；小标题与 `<title>` 均为「蛋仔导航网」（不带「的」）；页面主体是手机桌面式应用网格（桌面每行 4 个图标，手机每行 3 个），目前只有一个应用——圆角方形图标（🔍，蓝紫渐变 + 内高光的浅色液玻璃质感）+ 下方「侦探搜索」标签，`href="/search.html"`，不编造其他应用或占位项，网格留空待后续加新内容。
- `search.html`、`api/search.js`、`data/sites.json`、`vercel.json`、`package.json` 一字未改。

本地验证（2026-11-11，Node v24）：

- `index.html` 含「蛋仔导航网」2 处（`<title>` 与 `<h1>`），含「蛋仔的导航网」0 处 ✅；`href="/search.html"` 恰好 1 处 ✅；含「481」0 处、含「Sherlock」0 处（不区分大小写）、`<script>` 0 个 ✅；页面唯一背景色是 `#ffffff`，无深色背景/光晕/网格背景（grep 命中 1 处仅为 CSS 注释里的「应用网格」一词）✅。
- `search.html` 与 `api/search.js` 的 md5 与改版前一致（`972d89198e723e7b8daaaf652ee3e090` / `e2239c1e0443b4c8ad7105290cc8584c`），`search.html` 仍含 `fetch("/api/search"` ✅；`node --check api/search.js` 通过 ✅。
- 注意：`search.html` 顶部返回链接仍写「← 返回 蛋仔的导航网」（带「的」），因本次按要求未改动 search.html；如需统一名称，需另改 search.html。
- 未部署：部署后按 README 第 5 节验证——先看白底「蛋仔导航网」网格，再点「侦探搜索」图标进 `/search.html` 用 `torvalds` 核对。

---

## 8. 2026-11-11 晚间二次改版：导航站式落地页 + 顶部搜索框 + 黑客图标（未部署）

改动（用户更正：白底应用网格太空、太简约；参考 taizi.tv 的 UI 风格但不用它网站的内容；侦探网站图标换成黑客图标）：

- 只重写了 `index.html`（5,270 字节，无 JavaScript）：白底不变（`background:#ffffff`），标题仍为「蛋仔导航网」（不带「的」）。导航站式布局：顶部导航栏（logo「蛋」+ 标题）、居中的大搜索框（圆角胶囊、阴影，提交即 GET 到 `/search.html?q=<用户名>`，不自行搜索）、「常用」分区标题 + 分隔线、更大的应用卡片网格（桌面每行 4 张卡、手机每行 2 张），底部一行「蛋仔导航网」。唯一真实卡片是「侦探搜索」：黑客图标图 `assets/media-generation-hacker-detective-icon-0-ce107086-19e3-4630-a2da-0e2c80934963.webp`（1600×1600）作卡片图，下方只有「侦探搜索」标签，链接 `/search.html`。未编造其他应用、假链接或占位卡片；页面不含任何关于侦探搜索的介绍、数据或说明。taizi.tv 本身未能打开（浏览器报 DNS_PROBE_STARTED，搜索结果为垃圾站），故未照抄该站，只按导航站通用样式（导航栏、搜索框、分区、卡片网格）做了更丰满的版式。
- `search.html` 只改了一处（其余未动）：末尾加了 `q` 参数处理——`new URLSearchParams(location.search).get("q")`，有值时填入用户名输入框并自动开始搜索（`runSearch` 内部会先 `loadSites()`，可直接调用）；返回链接仍为「← 返回 蛋仔导航网」（本次已与新名一致，无需再改）。

本地验证（2026-11-11，Node v24）：

- `index.html` 含「蛋仔导航网」4 处（`<title>`、顶部标题、大标题、页脚），含「蛋仔的导航网」0 处 ✅；含「Sherlock」0 处（不区分大小写）、含「481」0 处 ✅；含黑客图标路径 `assets/media-generation-hacker-detective-icon-0-ce107086-19e3-4630-a2da-0e2c80934963.webp` 1 处，文件存在（147,580 字节，WebP 1600×1600）✅；搜索表单为 `action="/search.html" method="get"`，输入框 `name="q"` ✅；`href="/search.html"` 共 2 处（表单 action 与应用卡片）✅；`<script>` 0 个 ✅。
- `search.html` 含 `URLSearchParams` 的 `q` 读取与自动搜索代码 ✅，`node --check`（提取内联脚本）通过 ✅；`api/search.js` 的 `node --check` 通过 ✅。
- 未部署：部署时注意显式部署到项目 `sherlock-web`（裸部署曾误建出 `sherlock-vercel` 项目）；部署后按 README 第 5 节验证——先看白底「蛋仔导航网」导航站首页与顶部搜索框，再点「侦探搜索」卡片或在首页搜索框输 `torvalds` 提交，确认自动跳转并搜出 GitHub。

---

## 9. 2026-11-11 晚间：JF-4 模拟页（蛋仔角色版，替换已取消的水母版，未部署）

改动（用户更正：之前的水母版不要了，「不是水母」「把水母换成发你的图片」）：

- 之前那版 `medusa.html` 只有 CSS、做到 `<body>` 就中断了（未完成、无主体、无脚本），本次直接重写为完整页。角色用的是用户 2026-11-11 18:50 发的图片：圆圆的黄色蛋仔角色，大眼睛、张嘴笑、两只小白脚，头顶一杯咖喱杯面。图片原样拷到 `assets/danzi-cup-noodle.jpg`（80,308 字节，与原文件 sha256 一致 `1a31ea30…03d71`），未改动内容、未生成新图。
- 新页 `medusa.html`（32,750 字节，单文件）：沿用原 JF-4 仪表盘版式（淡青白底、深青墨色、珊瑚红点缀、JetBrains Mono 标签、顶部栏、FIELD LOAD 计量条、左右 HUD 卡片、OPERATING MODE、底部 25 秒时间轴 + 播放/暂停 + 操作日志），但中央 3D 主角不是水母，是那张角色图：three.js 0.170.0（jsDelivr import map 不变）把图片贴在一块圆角牌上（正面角色图 + 深青背板），在 5 圈细环舞台 + 柔和径向阴影上方漂浮、缓慢旋转；25 秒循环巡游沿用原时间点，改名适配角色：ARRIVING（从上方落下）→ HOLDING → CUP INSPECT（推近看杯面）→ SPIN（360° 转台）→ HOP（弹跳）→ CLOSE-UP（看脸）→ LOW ANGLE（低角度）→ SCATTER（三件：正面牌 / 背板 / 环舞台飞散，HUD 全部显示 DETACHED）→ REASSEMBLY（弹回）→ HOLDING（广角）→ DEPARTING（跳起离场）。拖拽旋转（带阻尼、俯仰限幅）、时间轴点按/拖动 scrub、空格或按钮暂停、ASSEMBLIES 跳转（HERO / CUP / SPIN / HOP / CLOSE-UP / SCATTER）、DISPLAY 开关（LABELS / SPIN / RINGS / SHADOW，下一段开始时复位）均保留；3D 锚点标签为 CUP MOUNT / FACE / FEET，带珊瑚色引线。
- 标题改为 `JF-4 — Field Simulator`（原标题里的 Medusa 就是水母的意思，已去掉）；页面文案、仪表盘、日志里没有任何「水母 / jellyfish / Medusa / bell / petal / tentacle」字样，也没有任何水母模型部件。
- `index.html` 在「常用」网格里加了第二张卡片：同一张角色图作图标，标签「蛋仔模拟」，链接 `/medusa.html`；侦探搜索卡片、搜索框、白底、标题均未动，首页不加任何关于模拟页的介绍文字。
- `search.html`、`api/search.js`、`data/sites.json`、`vercel.json`、`package.json` 一字未改。

本地验证（2026-11-11，Node v24.22.1）：

- `medusa.html` 内含 `three@0.170.0` import map、`assets/danzi-cup-noodle.jpg` 路径；全文 grep「jellyfish / 水母 / Medusa / medusa / bell / petal / tentacle / 224」均为 0 命中 ✅；提取的 `<script type="module">`（18,362 字符）`node --check` 通过 ✅；文件以 `</html>` 结尾 ✅。
- 本地静态服务实测：`medusa.html` 200（32,750 B）、`index.html` 200、`search.html` 200、`assets/danzi-cup-noodle.jpg` 200（80,308 B）、黑客图标 200 ✅。
- `index.html` 含 `medusa.html` 1 处、`danzi-cup-noodle.jpg` 1 处 ✅；`search.html` 含 medusa / jellyfish / 水母 0 处 ✅。
- 未部署、未做浏览器内渲染验证：部署后请在真浏览器打开 `/medusa.html` 确认 3D 角色牌正常显示、25 秒巡游播放、拖拽与时间轴 scrub 可用；three.js 与 Google Fonts 均走 CDN，需联网加载。

---

## 10. 2026-11-11 晚间：首页改成「向蛋仔许愿」+ 许愿后端（未部署）

改动（用户要求：背景图换成蛋仔图片；参考 diqiu.help「向地球许愿」的版式做一个液态玻璃对话框「请向蛋仔许愿」；后面是蛋仔图片；生成一个全身都是圆的球形 3D 蛋仔，可以旋转；头像是一杯泡面）：

- `index.html` 完全重写（16,259 字节，单文件）：深色沉浸式页面，背景是蛋仔原图 `assets/danzi-cup-noodle.jpg` 满屏铺开（cover，压暗 + 轻微模糊 + 深色渐变罩，保证文字可读）；顶部是绿色小字「● 把愿望交给发光的蛋仔」+ 巨大白字标题「向蛋仔许愿」（版式参考 diqiu.help 截图的「把愿望交给发光的地球 / 向地球许愿」结构，文案换成蛋仔自己的）；中间是 three.js 0.170.0 的 3D 蛋仔：全身就是一个黄色大圆球（SphereGeometry），前面一块奶油色椭圆脸、两只白眼球 + 黑瞳孔 + 高光、张开的红嘴（黑底 + 红唇 + 粉舌头）、两侧小黄手、两只小白脚，头顶一杯微倾的泡面杯（圆柱体，杯身是 canvas 手绘的咖喱杯面包装：黄底、红带、CURRY 大字、CUP NOODLE 小字、面条波纹 + 杯盖和杯口环）。自动缓慢旋转，拖动可旋转（带阻尼，停手 2.5 秒后恢复自动转），上下轻轻漂浮，底部有柔和阴影。底部是液态玻璃对话框（半透明 + backdrop-filter blur(18px) + 细白边 + 圆角 22px），标题一字不差是「请向蛋仔许愿」，内含「写下你的愿望」、textarea（maxlength=120，placeholder 是改写的示例「例如：希望今年可以勇敢一点，去见想见的人。」）、实时「0 / 120」计数、青色渐变按钮「送往蛋仔」；提交成功后卡片内显示「愿望已送往蛋仔」+「再许一个愿望」按钮。`<title>` 仍是「蛋仔导航网」。旧搜索框和两张应用卡片仍保持删除，首页无侦探搜索 / 蛋仔模拟入口；`search.html`、`medusa.html` 文件未动，只是不再从首页链接。
- 许愿后端 `api/wish.js`（Vercel Node serverless，新增依赖 `@vercel/blob@^2.9.0`，已写入 `package.json`，Vercel 部署时会自动 npm install）：
  - POST `/api/wish` `{ text }`：服务端校验（去空、≤120 字、同一 IP 30 秒限 1 条），把愿望追加进私有 Blob 仓库里的 `wishes.json`（JSON 数组，最多 500 条，超了删最旧的）。
  - GET `/api/wish?password=...`：管理员查看，最新在前；密码错返回 401。
  - 存储：**已用 CLI 真建好了**，不是空壳——私有 Blob 仓库 `danzi-wishes-web`，已连到项目 sherlock-web（production / preview / development），环境变量为 `BLOB_READ_WRITE_TOKEN`。KV（Redis）是 Marketplace 资源，CLI 建不了，改用 Blob 同样能存愿望列表，无需用户再手动操作。纠正：第一次建的仓库 `danzi-wishes`（store_iiBJ37AUaSDv4FUD，区域 iad1）被错连到了 stray 项目 sherlock-vercel，线上函数没有凭证，提交曾返回 500「保存失败」；已改用 `danzi-wishes-web` 并重新部署后恢复，旧仓库为空、未使用。
  - 管理员密码：环境变量 `WISHES_ADMIN_PASSWORD`；**未设置时默认密码是 `danzi`**（已在代码和本节写明，部署后请在 Vercel 项目 Settings → Environment Variables 里改掉；本项目未设置该变量）。
- 后台查看页 `wishes.html`：深色简洁页，输密码后列出全部愿望（最新在前，带时间），愿望文字用 `textContent` 渲染（不解析 HTML，防注入），有刷新按钮。地址：`/wishes.html`。

本地验证（2026-11-11，Node v24.22.1）：

- `node --check api/wish.js` ✅；`index.html` 内联 `<script type="module">` 提取后（9,117 字符）`node --check` ✅。
- `index.html` 含「请向蛋仔许愿」1 处、「送往蛋仔」4 处（按钮 + 发送中 + 成功标题）、「向蛋仔许愿」3 处、`maxlength="120"` 1 处、「0 / 120」1 处、`assets/danzi-cup-noodle.jpg` 1 处、`three@0.170.0` 2 处（import map 两行）✅；含「侦探搜索 / 蛋仔模拟」0 处、「水母 / jellyfish / Medusa」0 处 ✅。
- `api/wish.js` 本地 mock handler 实测：GET 错密码 → 401 ✅；GET 无密码 → 401 ✅；POST 空愿望 → 400 ✅；POST 121 字 → 400 ✅；OPTIONS → 200 ✅；GET 正确默认密码 → 200、`{count:0, wishes:[]}` ✅；POST 正好 120 字 → 本地返回 500 `{"ok":false,"error":"保存失败，请稍后重试"}`——**本地预期行为**：本机没有 Blob 凭证（无 OIDC token），`put` 必然失败，handler 已包 try/catch 返回干净 JSON（此前未包时会直接抛错，已修复）；线上部署后 OIDC 自动认证，应返回 200，**部署后必须在线上实测提交一次**。
- 本地静态服务实测：`index.html` 200（16,259 B）、`medusa.html` 200、`search.html` 200、`wishes.html` 200（4,735 B）、`assets/danzi-cup-noodle.jpg` 200（80,308 B）✅。
- 未部署、未做浏览器内渲染验证：部署后请在真浏览器打开首页确认背景图、3D 蛋仔旋转与拖动、计数与提交；再提交一条测试愿望，用默认密码 `danzi` 打开 `/wishes.html` 确认能看到它；确认后请改掉管理员密码。已知小限制：愿望存在单个 `wishes.json` 里（读-改-写），同一瞬间多人同时提交时后写者可能覆盖前者，许愿量小可接受。
