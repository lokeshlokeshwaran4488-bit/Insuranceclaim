const WebSocket = require('ws');
const url = require('url');
const { verifyToken } = require('../middleware/auth');

class ConnectionManager {
  constructor() {
    this.activeConnections = new Map(); // userId -> Set<WebSocket>
    this.wss = null;
  }

  init(server) {
    this.wss = new WebSocket.Server({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const parsedUrl = url.parse(request.url, true);
      const pathname = parsedUrl.pathname;

      // Match /ws/:userId
      const match = pathname.match(/^\/ws\/([a-zA-Z0-9\-_]+)/);
      if (!match) {
        socket.destroy();
        return;
      }

      const userId = match[1];
      const token = parsedUrl.query.token;

      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const decoded = verifyToken(token);
      if (!decoded || (decoded.sub !== userId && decoded.role !== 'ADMIN')) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request, userId);
      });
    });

    this.wss.on('connection', (ws, request, userId) => {
      this.connect(userId, ws);

      ws.send(JSON.stringify({
        type: 'CONNECTED',
        message: 'Real-time connection established',
        user_id: userId
      }));

      ws.on('message', (message) => {
        try {
          const text = message.toString();
          if (text === 'ping') {
            ws.send('pong');
          }
        } catch (e) {
          // ignore
        }
      });

      ws.on('close', () => {
        this.disconnect(userId, ws);
      });

      ws.on('error', () => {
        this.disconnect(userId, ws);
      });
    });

    console.log('[WebSocket] Server initialized for /ws/:userId');
  }

  connect(userId, ws) {
    if (!this.activeConnections.has(userId)) {
      this.activeConnections.set(userId, new Set());
    }
    this.activeConnections.get(userId).add(ws);
  }

  disconnect(userId, ws) {
    if (this.activeConnections.has(userId)) {
      const userSockets = this.activeConnections.get(userId);
      userSockets.delete(ws);
      if (userSockets.size === 0) {
        this.activeConnections.delete(userId);
      }
    }
  }

  sendToUser(userId, message) {
    if (this.activeConnections.has(userId)) {
      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      for (const ws of this.activeConnections.get(userId)) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(payload);
          } catch (e) {
            this.disconnect(userId, ws);
          }
        }
      }
    }
  }

  broadcast(message) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    for (const [userId, sockets] of this.activeConnections.entries()) {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(payload);
          } catch (e) {
            this.disconnect(userId, ws);
          }
        }
      }
    }
  }
}

const connectionManager = new ConnectionManager();
module.exports = connectionManager;

