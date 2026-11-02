const mongoose = require('mongoose');
const config = require('./config');

let isConnected = false;

async function connectDB() {
  if (isConnected) return mongoose.connection;

  try {
    const conn = await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`[MongoDB] Connected to database: ${conn.connection.name} at ${conn.connection.host}:${conn.connection.port}`);
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
        database: mongoose.connection?.name || 'insurance_claims',
        latency_ms: 0,
        error: 'Database not connected'
      };
    }
    await mongoose.connection.db.admin().ping();
    const latency_ms = Date.now() - start;
    const collections = await mongoose.connection.db.listCollections().toArray();
    return {
      status: 'connected',
      database: mongoose.connection.name,
      latency_ms,
      collections_count: collections.length,
      collections: collections.map(c => c.name)
    };
  } catch (err) {
    return {
      status: 'unavailable',
      database: mongoose.connection?.name || 'insurance_claims',
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

