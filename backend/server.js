const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config/config');
const { connectDB, getDbHealth } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const websocketManager = require('./services/websocketService');
const { ensureUploadDir } = require('./utils/fileUtils');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const customerRoutes = require('./routes/customerRoutes');
const policyRoutes = require('./routes/policyRoutes');
const claimRoutes = require('./routes/claimRoutes');
const documentRoutes = require('./routes/documentRoutes');
const settlementRoutes = require('./routes/settlementRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const aiRoutes = require('./routes/aiRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();
const server = http.createServer(app);

// Initialize upload directories
ensureUploadDir('claims');

// Middlewares
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    // Allow any localhost / 127.0.0.1 or match configured origins
    if (
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.endsWith('.onrender.com') ||
      config.corsOrigins.includes(origin)
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Serve static uploaded files
app.use('/uploads', express.static(config.uploadDir));

// Health check endpoint (MongoDB only, no SQL/PostgreSQL)
app.get('/api/health', async (req, res) => {
  const mongoHealth = await getDbHealth();
  const isHealthy = mongoHealth.status === 'connected';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    app: config.appName,
    version: config.version,
    environment: config.env,
    services: {
      mongodb: mongoHealth
    }
  });
});

// Root welcome
app.get('/', (req, res) => {
  res.json({
    message: `Welcome to ${config.appName} API`,
    version: config.version,
    environment: config.env,
    health: '/api/health'
  });
});

// Mount modular API routers
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', analyticsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportRoutes);

// Fallback 404 for unmatched API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ detail: `Route ${req.originalUrl} not found` });
});

// Centralized error handler
app.use(errorHandler);

// Initialize WebSocket server
websocketManager.init(server);

// Start server
async function startServer() {
  try {
    await connectDB();
    server.listen(config.port, '0.0.0.0', () => {
      console.log(`[${config.appName}] Environment: ${config.env}`);
      console.log(`[${config.appName}] Server running on port ${config.port}`);
    });
  } catch (err) {
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, server, startServer };

