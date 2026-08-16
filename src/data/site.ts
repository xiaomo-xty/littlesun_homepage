export type SiteLink = {
  label: string;
  href: string | null;
  external?: boolean;
};

export const site = {
  title: "[姓名 / 常用身份]",
  description:
    "关注高性能图形、游戏引擎工具与跨平台系统的工程师个人主页。",
  domain: "littlesun.space",
  blog: "https://blog.littlesun.space",
  direction: ["高性能图形", "游戏引擎工具", "跨平台系统"],
  introduction:
    "我在真实项目里处理数据、性能和失败路径，也用 Rust + wgpu 把这些经验带向跨平台图形工具。",
} as const;

export const primaryLinks: SiteLink[] = [
  { label: "博客", href: site.blog, external: true },
  { label: "GitHub 待补充", href: null },
  { label: "简历待补充", href: null },
  { label: "邮箱待补充", href: null },
];

