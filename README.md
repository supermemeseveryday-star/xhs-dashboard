# 📕 小红书内容工作台

一站式小红书内容生产流水线管理系统。

## 功能模块

| 模块 | 功能 |
|------|------|
| 📡 信源采集 | 添加公开一手资料，标记平台/关键事实/互动数据，核验→归档流程 |
| 📋 选题审批 | 看板拖拽审批（待审批→已批准→已拒绝），关联信源，一键转草稿 |
| ✍️ 内容生产 | 富文本编辑器 + Voice规范侧边栏 + 发布前自检清单 + AI腔检测 |
| 🔍 事实编辑 | 逐条核查声明 vs 原始链接，三级判定（准确/需修改/不实） |
| 📈 数据复盘 | 录入已发布笔记数据，自动排行/指标卡/试验建议/明细表 |

## 设计原则

- ❌ 不追热点 → 选题必须有信源依据 + 审批流程
- ❌ 不补数字 → Voice 红线禁止编造数据、假装亲测
- ❌ 不自动发布 → 事实编辑只审不发，发布需手动确认
- ✅ 只读数据 → 复盘模块只能录入，不改已发布内容

## 使用方式

直接浏览器打开 `index.html` 即可使用，所有数据存储在浏览器 localStorage。

支持导入/导出 JSON 备份。

## 技术栈

- 纯 HTML/CSS/JavaScript，无依赖
- localStorage 持久化
- 响应式设计，支持移动端
- 暗色主题

## 部署

### GitHub Pages
```bash
# 推送到 GitHub 后，在仓库 Settings → Pages 中开启
# 访问 https://your-username.github.io/xhs-dashboard/
```

### Netlify
直接拖拽文件夹到 https://app.netlify.com/drop

### 本地运行
```bash
python3 -m http.server 8080
# 访问 http://localhost:8080
```

## 文件结构

```
xhs-dashboard/
├── index.html    # 完整应用（单文件）
├── README.md     # 本文件
└── screens/      # 截图
```

## License

MIT
