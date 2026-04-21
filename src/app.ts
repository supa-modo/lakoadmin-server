import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { requestIdMiddleware } from './middleware/requestId';
import { defaultRateLimiter } from './middleware/rateLimiter';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler';
import { fileLogger } from './services/fileLogger';
import routes from './routes';

const app = express();

// ─── Security Headers ───────────────────────────────────
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  }),
);

// ─── Request ID ──────────────────────────────────────────
app.use(requestIdMiddleware);

// ─── Body Parsers ─────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── HTTP Logging ─────────────────────────────────────────
if (env.isDev) {
  app.use(morgan('dev'));
} else {
  app.use(
    morgan('combined', {
      stream: {
        write: (message: string) => {
          fileLogger.info('api', message.trim());
        },
      },
    }),
  );
}

// ─── Rate Limiting ────────────────────────────────────────
app.use('/api', defaultRateLimiter);

// ─── Health Check ────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '1.0.0',
    environment: env.NODE_ENV,
  });
});

// ─── API Routes ──────────────────────────────────────────
app.use('/api', routes);

// ─── 404 and Error Handlers ──────────────────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
