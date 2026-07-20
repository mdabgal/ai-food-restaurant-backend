'use strict';

const { MongoClient } = require('mongodb');

// MongoDB client instance (singleton)
let client = null;
let db     = null;

/**
 * Connect to MongoDB and select the target database.
 * Call this once at server startup.
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables.');
  }

  try {
    client = new MongoClient(uri);

    await client.connect();

    // Select the database
    db = client.db('food_restaurant');

    console.log(`✅ MongoDB connected successfully → Database: "${db.databaseName}"`);

    // Handle unexpected disconnections
    client.on('close', () => {
      console.warn('⚠️  MongoDB connection closed unexpectedly.');
    });

    client.on('error', (err) => {
      console.error('❌ MongoDB client error:', err.message);
    });

    return db;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    throw error; // Re-throw so server.js can handle it
  }
};

/**
 * Returns the active database instance.
 * Throws if connectDB() has not been called first.
 */
const getDB = () => {
  if (!db) {
    throw new Error('Database not initialised. Call connectDB() before accessing the database.');
  }
  return db;
};

/**
 * Gracefully close the MongoDB connection.
 */
const closeDB = async () => {
  if (client) {
    await client.close();
    client = null;
    db     = null;
    console.log('🔌 MongoDB connection closed gracefully.');
  }
};

module.exports = { connectDB, getDB, closeDB };
