// 测试用的空 SDK 实现：仅让 utils/cloud.js 能被 require 进来。
// 被测逻辑通过给 cloudStub 注入替身来驱动，不依赖真实 SDK。
let currentClient = null

function setCloud(client) {
  currentClient = client
}

function getCloud() {
  return currentClient
}

module.exports = {
  setCloud: setCloud,
  getCloud: getCloud,
  createMiniProgramWorkBuddyCloud: function () {
    // 每次构造都返回注入的替身；未注入时给出空壳，避免测试崩在属性访问上
    return currentClient || {
      auth: {},
      database: {},
      storage: {},
      llm: {}
    }
  }
}