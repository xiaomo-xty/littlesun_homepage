# 浏览器验收报告

验收日期：2026-08-16  
验收对象：个人主页概念原型 `v0.1.0`  
本地地址：`http://127.0.0.1:4322/`

## 自动检查

| 检查项 | 结果 |
| --- | --- |
| `bun run check` | 通过：0 errors、0 warnings、0 hints |
| `bun run build` | 通过：静态首页构建成功 |
| 浏览器控制台 | 通过：无 warning 或 error |
| 水平溢出 | 通过：桌面与移动端均未出现 |

## 视口与主题

| 场景 | 结果 |
| --- | --- |
| 桌面 1440 x 900 / 深色 | 通过 |
| 桌面 1440 x 900 / 浅色 | 通过 |
| 移动端 390 x 844 / 深色 | 通过 |
| 移动端全屏菜单 | 通过：Escape、导航点击均可关闭 |

首屏在两个目标视口中均保留下一章节提示：桌面“关于我”标题顶部为 `891px`，移动端为 `824px`。

## 交互

| 操作 | 结果 |
| --- | --- |
| 项目上一张 / 下一张循环切换 | 通过 |
| 项目卡正反面翻转 | 通过 |
| 项目分类筛选 | 通过 |
| 移动端横向滑动切牌 | 通过：SceneScope 可切换至 Commercial C++ |
| 键盘 `ArrowRight` 切牌 | 通过：可切换至 Bevy |
| 键盘 `Space` 翻面 | 通过 |
| 指针倾斜与像素粒子反馈 | 通过 |
| 页面隐藏时暂停动画 | 通过 |
| reduced-motion / WebGL 静态降级 | 通过 |

## 画布与可读性

- Three.js 画布状态为 `ready`。
- 画布截图熵为 `0.206`，通道差异检查确认画布非空。
- 浅色正文对比度：`5.00:1`。
- 深色正文对比度：`9.73:1`。
- 深色主文本对比度：`16.75:1`。
- 强调色按钮对比度：`7.03:1`。
- 未发现文字裁切、不可理解的元素重叠或动态内容引发的布局偏移。

## 验收截图

截图保存在本地 `artifacts/`，该目录被 `.gitignore` 排除：

- `homepage-desktop-hero.png`
- `homepage-desktop-light.png`
- `homepage-desktop-deck.png`
- `homepage-desktop-deck-back.png`
- `homepage-desktop-articles.png`
- `homepage-desktop-life.png`
- `homepage-desktop-contact.png`
- `homepage-mobile-hero.png`
- `homepage-mobile-menu.png`
- `homepage-mobile-deck.png`
- `canvas-pixel-check.png`

## 内容边界

- 姓名、人像、简历、GitHub、邮箱、项目截图和文章链接仍使用明确占位符。
- SceneScope 保持“进行中”，Bevy 保持“准备中”。
- 未写入虚构雇主、成果指标、文章发布日期或项目完成状态。
- 未修改 `D:\project\blog`；其原有未跟踪文件 `src/content/posts/test-comment.md` 保持不变。

## 结论

当前版本满足概念原型发布门槛，可作为后续替换真实资料和继续视觉迭代的稳定基线。

## v0.1.1 卡组动效补丁

验收日期：2026-08-16

| 检查项 | 桌面 1440 x 900 | 移动端 390 x 844 |
| --- | --- | --- |
| 正反面位置 | 通过：坐标完全一致 | 通过：坐标完全一致 |
| 正反面尺寸 | `520 x 650` | `321 x 600` |
| 可见后牌 | 通过：保留两张真实项目卡 | 通过：保留两张真实项目卡 |
| 页面水平溢出 | `0px` | `0px` |
| 卡面内容溢出 | 通过 | 通过：四张项目卡均为 `0px` |

交互验收：

- 上一张、下一张和循环切换均只移动一张卡。
- 后牌不再覆盖下方切牌按钮，按钮中心命中自身图标与按钮区域。
- 旧牌退场和新牌从后方上桌同时发生，不再串行等待。
- 切牌包含平移、缩放、平面旋转和 Y 轴旋转，并使用 spring 收束。
- 翻面前归零指针倾斜，正反面保持相同空间基准。
- 翻面后焦点从“查看背面”移动到“返回正面”。
- reduced-motion 继续使用近乎即时的静态状态切换。

自动检查：

- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：静态生产构建成功。
- 可见页面文案未引入 em dash 或 en dash。

## v0.2.0 可玩卡牌与环境背景

验收日期：2026-08-16

| 检查项 | 桌面 1440 x 900 | 移动端 390 x 844 |
| --- | --- | --- |
| 卡面尺寸 | `520 x 690` | 约 `321 x 650` |
| 页面水平溢出 | `0px` | `0px` |
| 四张卡面内容溢出 | 通过 | 通过：均为 `0px` |
| 详情层边界 | 完全位于卡面内 | 完全位于卡面内 |
| 深浅主题 | 通过 | 通过 |
| 环境画布 | `ready` | `ready` |

发牌与切牌：

- 首次进入依次发出远牌、近牌与主牌，主牌从卡背翻到正面。
- 切牌逐段显示旧牌回背、旧牌入堆、新牌背面抽出、新牌翻正。
- 单轮过渡约 `1.16s`，过渡期间按钮、列表和筛选输入锁定。
- 鼠标按钮、可见后牌、方向键和移动端滑动均复用同一状态机。
- 切换结束后读数从 `DRAWING` 返回 `READY`。

卡面与内容：

- 问题、过程和证据全部位于正面详情层；卡背没有项目标题、状态或技术信息。
- 桌面悬停时详情透明度从 `0` 过渡到 `1`，移出恢复；按钮可稳定展开和收起详情。
- 四张项目卡及详情层均无内部溢出。
- 当前项目数据没有真实仓库或 Demo URL，因此页面没有项目外链，并显示“公开链接待补充”。
- 数据模型支持 `source`、`demo` 和 `case-study` 三类链接，加入真实 URL 后自动生成新窗口动作。

程序化背景：

- 使用固定种子生成矩形、三角、弧线、十字结构和方形像素粒子。
- 无鼠标输入时，各元素仍按独立随机周期改变位置、尺度、亮度和轮廓。
- 鼠标移动只叠加低幅视差与粒子近距离响应，画布不拦截指针事件。
- Canvas 动画帧内不更新 React 状态，并包含 DPR 上限、标签页隐藏暂停、减少动态与省流量降级。

自动检查：

- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：静态生产构建成功。
- 浏览器控制台：无 warning 或 error。
- 未修改 `D:\project\blog`。

## v0.3.0 动态世界与项目侧板

验收日期：2026-08-16

验收地址：`http://127.0.0.1:4325/`

### 视口、主题与内容边界

| 场景 | 结果 |
| --- | --- |
| 桌面 1440 x 900 / 浅色 | 通过：无水平溢出，首屏保留下节提示 |
| 桌面 1440 x 900 / 深色 | 通过：无水平溢出，背景与正文层次清晰 |
| 移动 390 x 844 / 浅色 | 通过：无水平溢出，“关于我”在首屏底部露出 |
| 移动 390 x 844 / 深色 | 通过：无水平溢出，菜单与项目区完整可用 |
| 可见文案破折号检查 | 通过：未出现 em dash 或 en dash |

- 移动端主卡约 `321 x 650`，展开详情后横向与纵向内部溢出均为 `0px`。
- 过渡期间没有重复 DOM `id`，隐藏卡面不进入键盘焦点序列。
- 姓名、人像、简历、GitHub、邮箱、项目截图和对外链接继续使用明确占位符。

### 交互回归

| 操作 | 结果 |
| --- | --- |
| 移动菜单打开、Escape 关闭、导航后关闭 | 通过 |
| `ArrowRight` 键盘切牌 | 通过：SceneScope 切换至商业 C++ 开发 |
| `Space` 展开项目详情 | 通过 |
| 项目离场后重新进入 | 通过：发牌周期由 `1` 递增到 `2` |
| 重入后的状态保持 | 通过：当前卡与主题保持不变 |
| 移动端证据摘要 | 通过：可展开并与当前卡同步 |

- 项目切换完成后读数返回 `READY`，单轮重叠时序保持约 820ms。
- 章节进入和离开可重复触发，滚动不被劫持。

### 背景后端

| 路径 | 运行状态 | 结果 |
| --- | --- | --- |
| 默认桌面 | `webgpu / full / ready` | 通过 |
| 默认移动 | `webgpu / balanced / ready` | 通过 |
| `?ambient=webgl2` | `webgl2 / balanced / ready` | 通过 |
| `?ambient=static` | `static / static / ready` | 通过 |

- WebGPU 背景在无指针输入时仍持续变化；指针、点击与抽牌脉冲均保持非阻塞。
- 扫描线和暗角仅覆盖背景画布，不改变 DOM 正文和控件。
- 三条干净加载路径的浏览器 warning/error 均为空。

### 自动检查

- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：静态生产构建成功，无构建告警。
- `git diff --check`：通过。
- 未修改 `D:\project\blog`。

### 结论

`v0.3.0` 满足当前概念原型的交互、响应式、降级和构建门槛，可合并至 `develop`；真实媒体与外链仍应在独立内容分支补充。

## v0.4.0 涌现式背景与界面减法

验收日期：2026-08-18

验收地址：`http://127.0.0.1:4326/`

### 自动检查

| 检查项 | 结果 |
| --- | --- |
| `bun run test` | 通过：5 passed、0 failed |
| `bun run check` | 通过：0 errors、0 warnings、0 hints |
| `bun run build` | 通过：静态生产构建成功 |
| `git diff --check` | 通过 |
| 干净浏览器控制台 | 通过：无 warning 或 error |

### 视口与背景后端

| 场景 | 运行状态 | 结果 |
| --- | --- | --- |
| 桌面 1440 x 1000 / 浅色 | `webgpu / full / ready` | 通过：无水平溢出，实体清晰可见 |
| 桌面 1440 x 1000 / 深色 | `webgpu / full / ready` | 通过：层次与正文对比清晰 |
| 移动 390 x 844 / 浅色 | `webgpu / balanced / ready` | 通过：无水平溢出，菜单与首屏完整 |
| `?ambient=webgl2` | `webgl2 / balanced / ready` | 通过：实际使用轻量资源预算 |
| `?ambient=static` | `static / static / ready` | 通过：Canvas 隐藏，CSS 兜底可见 |

- 桌面空闲观察期间，实体数量从 9 增长至上限 14，`data-fracture-count` 从 0 增长至 2。
- 背景对象声明为 `data-creature="arthropod"` 与 `data-pointer-force="repel"`。
- 单元测试确认指针力始终背离鼠标，实体碰撞交换动量，三类几何按有界规则破碎。
- 浅色页面基底为 `#f7f8f6`，普通内容表面为 `#ffffff`。

### 界面与卡牌

| 检查项 | 结果 |
| --- | --- |
| 技术关键词横条 | 通过：DOM 节点数为 0 |
| 重复证据侧板 | 通过：`.sideboard-story` 节点数为 0 |
| 卡面证据正文 | 通过：`.evidence-list` 节点数为 1 |
| 桌面牌组索引 | 通过：4 张牌均可直接抽取 |
| 重复进入项目区 | 通过：发牌周期从 1 增长至 2 |
| 单次切牌 | 通过：约 0.9 秒，旧牌回背与新牌翻正可见 |
| 移动项目卡 | 通过：四张卡横向、纵向内部溢出均为 0 |
| 移动全屏菜单 | 通过：打开后锁定页面，Escape 可关闭 |

### ICP 与内容边界

- 页尾显示 `湘ICP备2026030115号-1`，链接目标为 `https://beian.miit.gov.cn/`。
- MIT License 保持在仓库根目录。
- 姓名、人像、简历、GitHub、邮箱、项目截图和文章链接继续使用明确占位符。
- 未修改 `D:\project\blog`。

### 验收截图

本轮截图保存在被 `.gitignore` 排除的 `artifacts/`：

- `homepage-v0.4-desktop-light.png`
- `homepage-v0.4-desktop-dark.png`
- `homepage-v0.4-desktop-deck.png`
- `homepage-v0.4-mobile-hero.png`
- `homepage-v0.4-mobile-menu.png`
- `homepage-v0.4-mobile-deck.png`

### 结论

`v0.4.0` 满足当前背景生态、界面减法、深浅主题、响应式、降级、交互与构建门槛，可以合回 `develop`。`main` 继续保持未发布状态，等待用户决定正式发布。

## 2026-08-19 / v0.5 Space Ocean Browser QA

### 环境

- 分支：`test/v0.5-browser-qa`
- 本地预览：`http://127.0.0.1:4326/`
- 内置浏览器视口：731 x 912，命中 `< 768px` 移动布局
- 主题：浅色与深色
- 后端：默认 WebGPU、强制 WebGL2、强制 static

### 渲染与生态

| 路径 | 结果 | 证据 |
| --- | --- | --- |
| 默认 | `webgpu / balanced / ready` | `data-creature="space-ray"`，10 个群游生物，6 个初始实体 |
| `?ambient=webgl2` | `webgl2 / balanced / ready` | 星鳐与群游保留，页面无横向溢出 |
| `?ambient=static` | `static / static / ready` | Canvas opacity 为 0，1 个静态星鳐和 3 条曲线流线 |

- 旧 `.ambient-static-creature` 节点数为 0，源代码中无 `arthropod`、腿部几何、脚点实例或接触阴影。
- 浅色页基底为 `#f7f8f6`，`--shadow` 为 `transparent`；深色 Canvas opacity 为 0.56。
- 轻量雾化层和项目卡磨砂表面未造成文字裁切或页面溢出。
- 指针行为标记为 `repel`，斥力方向、群游规则和弹簧尾带由 8 个纯函数测试覆盖。

### 页面交互

- 项目区首次进入后发牌周期为 1，下一张按钮可用。
- 从 SceneScope 切换到商业 C++ 开发后，卡内和页面横向溢出均为 0。
- 项目详情展开后 `aria-expanded="true"`，详情面板横向与纵向内部溢出均为 0。
- 移动菜单打开时 `aria-expanded="true"`，菜单内部溢出为 0；点击“生活”后导航到 `#life` 并关闭菜单。

### 内容链接

- GitHub：`https://github.com/xiaomo-xty`，新窗口，`rel="noreferrer"`。
- 博客：`https://blog.littlesun.space`，新窗口，`rel="noreferrer"`。
- ICP：`湘ICP备2026030115号-1`，目标为 `https://beian.miit.gov.cn/`。
- 简历、邮箱、人像和项目媒体继续使用明确占位，没有虚构信息。

### 质量门禁

- `bun run test`：8 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：静态生产构建成功。
- `git diff --check`：通过。
- 未修改 `D:\project\blog`。

### 剩余风险

- 当前内置浏览器无法切换到 1440px 宽视口，本轮完整交互截图以 731px 移动断点为主；桌面布局沿用 v0.4 已通过的结构，背景为固定全屏正交场景。
- 后续接入真实人像和项目媒体后，需要重新检查背景安全区与磨砂透明度。

## 2026-08-19 / v0.6 Creature Animation Demo QA

### 环境

- 分支：`feature/v0.6-creature-demo`
- 独立路由：`/labs/space-ocean-demo/`
- 桌面：1280 x 720
- 移动：390 x 844
- 后端：默认 WebGPU、强制 WebGL2、强制 static

### 渲染结果

| 路径 | 状态 | 结果 |
| --- | --- | --- |
| 默认桌面 | `webgpu / ready` | 海豚、水母、流线与像素均可见，无 console error/warning |
| `?backend=webgl2` | `webgl2 / ready` | 与 WebGPU 保持同一矢量海豚和环境层，无 console error/warning |
| `?backend=static` | `static / fallback` | 静态 Twemoji 海豚可见 |
| 移动深色 | `webgpu / ready` | 页面横向溢出为 0，控件与页尾不重叠 |
| 移动浅色 | `webgpu / ready` | 基底为 `rgb(248, 250, 248)`，实体保持可辨识 |

### 动画与交互

- 连续桌面帧确认海豚尾部形状变化，头部、眼睛和吻部保持稳定。
- 海豚的垂直速度只产生有限俯仰，左右速度控制镜像，不出现整身侧翻。
- 水母钟罩呼吸和 4 条触手滞后均可见。
- 指针靠近后，海豚、水母和像素远离鼠标；点击触发短促像素扩散。
- 暂停后状态显示 `PAUSED`；主题切换不恢复动画；重置后状态回到 `READY`。

### 像素与质量门禁

- 桌面中心场景截图：960 x 470，亮度范围约 `3.7-253`，非空像素检查通过。
- 移动中心场景截图：390 x 580，亮度范围约 `6.7-255`，非空像素检查通过。
- `bun test`：8 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：静态生产构建成功。
- 未修改主页背景，也未修改 `D:\project\blog`。

### 结论

独立动画 Demo 当时满足 WebGPU、WebGL2、静态降级、响应式、交互和构建门槛，并进入用户审核。该门禁随后于 2026-08-22 解除，正式集成结果如下。

## 2026-08-22 / v0.6 Homepage Creature Integration QA

### 环境与范围

- 分支：`feature/v0.6-homepage-creature-integration`
- 正式主页：`/`
- 干净开发会话：`http://127.0.0.1:4334/`
- 桌面：1280 x 720；移动：390 x 844
- 后端：WebGPU、强制 WebGL2、强制 static

### 结果

- WebGPU 深浅主题均为 `ready`，`data-creature="same-side-dolphin"`，无 console warning/error。
- WebGL2 为 `balanced / ready`，同侧海豚、水母、粒子与实体持续运动，无 console warning/error。
- static 模式画布透明度为 0，同侧海豚静态轮廓可见，无旧鳐鱼残留。
- 移动端为 2 只水母、0 横向溢出；海豚在正文安全区内自动淡化。
- 项目区水合成功，筛选和切牌按钮可用；切到“商业 C++ 开发”后背景仍为 ready，实体碎裂计数继续变化。
- WebGPU 连续帧变化 12,670 字节，WebGL2 连续帧变化 3,362 字节，画布非空且持续更新。

### 质量门禁

- `bun test`：28 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- `git diff --check`：通过。
- 未修改 `D:\project\blog`。

## 2026-08-22 / v0.7 海洋静物与固定时间步验收

### 环境与范围

- 分支：`feature/v0.7-marine-still-life-fixed-step`
- 正式主页：`http://127.0.0.1:4335/`
- 桌面：1280 x 720；移动：390 x 844
- 后端：WebGPU、强制 WebGL2、强制 static

### 背景后端与主题

| 场景 | 运行状态 | 结果 |
| --- | --- | --- |
| 桌面 / WebGPU / 深色 | `webgpu / full / ready` | 通过：深墨色眼睛，海洋静物可见 |
| 桌面 / WebGPU / 浅色 | `webgpu / full / ready` | 通过：静物边缘与细节保持可辨 |
| 桌面 / `?ambient=webgl2` | `webgl2 / balanced / ready` | 通过：6 个静物、2 只水母 |
| 桌面 / `?ambient=static` | `static / static / ready` | 通过：CSS 贝壳、海玻璃、珊瑚与海豚 |
| 移动 / WebGPU | `webgpu / balanced / ready` | 通过：无横向溢出 |

诊断属性：

- `data-entity-visual="marine-still-life"`
- `data-simulation-step="60hz"`
- 深浅主题分别为 `data-dolphin-eye="deep-ink-dark"` 和 `deep-ink-light`
- WebGPU 项目切牌后保持 `ready`，实体碎裂计数继续更新

### 固定时间步

- 30、60、120 FPS 各模拟 12 秒，均产生 720 个逻辑 tick。
- 2 秒长帧最多追赶 8 个 tick，并丢弃剩余过量时间。
- 海豚脊柱、静物、水母与像素使用前后状态插值，显示帧率只影响采样密度，不改变逻辑推进速度。
- 页面隐藏后暂停；恢复时清空 accumulator，不追赶不可见期间的时间。

### 质量门禁

- `bun test`：30 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- `git diff --check`：通过。
- 浏览器控制台：无 warning 或 error。
- 未修改 `D:\project\blog`。

### 结论

v0.7 满足海洋静物、双主题眼睛修正、固定时间步、WebGPU 优先和完整降级要求，可合并至 `develop`。

## 2026-08-22 / v0.7.1 接触质感与海花轮廓验收

### 视觉与尺寸

- 圆形实体已替换为原创五瓣有机海花，`data-relic-set="sea-bloom-sea-glass-coral"`。
- 桌面 WebGPU 初始最大半径不超过 `0.52`；移动 390 x 844 实测最大半径为 `0.415`。
- static 模式海花节点为 1，旧 `.ambient-static-shell` 节点为 0。
- 深浅主题和移动端均无水平溢出，正文、按钮与人像占位未被背景遮挡。

### 接触响应

- 接触模型为 `data-contact-model="soft-capped"`，速度上限为 `0.72`。
- 浏览器连续快速指针移动和点击测试中，最高观测速度为 `0.484`。
- 停止输入约一秒后速度衰减到 `0.078`，没有持续滑飞。
- 纯函数测试确认低恢复碰撞交换动量后速度为输入速度的 `0.28`，速度封顶保持原方向。

### 质量门禁

- `bun test`：31 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- `git diff --check`：通过。
- 浏览器控制台：无 warning 或 error。
- 未修改 `D:\project\blog`。

## 2026-08-22 / v0.7.2 温和生态与加权预算验收

### 物理表现

- WebGPU 桌面连续观察中，`data-coral-angle-deviation` 保持在 `0-0.011`，珊瑚受扰后回到生成姿态。
- `data-jelly-speed-max` 日常观测为 `0.02-0.09`，纯函数测试确认任何输入都会限制在 `0.24` 以内。
- 最末级碎片可以进入碎裂队列并彻底移除，运行会话中 `data-destroyed-count` 从 `0` 增加到 `12`。
- 实体移除会释放其专属 Shape、边线、细节几何和材质，并从活动数组删除。

### 加权补充

- 初始桌面权重为 `1.669`，下阈值为 `0.768`，上阈值为 `1.702`。
- 观察到权重依次下降至 `1.035`、`0.916`、`0.821`，随后越过下阈值并进入随机补充。
- 补充后权重回升，`data-regeneration` 回到 `idle`；上下阈值之间的滞回由纯函数测试覆盖。
- 生成位置位于视口边缘，新实体使用低初速度和 `0.9 s` 淡入，未出现正文后方突然跳出的大物体。

### 后端与响应式

| 场景 | 结果 |
| --- | --- |
| 桌面 WebGPU 深色与浅色 | `full / ready`，珊瑚和水母诊断正常 |
| 移动 390 x 844 WebGPU | `balanced / ready`，横向溢出为 0 |
| 桌面 WebGL2 | `balanced / ready`，6 个初始静物 |
| 桌面 static | `static / ready`，画布透明且静态珊瑚保留 |

### 质量门禁

- `bun test`：34 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- `git diff --check`：通过。
- 全新 1280 x 720 WebGPU 标签为 `full / ready`，横向溢出为 0，控制台无 warning 或 error。
- 未修改 `D:\project\blog`。

## 2026-08-22 / v0.8 叙事区块动效验收

### 动效与交互

- 文章标题与三行文章分别使用 Motion 的重复视口动画，离开文章区后实测透明度为 `0 / 0 / 0`，返回后可见行重新进入。
- 文章摘要使用原生 `button`、`aria-expanded` 与 `aria-controls`；点击后说明文本可见，收起后状态同步。
- 指针移动到文章行后，计算样式由单位矩阵变为低幅度 3D 矩阵，离开后由弹簧回正；连续值不进入 React state。
- 关于区实测完成 `visible -> hidden -> visible`，9 个子元素同步完成隐藏和重播；联系区 5 个子元素按序进入。
- 生活照片保持原第二张上移 18 px 的构图，进场与 hover 不改变最终布局。

### 浏览器矩阵

| 场景 | 结果 |
| --- | --- |
| 1280 x 720 / WebGPU / 深色 | 文章、关于、生活、联系动效可见，0 横向溢出 |
| 1280 x 720 / WebGPU / 浅色 | 文字、线条和文章占位图对比清晰，0 横向溢出 |
| 390 x 844 / WebGPU / 浅色 | 标题无裁切，摘要按钮 44 px，0 横向溢出 |
| 1280 x 720 / WebGL2 | 3 篇文章正常水合，0 横向溢出，无 console warning/error |
| 1280 x 720 / static | 3 篇文章正常水合，0 横向溢出，无 console warning/error |

### 无障碍与降级

- `prefers-reduced-motion` 下关闭区块位移、照片 hover、兴趣文字 hover、轴节点旋转、联系链接位移与文章占位图旋转。
- React 文章树不再被外部观察器提前写入属性，干净会话无 hydration mismatch。
- 当前浏览器接口不提供媒体特性模拟，因此低动态模式完成代码路径审计，未生成运行时媒体切换截图。

### 质量门禁

- `bun test`：34 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- `git diff --check`：通过。
- 未修改 `D:\project\blog`。

## 2026-08-23 / v0.9 海洋静物自然漂流验收

### 机制替换

- 运行时不再包含碎裂、销毁、权重阈值或边缘补充链路。
- `data-entity-model="fixed-drift"` 与 `data-contact-model="gentle-displacement"` 生效。
- 桌面固定 8 个静物，平衡质量和移动端固定 6 个；旧 `data-entity-weight`、`data-regeneration`、`data-fracture-count` 与 `data-destroyed-count` 均不存在。
- 静物越过带余量的视口后从相对侧回流，不再被夹到边界坐标。
- 海豚只做渐进排开，实体速度上限为 `0.30`，珊瑚角速度响应进一步缩减。

### 浏览器矩阵

| 场景 | 结果 |
| --- | --- |
| 1440 x 900 / WebGPU / 深色 | `webgpu / full / ready`，8 个实体，连续观察无边缘堆积 |
| 1440 x 900 / WebGPU / 浅色 | 8 个实体，静物、海豚眼睛与正文层级正常 |
| 390 x 844 / WebGPU / 浅色 | `webgpu / balanced / ready`，6 个实体，横向溢出为 0 |
| 390 x 844 / WebGL2 | `webgl2 / balanced / ready`，6 个实体 |
| 390 x 844 / static | `static / ready`，静态降级可见 |

### 自动化与质量门禁

- `bun test`：32 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- `git diff --check`：通过。
- 干净 WebGPU 标签运行约 2.5 秒后为 `ready`，逻辑 tick 持续推进，console 无 warning 或 error。
- 未修改 `D:\project\blog`。

## 2026-08-23 / v0.10 生物运动与选择性发光验收

### 根因与渲染边界

- 固定鱼影来自动态后端下仍保留 `0.07` 不透明度的 `.ambient-static-fallback`，不是 WebGPU 重复创建海豚。
- WebGPU 与 WebGL2 准备完成后，兜底层计算不透明度均为 `0`；static 模式仍为 `0.58`，画布不透明度为 `0`。
- 仅近景像素层拥有实例化辉光网格；海花、海玻璃、水母和海豚拥有独立 additive halo；珊瑚不发光。
- 深色运行时为 `data-glow-theme="bioluminescent"`，浅色为 `highlight`，发光层不改变正文或人像占位的布局。

### 水母生命感

- 水母使用 `data-jelly-motion="pulse-glide"`：快速收缩、短促推进、阻尼滑行和舒张复原形成完整循环。
- 朝向在推进阶段响应更明显，平时保留缓慢游移；显示阶段加入与朝向垂直的低幅度身体横摆。
- 触手链在固定逻辑步中保持头部连接，显示阶段的波动沿链向末端延迟传播。
- 发光采样纯函数验证亮度随推进达到峰值，随后回落到弱余辉，所有输出保持在 `[0, 1]`。

### 浏览器矩阵

| 场景 | 结果 |
| --- | --- |
| 默认桌面 / WebGPU / 深色 | `webgpu / full / ready`，兜底层为 0，生物发光可见 |
| 默认桌面 / WebGPU / 浅色 | `webgpu / full / ready`，兜底层为 0，仅保留弱高光 |
| 390 x 844 / WebGPU / 浅色与深色 | 横向溢出为 0，海豚、静物和正文层级正常 |
| 390 x 844 / WebGL2 | `webgl2 / balanced / ready`，固定步进与局部发光保留 |
| 390 x 844 / static | `static / static / ready`，静态兜底可见且画布透明 |

### 自动化与质量门禁

- `bun test`：33 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- `git diff --check`：通过。
- 浏览器各后端控制台均无 warning 或 error。
- 未修改 `D:\project\blog`。

## 2026-08-23 / v0.11 背景揭示与生物色差验收

### 首次进入状态机

- 首次打开时根节点为 `data-experience="loading"`，加载门可见、正文透明且带 `inert`。
- 背景首帧完成后写入 `data-ambient-ready="true"` 并进入 `ambient`；正文保持隐藏，画布向完整亮度过渡，后处理目标不透明度为 0。
- 随后进入 `entering`，正文从下方缓入，画布和后处理同步回到阅读态；最终为 `ready` 且正文移除 `inert`。
- WebGPU、WebGL2 与 static 均完成同一状态序列；WebGL2 初始化较慢时加载门不会提前放行正文。

### 生物反馈与颜色

- `data-jelly-propulsion="pulse-recoil"` 生效，水母最大诊断速度实测约 `0.17` 后衰减，低于 `0.24` 独立上限。
- 发光采样测试验证静息值低于 `0.05`，推进值高于静息值 `0.75` 以上，舒张阶段保留低幅余辉。
- 水母使用双层 additive halo，推进阶段同步提高钟形体、轮廓和触手亮度。
- 水母与静物色相偏移保持在蓝青色系的小范围内；珊瑚不参与 additive glow。

### 浏览器矩阵

| 场景 | 结果 |
| --- | --- |
| 1280 x 720 / WebGPU / 深色 | `webgpu / full / ready`，加载序列、阅读层级与辉光正常 |
| 1280 x 720 / WebGPU / 浅色 | 浅色弱高光、局部阅读柔化与正文对比正常 |
| 390 x 844 / WebGPU / 深浅主题 | Hero 无裁切，无实际横向滚动，正文和人像占位清楚 |
| 1280 x 720 / WebGL2 | `webgl2 / balanced / ready`，动态画布完成后 static fallback 为 0 |
| 1280 x 720 / static | `static / static / ready`，静态背景完成揭示并回到阅读态 |

### 自动化与质量门禁

- `bun test`：33 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- `git diff --check`：通过。
- 浏览器各后端控制台无 warning 或 error。
- `prefers-reduced-motion` 通过 static 选择逻辑、CSS 媒体覆盖和代码审计确认。
- 未修改 `D:\project\blog`。

## 2026-08-23 / v0.12 水母牵引与个人视觉舞台验收

### 首次进入时间线

- 硬重载记录为 `loading 37 ms`、`ambient 979 ms`、`entering 2656 ms`、`ready 4406 ms`。
- 水母先从下方进入，触手张力动画完成后海流和正文才开始上升；导航、Hero 叙事与视觉舞台拥有独立时长和错峰。
- `ready` 只在所有 Web Animations 完成后写入，临时内联样式随后清理，正文已移除 `inert`。
- `4.8 s` 故障保护保留，背景初始化失败时启动缩短编舞并最终释放正文。

### 视觉舞台交互

- 人物、现场和作品三个 tab 会同步更新取景框、图标、标签和图注。
- 上一张、下一张与左右方向键可以循环切换；移动布局保持语义按钮和触摸滑动分支。
- 指针视差使用 Motion value 与弹簧，React state 只记录离散模式和切换方向。
- 当前无真实素材时持续显示明确占位；组件已有 `src` 与 `alt` 分支供后续接入。

### 浏览器矩阵

| 场景 | 结果 |
| --- | --- |
| 1280 x 720 / WebGPU / 深色 | `webgpu / ready`，完整开场、舞台轨道和图注可见，0 横向溢出 |
| 1280 x 720 / WebGPU / 浅色 | 标签与取景引导线对比清晰，舞台底部约 `695 px` |
| 390 x 844 / WebGPU / 深色 | 舞台约 `327 px` 宽，三个模式与箭头完整，0 横向溢出 |
| 1280 x 720 / WebGL2 | `webgl2 / ready`，舞台存在且进入状态机完成 |
| 1280 x 720 / static | `static / ready`，静态背景完成同一编舞 |

### 自动化与质量门禁

- `bun test`：33 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- 最终 WebGPU 深色浏览器会话无 console warning 或 error。
- `prefers-reduced-motion` 通过短淡入逻辑、Motion hook、CSS 媒体覆盖和代码审计确认。
- 未修改 `D:\project\blog`。

## 2026-08-23 / v0.13 联系区信号港湾验收

### 视觉结构

- `.contact-section` 计算背景改为 `rgb(var(--page-rgb) / 0.9)`，不再使用 `var(--accent)` 大色块。
- 深色主题中海流、浮标和背景生物只作为低对比层；浅色主题中结构线与正文对比清晰。
- 博客占据桌面轨道左侧，GitHub、简历和邮箱在右侧三行排列；各入口之间通过分隔线而不是独立卡片组织。
- 简历和邮箱没有链接或虚假点击，只显示等待真实内容的状态。

### 交互与响应式

- 博客和 GitHub hover 局部显示 9% accent 背景，图标与箭头短距离移动。
- `390 x 844` 下四个入口改为单列，轨道约宽 `335 px`，备案号完整显示。
- 桌面与移动端文档横向溢出为 0。
- 最终 WebGPU 深色浏览器会话为 `ready`，无 console warning 或 error。

### 自动化与质量门禁

- `bun test`：33 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- `git diff --check`：通过。
- `prefers-reduced-motion` 禁用信号脉冲、入口、图标和箭头位移。
- 未修改 `D:\project\blog`。

## 2026-08-23 / v0.14 水母牵引节奏与柔性运动验收

### 开场编舞

- 正常编舞配置总时长约 `4.87 s`，相比 v0.12 增加约 `1.55 s`；快速故障保护路径保持原短时长。
- Hero 文本与视觉舞台在前 `18%` 只移动少量距离，随后与水母和海流同步上升，末段轻微越位后回正。
- 根节点完成 `ambient -> entering -> ready`，并留下 `data-choreography-phase="complete"` 诊断。
- reduced motion 继续跳过水母装置，只执行 `220 ms` 淡入。

### 水母生命感

- `sampleJellyPose` 测试覆盖静息、推进、最大收缩和周期闭合；钟形体横向比例保持在 `0.87-1`，纵向比例保持在约 `0.975-1.055`。
- 触手显示波幅限制在 `0.006-0.024`，根部不再叠加独立高频正弦摆动。
- 推进时不再提高转向增益，显示层移除独立横摆；固定步进中的位置、速度、朝向与触手链仍和渲染帧率解耦。

### 浏览器矩阵

| 场景 | 结果 |
| --- | --- |
| 1280 x 720 / WebGPU / 深色 | `full / ready`，背景水母与正文层级正常，0 横向溢出 |
| 1280 x 720 / WebGPU / 浅色 | 背景水母可辨认，正文对比清晰，0 横向溢出 |
| 390 x 844 / WebGPU / 浅色 | `balanced / ready`，2 只水母，速度约 `0.059`，0 横向溢出 |
| 1280 x 720 / WebGL2 | `balanced / ready`，`60hz` 固定步进，速度低于 `0.24` 上限 |
| 1280 x 720 / static | `static / ready`，兜底层不透明度 `0.58` |

### 自动化与质量门禁

- `bun test`：34 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- `git diff --check`：通过。
- 未修改 `D:\project\blog`。

## 2026-08-23 / v0.15 整页物理牵引验收

### 运动与受力关系

- 桌面端以约 `180 ms` 间隔采样，正文与页面前沿依次经过约 `691 / 685 / 668 / 648 / 586 / 430 / 259 / 142 / 79 / 38 / 14 / 3 / 0 px`，每个采样点的 `Y` 坐标一致。
- 主牵引阶段水母与页面前沿保持约 `203 px` 的固定垂直距离，触手末端落在前沿附近，不再表现为独立上升。
- 张力承载使用 `cubic-bezier(0.45, 0, 0.55, 1)`，主牵引使用 `cubic-bezier(0.45, 0, 0.18, 1)`；两个阶段起止速度连续回到零，没有线性匀速或突然刹停。
- 正文没有淡入关键帧，页面主体完全依靠真实 `translate3d` 位移进入。

### 深链接与状态

- `#contact` 刷新实测保留约 `scrollY=4277`，正文使用 `inset(4276.67px 0 0)` 裁切边界，前一个区块没有穿过页面前沿。
- 联系区标题在牵引阶段保持 `opacity: 1`，完成后为 `data-reveal-state="visible"`，普通滚动进退场随后正常接管。
- `loading`、`ambient` 和 `entering` 的根元素 `overflow` 均为 `hidden`；完成后恢复 `visible`。
- 完成后正文不再带 `inert`，内联 `transform`、`clip-path` 与 `will-change` 均已清空。

### 浏览器矩阵

| 场景 | 结果 |
| --- | --- |
| 1280 x 720 / WebGPU / 深色 | 整页前沿、触手与水母同步，完成后 0 横向溢出 |
| 1280 x 720 / WebGPU / 浅色 | `webgpu / ready`，编舞约 `5205 ms`，临时样式已清理 |
| 390 x 844 / WebGPU / 深浅主题 | 牵引关系清楚，Hero 无裁切，无有效横向滚动 |
| 1280 x 720 / WebGL2 / 浅色 | `webgl2 / ready`，编舞约 `5205 ms` |
| 1280 x 720 / static / 浅色 | `static / ready`，编舞约 `5112 ms` |
| 1280 x 720 / WebGPU / `#contact` | 当前区块随整页进入，完成后保持深链接滚动位置 |

### 自动化与质量门禁

- `bun test`：34 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- `git diff --check`：通过。
- `prefers-reduced-motion` 通过 `220 ms` 短淡入分支和 CSS 媒体覆盖代码审计确认。
- 未修改 `D:\project\blog`。

## 2026-08-23 / v0.16 牵引首帧防闪验收

### 首帧状态

- 修复前复现值为 `data-choreography="active"`、阶段未开始、水母 `opacity: 1`、`transform: none`、`Y=0`。
- 修复后同一时序点水母为 `opacity: 0`、`Y=112vh`，海流前沿为 `opacity: 0`、`Y=100vh`。
- `arrival` 首个关键帧与 CSS 初始姿态完全一致，不会在动画接管时发生位置跳变。
- `#about` 深链接在加载门退场后的第一张背景画面中不再出现右上角牵引水母。

### 范围

- 只修改开场装置的基础初始姿态，不改变 v0.15 的贝塞尔曲线、时长、整页裁切和区块显现逻辑。
- 未修改 `D:\project\blog`。

### 自动化与质量门禁

- `bun test`：34 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- `git diff --check`：通过。

## 2026-08-23 / v0.17 结构光与空闲视差验收

### 材质与交互

- 背景结构光由两个宽幅斜向光带组成，周期分别为 `16 s` 与 `18 s`，没有彩虹色相漂移。
- Hero 空闲姿态在连续采样间发生低幅变化；指针输入优先，光带只在视觉视口内部出现。
- 项目卡空闲姿态在约 `900 ms` 间隔采样中持续变化，没有位置跳变。
- 深色悬浮测试中，活动卡结构光透明度由 `0.24` 提高至 `0.42`；指针移出后 `data-pointer-active` 清除并恢复空闲轨道。
- 切牌完成后活动材质层为 1，过渡材质层为 0，没有前后卡同时扫光。

### 浏览器矩阵

| 场景 | 结果 |
| --- | --- |
| 当前桌面预览窗 / WebGPU / 深色 | `ready`，Hero、背景和活动卡层级正常 |
| 390 x 844 / WebGPU / 浅色 | `ready`，正文对比清晰，无有效横向溢出 |
| 390 x 844 / WebGL2 / 浅色 | `ready`，结构光层数量为 2 |
| 390 x 844 / static / 浅色 | `ready`，结构光层数量为 2 |
| 项目卡切换 | 切换到“商业 C++ 开发”后回到 `ready`，链接和详情结构未受影响 |

### 自动化与质量门禁

- `bun test`：36 passed、0 failed；新增空闲视差幅度边界与周期连续性测试。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- `git diff --check`：通过。
- `prefers-reduced-motion` 与 `prefers-reduced-transparency` 通过 CSS 媒体覆盖和 Motion 低动态分支代码审计确认。
- 未修改 `D:\project\blog`。

## 2026-08-23 / v0.18 局部环境照明验收

### 光源与环境响应

- `sampleLocalLightInfluence` 在光源中心返回峰值，随距离平滑衰减，在半径外归零。
- 多光源影响可以叠加，但会被调用方提供的最大值封顶，避免重叠光源把背景洗白。
- 水母、发光静物、海豚和近景发光粒子共用同一光源列表；光场位置和受光采样来自同一帧的插值坐标。
- 静物、像素粒子和海流曲线会响应附近光源，发光不再局限于物体自身 halo。
- 局部光只在渲染阶段计算，固定 `60 Hz` 仿真时钟和逻辑更新顺序保持不变。

### 浏览器矩阵

| 场景 | 结果 |
| --- | --- |
| 当前桌面预览窗 / WebGPU / 深色完整背景 | `webgpu / ready`，20 个光源，水母软亮区和海流局部提亮可见 |
| 当前桌面预览窗 / WebGPU / 深色正文 | 画布透明度 `0.56`，局部光仍可辨认，Hero 文案对比清晰 |
| 当前桌面预览窗 / WebGPU / 浅色正文 | 画布透明度 `0.54`，实体轮廓可见，局部蓝色高光没有冲淡正文 |
| 390 x 844 / WebGPU / 深浅主题 | 移动平衡质量为 13 个光源，完整背景与正文阶段均无有效横向溢出 |
| 当前桌面预览窗 / WebGL2 / 深色 | `webgl2 / ready`，13 个光源，径向光场和受光曲线正常 |
| 当前桌面预览窗 / static / 深色 | `static / ready`，动态光源为 0，固定弱径向亮区正常 |

### 自动化与质量门禁

- `bun test`：38 passed、0 failed；新增距离衰减与多光源叠加封顶测试。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- `git diff --check`：通过。
- 页面完整背景与正文阅读阶段均完成视觉检查。
- 未修改 `D:\project\blog`。

## 2026-08-23 / v0.19 有机珊瑚与环境明暗验收

### 视觉与范围

- 动态珊瑚包含海扇、鹿角分枝和管状珊瑚簇三种轮廓，不再复用同一硬折线形状。
- 海扇叶脉、鹿角分叉和管口细节在低透明度下仍提供不同的识别线索。
- 浅色主题只增强珊瑚描边和纹理，正文背景没有被整体加深。
- 全页背景扫光结构、样式和关键帧已删除；Hero 视觉舞台与当前项目卡内部的材质光保持原行为。
- 局部环境光、海流受光、像素纵深和生物发光继续承担背景明暗对比。

### 浏览器矩阵

| 场景 | 结果 |
| --- | --- |
| 1440 x 900 / WebGPU / 深色 | `full / ready`，8 个实体，珊瑚可区分，全页扫光节点为 0 |
| 1440 x 900 / WebGPU / 浅色 | 珊瑚描边与叶脉可见，Hero 文字对比清晰 |
| 390 x 844 / WebGPU / 深色 | `balanced / ready`，6 个实体，首屏没有文字裁切或元素重叠 |
| 1280 x 720 / WebGL2 / 深色 | `balanced / ready`，6 个实体，全页扫光节点为 0 |
| 1280 x 720 / static / 深色 | `static / ready`，海扇降级轮廓存在，全页扫光节点为 0 |

### 自动化与质量门禁

- `bun test`：38 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `git diff --check`：通过。
- `bun run build`：2 个静态路由构建成功。
- 未修改 `D:\project\blog`。

## 2026-08-23 / v0.20 区块引导与水母蓄力冲击验收

### 动效与导航

- Hero 文案、个人视觉舞台和引导分别拥有 `hidden` 与 `visible` 姿态，滚回首屏后重复显现。
- 页面包含 6 个 `SectionGuide`，目标依次为 `#about`、`#projects`、`#articles`、`#life`、`#contact` 和 `#top`。
- 每个引导都具备 `aria-label` 和 `title`，使用现有 Phosphor 图标，没有增加文字式滚动提示。
- `charge` 阶段的正文容器尚未移动；`impulse` 阶段才建立正文、海流和水母的同步上移。
- 钟形体、触手、光环和页面只动画 `transform` 与 `opacity`。
- 低动态路径继续使用 `220 ms` 淡入，新增循环提示会被全局低动态规则关闭。

### 浏览器矩阵

| 场景 | 结果 |
| --- | --- |
| 1440 x 900 / WebGPU / 深色 | `ready / complete`，Hero 引导位于首屏底部，文案与视觉舞台无重叠 |
| WebGPU / 浅色 | 页面基底为 `#f7f8f6`，引导使用深灰蓝前景，保持清晰可见 |
| Hero 滚出并返回 | 文章区时为 `hidden`，返回顶部后文案、舞台、引导均为 `visible` |
| 六段翻页链路 | 六个哈希和目标区块状态均正确，联系区可返回 `#top` |
| 390 x 844 / WebGPU / 深色 | 6 个引导存在，Hero 引导在正常文档流中，不遮挡内容 |
| 390 x 844 / WebGL2 | `webgl2 / ready / complete`，6 个引导存在，无横向溢出 |
| 390 x 844 / static | `static / ready / complete`，6 个引导存在，无横向溢出 |
| 控制台 | WebGPU 与 static 均无 warning 或 error |

### 自动化与质量门禁

- `bun test`：38 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `git diff --check`：通过。
- `bun run build`：2 个静态路由构建成功。
- 未修改 `D:\project\blog`。

## 2026-08-23 / v0.20 连续牵引修复验收

### 根因与实现

- 修复前，冲击动画结束后会等待带 `0 / 12 / 24 / 36 ms` 延迟的四根触手，再创建牵引动画。
- 修复前冲击曲线末端速度为零，牵引曲线起始速度较高，因此即使没有真实掉帧也会表现为停顿后突然加速。
- 修复后页面、水母与海流只创建一条从冲击起点到牵引终点的 WAAPI 动画，阶段标记由计时器更新，不参与运动调度。
- 两段曲线使用关键帧级 easing；交界位移按端点斜率和实际时长求解，正常路径与快速路径的计算速度差均低于浮点误差。
- 钟形体、光环和触手使用同一个总时长，触手形态错峰通过内部关键帧 offset 表达，不再使用 delay。

### 浏览器矩阵

| 场景 | 结果 |
| --- | --- |
| 1440 x 900 / WebGPU | `webgpu / ready / complete`，交界有效帧间隔最高 `20 ms`，无反向位移，横向溢出为 0 |
| 390 x 844 / WebGPU | `webgpu / ready / complete`，交界有效帧间隔最高 `21 ms`，正文与前沿同步，无反向位移 |
| 1280 x 720 / WebGL2 | `webgl2 / ready / complete`，交界有效帧间隔最高 `20 ms`，横向溢出为 0 |
| 1280 x 720 / static | `static / ready / complete`，交界有效帧间隔最高 `21 ms`，横向溢出为 0 |
| 控制台 | WebGPU、WebGL2 与 static 均无 warning 或 error |

移动 WebGPU 完成后 `scrollWidth` 比视口宽 `6 px`，来源是原有离屏背景装饰的变换包围盒，不是正文、页面前沿或本次连续牵引时间线。该装饰层不在本次修复范围内。

### 自动化门禁

- `bun test`：38 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `bun run build`：2 个静态路由构建成功。
- `git diff --check`：通过。
- 未修改 `D:\project\blog`。

## 2026-08-23 / v0.21 平滑运动节奏验收

### 动效与性能

- 页面、水母与海流前沿使用一条完整时长位移曲线，`impulse` 与 `tow` 标记不再切换运动函数。
- 移动端使用导航与 Hero 两个视口内合成层，屏幕外章节在牵引期间不绘制；桌面端继续使用单一正文层。
- Hero 待机视差、打字机和 CSS 循环在 `homepage:experience-ready` 后启动。
- 背景遥测写入为 `4 Hz`，固定 `60 Hz` 仿真保持不变。
- 最终采样无反向帧，导航与 Hero 的同步偏差低于 `0.001 px`。

### 浏览器矩阵

| 场景 | 结果 |
| --- | --- |
| 1440 x 900 / WebGPU | 两次均为 136 个有效位置帧，`p95 19-20 ms`，最大 `32-34 ms`，超过 `24 ms` 各 2 次 |
| 390 x 844 / WebGPU | 两次均为 136 个有效位置帧，`p95 19-21 ms`，最大 `31 ms`，超过 `24 ms` 为 1-4 次 |
| 1280 x 720 / WebGL2 | `webgl2 / ready / complete`，无反向位移，临时样式已清理，横向溢出为 0 |
| 1280 x 720 / static | `static / ready / complete`，无反向位移，临时样式已清理，横向溢出为 0 |
| 1440 x 900 / `#contact` | 牵引期间不启用首屏裁剪，完成后保留目标哈希与滚动位置 |
| 控制台 | warning 与 error 均为 0 |

### 自动化门禁

- `bun test`：38 passed、0 failed。
- `bun run check`：0 errors、0 warnings、0 hints。
- `git diff --check`：通过。
- `bun run build`：2 个静态路由构建成功。
- 未修改 `D:\project\blog`。
