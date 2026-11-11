# Sherlock 网页版（Vercel 部署版）

在浏览器里输入用户名，在数百个网站上查找同名账号。数据源是开源项目 sherlock-project/sherlock 的官方 `data.json`，判定规则与 Sherlock 完全一致（状态码 / 页面错误信息 / 跳转后地址）。

## 项目结构

```
sherlock-vercel/
├── index.html          # 一级页面：向蛋仔许愿（深色沉浸式：蛋仔原图满屏背景 + 3D 球形蛋仔 + 液态玻璃许愿卡；无搜索框、无应用卡片）
├── medusa.html         # JF-4 模拟页：three.js 3D 仪表盘，中央是头顶咖喱杯面的蛋仔角色牌，25 秒循环巡游（首页不链接，仅文件保留）
├── wishes.html         # 愿望后台查看页：输管理员密码后列出全部愿望（最新在前）
├── assets/             # 黑客图标（侦探搜索卡片图）、danzi-cup-noodle.jpg（蛋仔角色图，用户原图）
├── search.html         # 二级页面：Sherlock 用户名搜索（搜索、筛选、复制链接、历史记录；支持 ?q= 用户名自动搜索；首页不链接，仅文件保留）
├── api/
│   ├── search.js       # 后端：Vercel Node serverless 函数，POST /api/search
│   └── wish.js         # 后端：Vercel Node serverless 函数，POST /api/wish 提交愿望，GET /api/wish?password=... 管理员查看
├── data/
│   └── sites.json      # Sherlock 官方站点数据库（481 个站点，19 个 NSFW）
├── vercel.json         # 极简配置（无构建步骤）
├── package.json        # type: module，依赖 @vercel/blob（许愿存储用）
├── README.md           # 本文件
├── TESTS.md            # 本地测试记录与已知限制（部署前请读）
└── test/
    ├── local-test.mjs      # 本地测试：torvalds / 乱码用户名 / 格式校验
    └── full-popular.mjs    # 本地测试：65 个常用站点全量实测
```

## 页面结构

- **一级页面 `/`（index.html）——向蛋仔许愿**：深色沉浸式页面（`<title>` 仍是「蛋仔导航网」）。背景是蛋仔原图满屏铺开（压暗 + 轻微模糊）；顶部绿色小字「把愿望交给发光的蛋仔」+ 巨大白字标题「向蛋仔许愿」；中间是 three.js 做的 3D 蛋仔——全身就是一个黄色大圆球，奶油色脸、大眼睛、张开的红嘴、两只小白脚，头顶一杯微倾的泡面杯，自动慢转、可拖动旋转；底部是液态玻璃对话框，标题「请向蛋仔许愿」，写愿望（最多 120 字，实时计数）、按钮「送往蛋仔」。页面没有搜索框，没有侦探搜索 / 蛋仔模拟卡片。`/search.html` 和 `/medusa.html` 文件仍在，只是不再从首页链接。
- **许愿后端（api/wish.js + Vercel Blob）**：POST `/api/wish` 提交愿望（服务端校验 ≤120 字、去空、同一 IP 30 秒限 1 条），存入私有 Blob 仓库 `danzi-wishes-web` 里的 `wishes.json`（最多 500 条，超了删最旧的）；GET `/api/wish?password=...` 管理员查看，最新在前。后台查看页 `/wishes.html`：输密码后列出全部愿望。管理员密码：环境变量 `WISHES_ADMIN_PASSWORD`，未设置时默认 `danzi`——部署后请在 Vercel 项目 Settings → Environment Variables 里改掉。
- **二级页面 `/search.html`（search.html）——侦探搜索**：功能不变，顶部是「← 返回 蛋仔导航网」链接回 `/`；支持首页搜索框带过来的 `?q=` 参数：打开时自动填入用户名并开始搜索。
- **模拟页 `/medusa.html`（medusa.html）——JF-4 模拟**：three.js 3D 仪表盘，中央是用户提供的蛋仔角色（头顶一杯咖喱杯面，图片在 `assets/danzi-cup-noodle.jpg`），25 秒循环巡游，可拖拽旋转、时间轴 scrub、暂停。注意：这页不是水母，页面里没有任何水母内容。

## 功能（搜索页）

- 输入用户名，一键搜索；支持回车搜索、点击历史记录重新搜索。
- 两种模式：**常用站点（65 个，快）** / **全部站点（481 个，全）**。
- NSFW 开关，默认关闭。
- 实时进度条与已找到数量；结果分四类：已找到 / 未找到 / 无法确认 / 格式无效，可按分类筛选。
- 已找到的结果可点开直达个人主页，可一键复制全部已找到的链接。
- 搜索历史保存在浏览器 localStorage（最多 20 条，可清空）。
- **绝不猜测**：站点超时、返回 403/429/5xx 被屏蔽时，结果标为「无法确认」，而不是“未找到”。

## 部署步骤（在你自己的电脑上操作）

### 1. 安装 Vercel CLI 并登录

```bash
npm i -g vercel
vercel login
```

按提示用你的 Vercel 账号（rongyaolei07-5858）登录。

### 2. 部署

```bash
cd sherlock-vercel
vercel --prod
```

第一次会问几个问题：项目名、是否覆盖设置等，一路按默认即可（这是一个纯静态 + serverless 项目，无需构建命令）。部署成功后会得到一个 `https://<项目名>.vercel.app` 临时地址，先打开它，用用户名 `torvalds` 搜一次常用站点，确认能找到 GitHub。

### 3. 绑定自定义域名 游龙蛋仔岛.top

1. 在 Vercel 网页端打开该项目 → Settings → Domains → 输入 `xn--6mqt94apwn8fxeq1a.top`（这是 `游龙蛋仔岛.top` 的 punycode 形式，DNS 系统只认这个写法；Vercel 输入框里填中文域名通常也会自动转换，两种都可尝试）→ Add。
2. 再添加一个 `www.xn--6mqt94apwn8fxeq1a.top`（可选，用于 `www.` 前缀也能访问）。
3. Vercel 会显示需要添加的 DNS 记录，一般是：
   - 根域名（`@`）：A 记录指向 `76.76.21.21`
   - `www`：CNAME 记录指向 `cname.vercel-dns.com`
   - 以 Vercel 页面上实际显示的值为准。

### 4. 在阿里云设置 DNS

1. 登录阿里云控制台 → 域名 → 找到 `游龙蛋仔岛.top` → 解析设置。
2. 按上一步 Vercel 给的值添加记录（主机记录填 `@` 和 `www`，记录类型和记录值按 Vercel 的提示）。
3. 保存后等待 DNS 生效，通常几分钟，最长可能几小时。可用 `nslookup 游龙蛋仔岛.top` 或直接在浏览器打开 `https://游龙蛋仔岛.top` 验证。
4. 证书由 Vercel 自动签发，生效后地址栏会显示 HTTPS 锁标志。

### 5. 线上验证

打开 `https://游龙蛋仔岛.top`，应看到深色「向蛋仔许愿」首页（蛋仔原图背景、3D 球形蛋仔在中间自动旋转、底部液态玻璃卡片「请向蛋仔许愿」）。拖一下蛋仔确认能旋转；在输入框写一条测试愿望点「送往蛋仔」，应显示「愿望已送往蛋仔」；再打开 `https://游龙蛋仔岛.top/wishes.html`，输入默认密码 `danzi`，应能看到刚才那条愿望。**确认后请改掉管理员密码**：Vercel 网页端打开该项目 → Settings → Environment Variables → 新建 `WISHES_ADMIN_PASSWORD`（值填新密码）→ 重新部署一次生效。搜索页仍可用：直接打开 `/search.html`，用用户名 `torvalds` 搜一次常用站点，应能找到 GitHub；再搜一个乱码用户名（如 `xjqwzvkzxkqwv987654321`），GitHub 应显示“未找到”。如果某个站点显示“无法确认”，属正常现象（见 TESTS.md 第 4 节），点开链接人工确认即可。

## 技术说明

- **依赖**：只有一个生产依赖 `@vercel/blob`（许愿存储用），部署时 Vercel 会自动 `npm install`；本地测试前也需要先 `npm install` 一次。无构建步骤。
- **许愿存储**：私有 Blob 仓库 `danzi-wishes-web` 已建好并连到项目 sherlock-web，环境变量 `BLOB_READ_WRITE_TOKEN` 已设置（Production / Preview / Development），愿望存在其中唯一的 `wishes.json` 里。注意：第一次建的仓库 `danzi-wishes`（store_iiBJ37AUaSDv4FUD）被错连到了 stray 项目 sherlock-vercel，线上函数没有凭证，提交曾返回 500「保存失败」；已改连 `danzi-wishes-web` 并重新部署后恢复。2026-11-11 19:12 又发现一个 bug：`put` 没加 `allowOverwrite: true`，第一条愿望建好 wishes.json 后，后面每条都报 "blob already exists" 存不进去；已修复并重新部署。本地没有 Blob 凭证，所以本地跑 `POST /api/wish` 会返回 500「保存失败」，这是本地预期行为。
- **访问计数（2026-11-11 19:34，Charles 要求加的）**：`api/visits.js`，计数存在同一个 Blob 仓库里的 `visits.json`。GET 只读当前数；POST +1（同一 IP 每天最多 +1，本站 Origin 才接受）。首页底部显示“已有 N 位访客来过”，浏览器用 sessionStorage 记一次，同一打开只算 1 次。注意每次 +1 消耗 1 次 Blob 高级操作，和愿望提交共用每月 2000 次的免费额度。
- **设计技能（2026-11-11 19:52，Charles 让装的）**：GitHub elayadesign/ai-design-skills（MIT）里的 `landing-page-design` 和 `figma-designer` 已存到 `~/workspace/custom-skills/`。`figma-designer` 要连 Figma 才能用；`landing-page-design` 是做落地页的流程 + 严格视觉系统（Manrope 字体、Tailwind 字号档位、固定间距、纯色深色背景、不用渐变、不用连字符、标语逐词浮现）。
- **首页改版成落地页（2026-11-11 19:54，Charles 选的方案：首页换成落地页，许愿放进页面里）**：按 `landing-page-design` 技能重写 `index.html`。结构：悬浮导航、Hero（标题 + 副文案 + 许下愿望按钮 + 真实访客数和愿望数 + 3D 蛋仔）、标语逐词浮现、4 张好处卡、三步、许愿表单（原有提交逻辑不变）、搜索功能卡、关于蛋仔（蛋仔照片）、数字条、6 条 FAQ、结尾 CTA、页脚 + 隐私说明。新增 `api/wish-count.js`（公开只返回愿望总数，不返回内容）。另加 `404.html`（蛋仔吃掉页面的品牌 404）。旧许愿页备份在 `~/workspace/wish-page-backup-20261111.html`（不在项目里，不会部署）。注意：技能规则和旧页面风格冲突（旧页用渐变背景和系统字体），所以只对新首页生效，不追溯改别的页。2026-11-11 20:04 桌面端核查通过：Hero、全部区块、许愿提交（愿望数 3→4）都正常；两个小问题——成功提示是金色不是绿色、表单处看不到蛋仔庆祝；移动端 390px 当时没能验证。
- **蛋仔模拟已删除（2026-11-11 20:04，Charles 要求）**：`medusa.html` 文件已从项目删除（备份在 `~/workspace/medusa-backup-20261111.html`），首页的功能卡、FAQ、副文案、好处卡里的相关文案全部去掉，只剩侦探搜索一张卡。`/medusa.html` 现在返回品牌 404 页（“这个页面被蛋仔吃掉了”）。教训：删模拟卡时用了一条横跨多行的正则（从第一个 `<article>` 匹配到“蛋仔模拟”），结果误删了好处卡、三步、许愿表单和功能区整段，第二次浏览器核查才发现。已补回并重新部署，标签数核对过（section 12/12、div 57/57、article 5 个）。以后删卡片只用精确的整块替换，不用跨段正则。
- **落地页动效（2026-11-11 20:05，Charles 要求）**：Hero 入场（标题、副文案、按钮、证明行、蛋仔依次淡入上移）；好处卡和三步卡片滚动出现时依次延迟入场；数字条滚入视口时数字从 0 数到目标值（900ms）；成功面板的 ✨ 加了弹跳动画。成功提示改回绿色（#4ADE80）。全部只用 transform 和 opacity 做动画，尊重 prefers-reduced-motion。浏览器二次核查进行中。
- **联系我们（2026-11-11 20:05，Charles 要求）**：首页新增「联系我们」区块，mailto 链接 rongyaolei07@gmail.com，导航栏、移动端菜单和页脚都有入口。
- **旅途记录页（2026-11-11 20:12–20:30，Charles 的想法：每人注册 + 图片验证，点亮去过的城市，别人能看到人数，可传照片、可留言；他选了按城市点亮，3000 多个）**：`/journey.html` + 后端 `api/journey-captcha.js`、`api/journey-auth.js`、`api/journey-data.js`、`api/journey-photo.js`、共享 `api/journey-lib.js`，数据在 `data/china.json`（34 个省，358KB）和 `data/city-coordinates.json`（3071 个城市，259KB，原项目的数据）。注册：用户名 2–20 字，密码 scrypt + 每人一个盐存 `journey-users.json`；图片验证码是自己画的 SVG（4 个字符随机旋转 + 干扰线，答案 AES-256-GCM 加密进 token，5 分钟过期）；登录态是 HMAC 签名 token，HttpOnly Cookie 30 天，密钥在环境变量 `JOURNEY_SECRET`（Vercel API 写入）。地图用 ECharts 5.6.0（CDN）+ 34 省 GeoJSON；搜城市联想、点亮/取消、每个城市显示人数、照片、留言。照片：浏览器先压到 1000px 以内再传 base64，后端存私有 Blob，`api/journey-photo.js` 代理给登录的人看（私有仓库拒绝公开 put，这是教训一）。照片代理一开始写错了：`@vercel/blob` 的 `get()` 返回的对象只有 `.stream`，没有 `.arrayBuffer()`，读图会 404，已改成 `new Response(blob.stream).arrayBuffer()`（教训二）。浏览器端到端核查 2026-11-11 20:21–20:23 全部通过：注册、验证码、搜丹寨、点亮、留言、退出再登录、重复注册被拒；发现顶部统计点亮后不实时更新，已修（点亮/留言/传照片后直接加减数字）；地图对比度偏低，已调亮（省底色 #262626、边框 #4D4D4D、亮点加大）。照片上传是 API 实测通过的（上传 200，代理取回 200 且是真 PNG）。测试账号和数据已清干净（0 用户）。首页「站里还有什么」有旅途记录入口卡。2026-11-11 20:32 又加了两处：许愿成功面板里加了金色按钮「去旅途记录看看」（点进去就是旅途记录页）；旅途记录页搜索框上方加了「横屏版 / 竖屏版」切换（竖屏是 560px 居中的窄栏 + 更高的地图，选择记在 localStorage，默认按屏幕宽度）。Charles 自己的旅途记录账号是 lryarb（密码他自己保管）。
- **Map-Of-My-Journey 学习笔记（2026-11-11 20:04，Charles 让学的）**：Tooolive 的个人中国足迹网站，Vue 3 + Vite 5 + ECharts 5 + china-map-geojson，PHP JSON 文件后端，无数据库。笔记在 `~/workspace/notes/map-of-my-journey-study.md`。要点：3071 个城市坐标、ECharts lines 路线 + effectScatter 涟漪点、按时间重放路线的回忆动画、localStorage 离线缓存 + 恢复后同步、保存防抖 700ms、自动备份。移植到他的站要把 PHP 改成 Vercel serverless + Blob，Vue 需要构建步骤，ECharts 地图部分可以直接走 CDN 复用。
- **为什么分批请求**：Vercel Hobby 免费版单次函数执行上限约 10 秒。前端每批只发 10 个站点（3 批并发），每批最慢约 5 秒多，安全地留在上限内；每站请求超时设为 5 秒。
- **判定规则**（与 Sherlock 一致，见 `api/search.js`）：
  - `status_code`：最终 HTTP 状态 200 = 找到，404/410 = 未找到；403/429/5xx = 无法确认。
  - `message`：页面包含 data.json 里的 errorMsg = 未找到，否则 200 = 找到。
  - `response_url`：跳转后的最终地址与个人主页地址不同 = 未找到。
  - 用户名不符合站点的 `regexCheck` = 格式无效。
- **更新站点数据**：重新下载 `https://raw.githubusercontent.com/sherlock-project/sherlock/master/sherlock_project/resources/data.json`，覆盖 `data/sites.json` 后重新部署即可。

## 已知限制

详见 `TESTS.md` 第 4 节。最重要的一条：部署在 Vercel（数据中心 IP）上时，部分站点会屏蔽请求或返回登录墙页面，可能出现“无法确认”或少数“假的已找到”，请点开链接人工确认。
