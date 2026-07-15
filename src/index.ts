import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectDB } from './config/db';

// Import Routes
import authRoutes from './routes/auth';
import campaignRoutes from './routes/campaigns';
import contributionRoutes from './routes/contributions';
import withdrawalRoutes from './routes/withdrawals';
import paymentRoutes from './routes/payments';
import notificationRoutes from './routes/notifications';
import reportRoutes from './routes/reports';
import adminRoutes from './routes/admin';

// Load Env variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Connect Database
connectDB();

// Security Middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(mongoSanitize());

// Dynamic CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://fundforge-client.vercel.app'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Express limits and Cookie parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests from this IP, please try again after 15 minutes.' }
});
app.use('/api/', limiter);

// Health Check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Register API Routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/contributions', contributionRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);

// 404 Route handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ message: 'API Endpoint Not Found' });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    message: 'Internal Server Error. Please try again later.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
