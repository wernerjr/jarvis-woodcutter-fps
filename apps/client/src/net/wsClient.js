const WS_BASE = import.meta.env?.VITE_WS_BASE_URL || '';

function wsUrl(path) {
  if (WS_BASE) return `${WS_BASE}${path}`;
  // default: same-origin wss
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${path}`;
}

export class WsClient {
  constructor({ onMessage, onOpen, onClose }) {
    this.onMessage = onMessage;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.ws = null;
  }

  connect() {
    if (this.ws) return;
    const ws = new WebSocket(wsUrl('/ws'));
    this.ws = ws;

    ws.addEventListener('open', () => this.onOpen?.());
    ws.addEventListener('close', () => {
      this.ws = null;
      this.onClose?.();
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.onMessage?.(msg);
    });
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
  }

  send(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(obj));
    return true;
  }
}
