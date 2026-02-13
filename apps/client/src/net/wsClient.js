const WS_BASE = import.meta.env?.VITE_WS_BASE_URL || '';

function wsUrl(path) {
  if (WS_BASE) return `${WS_BASE}${path}`;
  // default: same-origin wss
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${path}`;
}

export class WsClient {
  constructor({ onMessage, onOpen, onClose, onStatus }) {
    this.onMessage = onMessage
    this.onOpen = onOpen
    this.onClose = onClose
    this.onStatus = onStatus

    this.ws = null
    this._closedByUser = false
    this._reconnectTimer = 0
    this._attempt = 0
    this.status = 'off' // off|connecting|ok
  }

  _setStatus(s) {
    this.status = s
    this.onStatus?.(s)
  }

  connect() {
    if (this.ws) return
    this._closedByUser = false

    this._setStatus('connecting')
    const ws = new WebSocket(wsUrl('/ws'))
    this.ws = ws

    ws.addEventListener('open', () => {
      this._attempt = 0
      this._setStatus('ok')
      this.onOpen?.()
    })

    ws.addEventListener('close', () => {
      this.ws = null
      this.onClose?.()
      if (this._closedByUser) {
        this._setStatus('off')
        return
      }
      this._scheduleReconnect()
    })

    ws.addEventListener('error', () => {
      // Close event will schedule reconnect.
    })

    ws.addEventListener('message', (ev) => {
      let msg
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      this.onMessage?.(msg)
    })
  }

  _scheduleReconnect() {
    if (this._closedByUser) return
    if (this._reconnectTimer) return

    this._setStatus('connecting')

    const attempt = this._attempt++
    const base = Math.min(5000, 500 * Math.pow(2, Math.min(4, attempt)))
    const jitter = Math.floor(Math.random() * 250)
    const wait = base + jitter

    this._reconnectTimer = window.setTimeout(() => {
      this._reconnectTimer = 0
      this.connect()
    }, wait)
  }

  close() {
    this._closedByUser = true
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = 0
    }
    try {
      this.ws?.close()
    } catch {
      // ignore
    }
    this.ws = null
    this._setStatus('off')
  }

  send(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify(obj))
    return true
  }
}
