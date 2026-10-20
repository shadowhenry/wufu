const { createMiniProgramWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram')
const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics')

// 由云服务环境开通时返回的公开配置，只有这三个值可以进前端代码。
const publicConfig = {
  endpoint: 'https://mp-api.app.workbuddy.host',
  publishableKey: 'wbpk_nFRDBx0LsMuRQR5dySL9iu_EWiq5Ny4ZxAY1RsutU6yyMtElfTZ02Le'
}

const cloud = createMiniProgramWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  publishableKey: publicConfig.publishableKey,
  wx: createDiagnosticWx(wx)
})

module.exports = { cloud, publicConfig }