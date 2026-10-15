# 项目长期记忆

## 项目：海报工坊（微信小程序）

- 形态：微信原生小程序（WXML/WXSS/JS），**不使用**任何前端框架或打包器。
- 后端：WorkBuddy Cloud，云服务应用 ID `wbapp_RKMsdv785EYm9zo0aM2r0m`。
- SDK：`@tencent-ai/workbuddy-cloud-sdk@dev`，走 `/miniprogram` 子路径的
  `createMiniProgramWorkBuddyCloud`；调试日志用 `utils/workbuddy-cloud-diagnostics.js`
  的 `createDiagnosticWx(wx)` 包一层。

### 必须遵守的约定
- **不要硬编码 endpoint / publishableKey**：唯一来源是 `utils/cloud.js` 里的 `publicConfig`，
  该值由云服务开通时返回。miniprogram 的 endpoint 是平台固定网关，不是自有域名。
- **`owner_id` 一律不由前端发送**：数据库靠 `DEFAULT auth.uid()` 填充，RLS 的
  `WITH CHECK (owner_id = auth.uid())` 负责防伪造。
- **WXML 表达式不是 JS**：不用 `?.`、`??`、箭头函数、方法调用，复杂逻辑先在 Page JS 里算好再 setData。
- **所有 chat 调用必须带 `system` 消息且 `stream: true`**，非流式会被 SDK 直接拒绝。
- 海报模板图层匹配一律按 `slot`（`layer.slot || layer.id`），不做按数组下标的回退。

### 数据表
| 表 | 读 | 写 |
|---|---|---|
| `poster_materials` | 公开（内置素材对所有人生效） | 仅本人 |
| `poster_templates` | 公开 | 仅本人 |
| `poster_records` | 仅本人 | 仅本人 |

### 已知未验证项
AI 图像模型（`hunyuan-image-alpha`）的实际返回形态（base64 / URL）尚未真机验证，
`utils/ai.js` 的 `extractImagePayload` 做了两种兼容。真机调试时优先确认这一处。