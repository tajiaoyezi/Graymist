// §8.4 i18n 资源表（单语言：中文）。界面文案不硬编码，全部走此表（key→文案）。
// v1.5 增加多语言时，新增 en.ts 等并接 LanguageSwitcher，无需改动组件（D14）。
export const zh = {
  app: { title: "Graymist 模型仓库" },
  nav: { models: "模型仓库", create: "创建模型" },
  filter: { taskType: "任务类型", all: "全部" },
  search: { placeholder: "搜索模型名称" },
  taskType: {
    classification: "分类",
    generation: "生成",
    embedding: "嵌入",
    custom: "自定义",
  },
  framework: { PyTorch: "PyTorch", ONNX: "ONNX", TensorRT: "TensorRT" },
  status: {
    draft: "草稿",
    validating: "验证中",
    ready: "就绪",
    archived: "已归档",
  },
  action: {
    transitionTo: "→ {{status}}",
    submit: "提交",
    create: "创建",
    newVersion: "新建版本",
    delete: "删除",
  },
  field: {
    name: "名称",
    description: "描述",
    status: "状态",
    inputSchema: "输入 Schema",
    outputSchema: "输出 Schema",
    filePath: "文件路径（模拟）",
    framework: "框架",
    resourceReq: "资源需求",
    changeNote: "变更说明",
    createdAt: "创建时间",
    deployable: "可部署",
    yes: "是",
    no: "否",
  },
  metrics: { title: "性能指标", accuracy: "准确率", latency: "延迟", throughput: "吞吐" },
  version: { list: "版本列表", compare: "版本对比", detail: "版本详情" },
  error: { schema: "Schema 不合法", required: "必填项" },
};

export type Resource = typeof zh;
