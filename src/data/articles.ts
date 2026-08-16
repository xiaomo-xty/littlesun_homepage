export type Article = {
  title: string;
  topic: string;
  status: "占位" | "已发布";
  description: string;
  href: string | null;
};

export const articles: Article[] = [
  {
    title: "从 Box.glb 到 Windows 与 Web 第一帧",
    topic: "跨平台渲染 / 项目记录",
    status: "占位",
    description: "等待真实里程碑完成后，以运行结果、差异和验证过程为依据撰写。",
    href: null,
  },
  {
    title: "glTF 数据如何进入 GPU",
    topic: "资产管线 / 图形基础",
    status: "占位",
    description: "围绕真实资产路径记录解析、内部模型与渲染资源之间的边界。",
    href: null,
  },
  {
    title: "一次由证据驱动的性能修复",
    topic: "调试 / 性能分析",
    status: "占位",
    description: "仅在有可复现现象、测量条件、根因和回归验证后发布。",
    href: null,
  },
];

