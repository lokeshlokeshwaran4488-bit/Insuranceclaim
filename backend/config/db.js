const mongoose = require('mongoose');
const config = require('./config');

let isConnected = false;

async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Double check: ensure production does not connect to localhost / 127.0.0.1
  if (config.env === 'production') {
    if (!config.mongoUri || config.mongoUri.includes('localhost') || config.mongoUri.includes('127.0.0.1')) {
      throw new Error('[MongoDB] Refusing to connect to localhost/127.0.0.1 in production environment.');
    }
  }

  try {
    const conn = await mongoose.connect(config.mongoUri, {
      dbName: config.dbName || 'insurance_claims',
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`[MongoDB] Connected to database: ${conn.connection.name}`);
    return conn.connection;
  } catch (error) {
    console.error(`[MongoDB] Connection error: ${error.message}`);
    throw error;
  }
}

async function getDbHealth() {
  const start = Date.now();
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return {
        status: 'disconnected',
        database: config.dbName || 'insurance_claims',
        latency_ms: 0,
        error: 'Database not connected'
      };
    }
    await mongoose.connection.db.admin().ping();
    const latency_ms = Date.now() - start;
    const collections = await mongoose.connection.db.listCollections().toArray();
    return {
      status: 'connected',
      database: mongoose.connection.name || config.dbName || 'insurance_claims',
      latency_ms,
      collections_count: collections.length,
      collections: collections.map(c => c.name)
    };
  } catch (err) {
    return {
      status: 'unavailable',
      database: mongoose.connection?.name || config.dbName || 'insurance_claims',
      latency_ms: Date.now() - start,
      error: err.message
    };
  }
}

module.exports = {
  connectDB,
  getDbHealth,
  mongoose
};

// Connection lifecycle event listeners
mongoose.connection.on('error', (err) => {
  console.error(`[MongoDB] Runtime database error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('[MongoDB] Database disconnected');
});
