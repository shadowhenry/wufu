const { createMiniProgramWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram')
const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics')

// 由云服务环境开通时返回的公开配置，只有这三个值可以进前端代码。
const publicConfig = {
  endpoint: 'https://mp-api.app.workbuddy.host',
  publishableKey: 'wbpk_RKMsdv785EYm9zo0aM2r0m_FJ0fnjC6FDhP6C4dH7bQEwioLfjlrg4j'
}

const cloud = createMiniProgramWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  publishableKey: publicConfig.publishableKey,
  wx: createDiagnosticWx(wx)
})

module.exports = { cloud, publicConfig }