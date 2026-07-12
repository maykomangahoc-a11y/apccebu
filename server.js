require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { initDatabase } = require('./db');

// Route imports
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const configRoutes = require('./routes/config');
const dispatchRoutes = require('./routes/dispatch');
const pickingRoutes = require('./routes/picking');
const processingRoutes = require('./routes/processing');
const resourceRoutes = require('./routes/resources');
const checkingRoutes = require('./routes/checking');
const outboundBlRoutes = require('./routes/outbound-bl');
const inboundRoutes = require('./routes/inbound');
const putawayRoutes = require('./routes/putaway');
const itemRoutes = require('./routes/items');

const app = express();
const PORT = process.env.PORT || 3002;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/config', configRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/picking', pickingRoutes);
app.use('/api/processing', processingRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/checking', checkingRoutes);
app.use('/api/outbound-bl', outboundBlRoutes);
app.use('/api/inbound', inboundRoutes);
app.use('/api/putaway', putawayRoutes);
app.use('/api/items', itemRoutes);

// ─── Health Check ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// ─── Catch-all for SPA (serve index.html for non-API routes) ────────────────
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).json({ error: 'Not found' });
    }
  });
});

// ─── Error handling middleware ───────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start Server ───────────────────────────────────────────────────────────
async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`\n🚀 APC Cebu Warehouse Server running on port ${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/api/health`);
      console.log(`   API:    http://localhost:${PORT}/api\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
