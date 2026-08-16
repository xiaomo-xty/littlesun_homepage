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
