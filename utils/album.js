/**
 * 保存到系统相册。
 *
 * 平面工坊默认不登录，游客做完的图必须能直接存下来，
 * 所以这里完全不依赖登录态，只处理相册授权：
 * 没授权过就弹授权；之前被拒过则引导去设置页，而不是直接报失败。
 */

const SCOPE = 'scope.writePhotosAlbum'

function readScope() {
  return new Promise((resolve, reject) => {
    wx.getSetting({
      success: (res) => {
        const value = res.authSetting && res.authSetting[SCOPE]
        resolve(value === true ? true : value === false ? false : null)
      },
      fail: () => reject(new Error('无法读取授权设置'))
    })
  })
}

function requestScope() {
  return new Promise((resolve, reject) => {
    wx.authorize({
      scope: SCOPE,
      success: () => resolve(true),
      fail: () => reject(new Error('未开启相册权限'))
    })
  })
}

function openSetting() {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: '需要相册权限',
      content: '保存图片需要访问相册，是否去设置里开启？',
      confirmText: '去设置',
      cancelText: '暂不',
      success: (modal) => {
        if (!modal.confirm) {
          reject(new Error('未开启相册权限'))
          return
        }
        wx.openSetting({
          success: (res) => {
            const value = res.authSetting && res.authSetting[SCOPE]
            value ? resolve(true) : reject(new Error('未开启相册权限'))
          },
          fail: () => reject(new Error('未开启相册权限'))
        })
      },
      fail: () => reject(new Error('未开启相册权限'))
    })
  })
}

function ensureScope() {
  return readScope().then((value) => {
    if (value === true) return true
    if (value === false) return openSetting()
    return requestScope()
  })
}

/**
 * 把图片存进系统相册。
 * @param filePath 本地临时文件路径
 * @returns Promise<filePath>；授权被拒时 reject，调用方需自行决定是否阻断
 */
function saveToAlbum(filePath) {
  if (!filePath) return Promise.reject(new Error('没有可保存的图片'))
  return ensureScope().then(
    () =>
      new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath: filePath,
          success: () => resolve(filePath),
          fail: (error) => reject(new Error((error && error.errMsg) || '保存失败'))
        })
      })
  )
}

module.exports = { saveToAlbum, ensureScope, SCOPE }
