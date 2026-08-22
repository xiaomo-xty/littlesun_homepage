# 开发路线

## 设计基线

- Penpot 文件：`3be9e5e1-190f-8090-8008-7cb1a27d48c7`
- 桌面 V6：`6ba7beb9-3136-80d4-8008-7d72f290f259`
- 移动 V6：`6ba7beb9-3136-80d4-8008-7d72f65b3821`
- 视觉参数：`variance 7 / motion 7 / density 3`

## 阶段

### Foundation

- Astro + Bun 工程骨架
- 语义颜色、排版、间距和双主题变量
- 内容数据结构与明确占位符
- 基础 SEO、图标和无障碍入口

### Narrative

- 首屏个人身份与职业方向
- 关于我、代表项目、代表文章、生活侧面与联系
- 桌面与移动端响应式布局

### Interaction

- 主题切换与系统主题同步
- Hero 分层实时背景、像素粒子和打字机效果
- 弹性按钮、卡牌翻转、切牌、触摸滑动与键盘操作
- `prefers-reduced-motion`、低性能和 WebGL 失败降级

### Verification

- Astro 类型检查与生产构建
- 桌面和移动端视觉验收
- 文字裁切、元素重叠、对比度与键盘操作检查
- WebGL 非空画布、可见性暂停和静态降级检查

### v0.6 Space Ocean Creatures

- 独立海豚动画 Demo 与随机 Bézier 路径审核完成
- 远、中、近三层像素纵深完成
- 脉冲水母与短触手链完成
- 同侧海豚、水母和像素生态已集成主页 `AmbientWorld`
- WebGPU、WebGL2、static、深浅主题与移动端验收完成

### v0.7 Marine Still Life and Fixed Simulation

- 抽象几何实体已替换为贝壳、海玻璃和珊瑚碎枝
- 暗色主题海豚眼睛已改为深墨色并与身体同步淡化
- 背景逻辑已改为 60 Hz 固定时间步，显示帧只负责插值渲染
- WebGPU、WebGL2、static、深浅主题与移动端回归完成

## 非目标

- 不修改 `D:\project\blog`
- 不实现博客系统、后台或 CMS
- 不伪造个人资料、项目成果、文章发布状态或性能数据
- 不直接使用受版权保护的游戏和动画角色素材
- 不扩展成通用设计系统
