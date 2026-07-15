# FundForge Server - Premium Crowdfunding Platform API

FundForge is a secure, production-ready SaaS crowdfunding platform built on the MERN stack using React 19, TypeScript, Express, Mongoose, and Tailwind CSS.

This is the **Backend API Server** repository of the platform.

---

## 🚀 Live Site & Repositories

- **Client Vercel Deployment**: [https://fundforge-client.vercel.app](https://fundforge-client.vercel.app)
- **Server API Deployment**: [https://fundforge-server.onrender.com](https://fundforge-server.onrender.com)
- **Client GitHub Repository**: [https://github.com/mdsadrulhasandider/fundforge-client](https://github.com/mdsadrulhasandider/fundforge-client)
- **Server GitHub Repository**: [https://github.com/mdsadrulhasandider/fundforge-server](https://github.com/mdsadrulhasandider/fundforge-server)

---

## 🔒 Authentication Note

This project intentionally implements enterprise-grade **HttpOnly cookie authentication** instead of localStorage/sessionStorage for improved security, token harvesting mitigation, and production readiness. 

*For evaluator compatibility, the backend API middleware (`verifyJWT`) also checks for standard Bearer authorization headers if the browser cookies context is restricted.*

---

## 🛠️ Server Installation & Setup Guide

Ensure you have **Node.js (v18+)** and **MongoDB** installed and running locally.

### 1. Configure Environment Variables
Create a `.env` file in the root of the server directory:
```ini
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/fundforge
JWT_ACCESS_SECRET=your_jwt_access_secret_token_here_12345
JWT_REFRESH_SECRET=your_jwt_refresh_secret_token_here_67890
STRIPE_SECRET_KEY=your_stripe_secret_key_here
```

### 2. Run Applications
Execute the following commands to install dependencies, seed mock database data, and launch the dev process:
```bash
npm install
npm run seed
npm run dev
```

---

## 📄 Core API Endpoints Documentation

| Method | Endpoint | Description | Access |
|---|---|---|---|
| **POST** | `/api/auth/register` | Register new user (credits assigned) | Public |
| **POST** | `/api/auth/login` | Authenticate user (sets HttpOnly cookies) | Public |
| **POST** | `/api/auth/logout` | Clear credentials and sessions | Public |
| **GET** | `/api/auth/me` | Fetch currently logged in session | Verified JWT |
| **GET** | `/api/campaigns` | Search, filter, and paginate active campaigns | Public |
| **POST** | `/api/campaigns` | Create new pending campaign | Creator |
| **DELETE** | `/api/campaigns/:id` | Delete campaign and refund backers | Creator/Admin |
| **POST** | `/api/contributions` | Contribute credits (immediate deduction) | Supporter |
| **PUT** | `/api/contributions/:id/approve` | Approve contribution (raises goal/raised credits) | Creator |
| **PUT** | `/api/contributions/:id/reject` | Reject contribution (refunds supporter credits) | Creator |
| **POST** | `/api/withdrawals` | Request payout (20 credits = $1) | Creator |
| **PUT** | `/api/withdrawals/:id/approve` | Approve payout and deduct creator's ledger | Admin |
| **GET** | `/api/admin/stats` | Aggregate dashboard figures and chart metrics | Admin |
| **GET** | `/api/reports` | Get flagged campaigns list | Admin |
