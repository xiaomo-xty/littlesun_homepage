export type ProjectLink = {
  label: string;
  href: string;
  kind: "source" | "demo" | "case-study";
};

export type ProjectAttribute = {
  label: string;
  value: string;
};

export type Project = {
  id: string;
  category: "project" | "experience" | "open-source" | "direction";
  kind: string;
  title: string;
  status: string;
  summary: string;
  problem: string;
  process: string;
  evidence: string;
  technologies: string[];
  attributes: ProjectAttribute[];
  mediaLabel: string;
  links: ProjectLink[];
};

export const projects: Project[] = [
  {
    id: "scenescope",
    category: "project",
    kind: "PROJECT / CURRENT",
    title: "SceneScope",
    status: "进行中",
    summary: "检查资产，但不创作资产。",
    problem: "让陌生 GLB 的结构、预算与明显质量问题更容易被发现。",
    process: "先交付 Windows 与 Web 的同一帧，再逐步加入检查规则与报告。",
    evidence: "仓库、Demo、运行截图与性能记录将在实际完成后接入。",
    technologies: ["Rust", "wgpu", "WebGPU", "Wasm"],
    attributes: [
      { label: "形态", value: "跨平台 3D 资产检查工具" },
      { label: "当前目标", value: "Windows 与 Web 同一帧" },
    ],
    mediaLabel: "SceneScope 真实运行截图待补充",
    links: [],
  },
  {
    id: "commercial-cpp",
    category: "experience",
    kind: "EXPERIENCE / C++",
    title: "商业 C++ 开发",
    status: "可公开范围",
    summary: "维护底层代码，也追踪数据如何穿过复杂系统。",
    problem: "PDF 页面对象、图片编解码与跨模块数据路径中的稳定性问题。",
    process: "从现象和最小复现出发，用调试、测试与文档形成证据链。",
    evidence: "仅展示不涉及公司机密、内部样本与协议细节的经验。",
    technologies: ["C++", "Debugging", "Performance", "Systems"],
    attributes: [
      { label: "范围", value: "底层维护与数据路径" },
      { label: "方法", value: "调试、测试与证据链" },
    ],
    mediaLabel: "可公开的工作样例待补充",
    links: [],
  },
  {
    id: "bevy",
    category: "open-source",
    kind: "OPEN SOURCE / LEARNING",
    title: "Bevy 协作路线",
    status: "准备中",
    summary: "把成熟引擎源码阅读转化为可验证的协作记录。",
    problem: "理解资产、渲染与窗口模块如何在真实开源工程中协作。",
    process: "按复现、文档、测试、小型缺陷的顺序参与，不挤占主项目。",
    evidence: "正式 Issue 与贡献链接将在实际发生后接入。",
    technologies: ["Rust", "Bevy", "Open Source"],
    attributes: [
      { label: "协作方式", value: "Issue、文档、测试" },
      { label: "节奏", value: "主项目之外持续推进" },
    ],
    mediaLabel: "开源协作证据待补充",
    links: [],
  },
  {
    id: "ue5",
    category: "direction",
    kind: "COMPATIBILITY / DIRECTION",
    title: "UE5 工具方向",
    status: "按岗位补充",
    summary: "为商业游戏岗位保留工具与资源检查方向的兼容入口。",
    problem: "连接现有 C++ 经验与引擎编辑器、资源管线岗位要求。",
    process: "在 SceneScope v0.1 后，根据真实岗位反馈安排短周期验证。",
    evidence: "没有完成的插件和案例不会提前展示为成果。",
    technologies: ["C++", "UE5", "Editor Tools"],
    attributes: [
      { label: "兼容目标", value: "编辑器与资源管线" },
      { label: "触发条件", value: "根据真实岗位反馈" },
    ],
    mediaLabel: "UE5 工具案例待实际完成后补充",
    links: [],
  },
];

