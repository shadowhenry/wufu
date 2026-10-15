Component({
  properties: {
    message: { type: String, value: '' },
    type: { type: String, value: 'info' }
  },

  data: {
    visible: false,
    current: '',
    kind: 'info'
  },

  lifetimes: {
    attached() {
      // 页面 bind:ready 拿到这个事件后把实例登记到 app，reportError 即可直接调用
      this.triggerEvent('ready', { notice: this }, { bubbles: false })
    },
    detached() {
      const app = getApp()
      if (app && typeof app.unregisterNotice === 'function') {
        app.unregisterNotice(this)
      }
    }
  },

  methods: {
    /** 对外方法：显示一条内联提示，自动消失 */
    show(options) {
      const config = options || {}
      const message = config.message || ''
      if (!message) return
      const type = config.type || 'info'
      const duration = config.duration === undefined ? 3200 : config.duration
      this.setData({ visible: true, current: message, kind: type })
      if (this.timer) clearTimeout(this.timer)
      if (duration > 0) {
        this.timer = setTimeout(() => {
          this.setData({ visible: false })
        }, duration)
      }
    },

    dismiss() {
      if (this.timer) clearTimeout(this.timer)
      this.setData({ visible: false })
    }
  }
})