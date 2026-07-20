'use strict';

require('dotenv').config();

const app = require('./src/app');
const { connectDB, closeDB } = require('./src/config/db');

const PORT = process.env.PORT || 5000;

/**
 * Bootstrap the application:
 * 1. Connect to MongoDB
 * 2. Start the Express server only after a successful DB connection
 */
const startServer = async () => {
  try {
    // Step 1: Establish database connection
    await connectDB();

    // Step 2: Start Express server
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });

    // ─── Graceful Shutdown ────────────────────────────────────────────────────
    const shutdown = async (signal) => {
      console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);

      server.close(async () => {
        console.log('🔒 Express server closed.');
        await closeDB();
        process.exit(0);
      });

      // Force exit if graceful shutdown takes too long
      setTimeout(() => {
        console.error('⏱️  Forced shutdown after timeout.');
        process.exit(1);
      }, 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (error) {
    console.error('💥 Server startup failed:', error.message);
    process.exit(1); // Exit with failure code so process managers can restart
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Promise Rejection:', reason);
  process.exit(1);
});

startServer();
