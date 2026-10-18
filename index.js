'use strict';

// ⚠️  Tracing is initialised first, except during Jest tests where it adds
//     startup overhead and noisy console output with no benefit.
if (process.env.NODE_ENV !== 'test') {
  require('./tracing');
}

const express = require('express');
const app = express();
require('dotenv').config();

const pinoHttp = require('pino-http');
const client = require('prom-client');
const cors = require('cors');
const bodyParser = require('body-parser');

// ──────────────────────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────────────────────
const PORT        = process.env.PORT        || 8080;
const APP_VERSION = process.env.APP_VERSION || 'dev';
const NODE_ENV    = process.env.NODE_ENV    || 'development';

// ──────────────────────────────────────────────────────────────────────────────
// Structured Logging (pino)
// ──────────────────────────────────────────────────────────────────────────────
const logger = require('pino')({
  level: process.env.LOG_LEVEL || 'info',
  // Pretty-print in development only (requires pino-pretty devDependency).
  // In test and production mode, emit structured JSON (no transport).
  transport: (NODE_ENV === 'development')
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: { service: 'task-manager-backend', version: APP_VERSION },
});

// ──────────────────────────────────────────────────────────────────────────────
// Prometheus Metrics
// ──────────────────────────────────────────────────────────────────────────────
// Collect default Node.js metrics (heap, CPU, GC, event loop lag, etc.)
client.collectDefaultMetrics({ prefix: 'task_manager_' });

// HTTP request duration histogram — labelled by method, route, status code
const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

// HTTP request counter
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

// Export registry and histogram for use in controllers
app.locals.metrics = { httpRequestDurationSeconds, httpRequestsTotal, registry: client.register };

// ──────────────────────────────────────────────────────────────────────────────
// Middleware
// ──────────────────────────────────────────────────────────────────────────────
app.use(pinoHttp({ logger }));

app.use(cors({
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

app.use(bodyParser.json());

// Instrument every response with Prometheus metrics
app.use((req, res, next) => {
  const end = httpRequestDurationSeconds.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    end(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
});

// ──────────────────────────────────────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────────────────────────────────────
const TaskRouter = require('./Routes/TaskRouter');

// Root — basic info
app.get('/', (req, res) => {
  res.json({
    service:     'task-manager-backend',
    version:     APP_VERSION,
    environment: NODE_ENV,
    status:      'ok',
  });
});

// Task CRUD API
app.use('/tasks', TaskRouter);

// ── Health Probes ─────────────────────────────────────────────────────────────
// Liveness: Is the process alive? (K8s kills + restarts if this fails)
app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'alive', version: APP_VERSION });
});

// Readiness: Is the process ready to serve traffic? (K8s withholds traffic if this fails)
// For this app (in-memory, no external deps), it mirrors liveness.
// If MongoDB were enabled, we'd check the DB connection here.
app.get('/health/ready', (req, res) => {
  // Future: check DB connection state here before returning 200
  res.status(200).json({
    status:  'ready',
    version: APP_VERSION,
    uptime:  process.uptime(),
  });
});

// ── Prometheus Metrics Endpoint ───────────────────────────────────────────────
// Scraped by Prometheus every 15s (configured in prometheus-values.yaml)
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Server Bootstrap (skip when running Jest tests)
// ──────────────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info({ port: PORT, version: APP_VERSION, env: NODE_ENV },
      'Task Manager Backend started');
  });
}

// Export app for supertest
module.exports = app;
