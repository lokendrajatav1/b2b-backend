# 🚀 B2B Community Marketplace Platform

A **location-based B2B vendor discovery and lead distribution platform** designed to create a **controlled lead economy system** with ranking algorithms, subscription monetization, and admin-controlled visibility.

📄 Requirement Reference: DSS Marketplace Proposal  
(Used to design architecture, lead engine, ranking, and monetization system)

---

# 🧠 Platform Vision

This platform is:

- Location-restricted marketplace
- Performance-driven ranking system
- Subscription-based monetization engine
- Controlled lead distribution ecosystem

❌ NOT:
- Simple directory
- Listing website
- Open marketplace

✅ IS:
- Lead economy engine
- Ranking-based vendor visibility system
- Subscription SaaS platform

*(Derived from system vision section, page 1)* :contentReference[oaicite:0]{index=0}

---

# 🏗️ System Architecture

## High-Level Architecture

Client (Next.js)  
↓  
API Server (Node.js + Express)  
↓  
Core Engines:
- Lead Engine
- Ranking Engine
- Subscription Engine
- Notification Engine  
↓  
Database (PostgreSQL)

*(Based on architecture section, page 2)* :contentReference[oaicite:1]{index=1}

---

# ⚙️ Tech Stack

## Frontend
- Next.js 14
- React
- TailwindCSS
- Axios

## Backend
- Node.js
- Express.js
- Prisma ORM

## Database
- PostgreSQL

## DevOps
- Docker
- Nginx
- PM2

## Integrations
- SMTP Email
- Cloudinary (media)
- WhatsApp API (optional)

---

# 👥 User Roles & Permissions

## 🔴 Admin

- Approve / reject vendors
- Modify ranking formula (40/60 weight)
- Configure pricing packages
- Manage leads
- View analytics
- Suspend vendors
- Assign manual boosts

*(From page 2)* :contentReference[oaicite:2]{index=2}

---

## 🟢 Vendor

### Workflow

1. Register
2. Submit details
3. Admin approval
4. Activation

### Restrictions

- Category locked
- Location locked
- No cross-city leads

*(From page 3)* :contentReference[oaicite:3]{index=3}

---

## 🔵 Buyer

### Without Login
- Search vendors
- View limited profile

### With Login
- Contact vendor
- WhatsApp / Call
- Send inquiry
- Feedback

*(From page 3)* :contentReference[oaicite:4]{index=4}

---

# 💰 Subscription System

## Basic Plan (₹100/month)

- Directory listing
- Verified badge
- Shared leads
- Lower ranking weight

## Diamond Plan

- Priority ranking
- Premium visibility
- Exclusive leads

### Upgrade Flow

Vendor → Upgrade → Payment → Activation

*(From page 4)* :contentReference[oaicite:5]{index=5}

---

# 📊 Ranking Algorithm

### Performance Factors

- Profile completeness
- Login frequency
- Response time
- Reviews
- Conversion rate
- Keyword match
- Lead closure rate

⏱ Recalculated every 24 hours

*(From page 6)* :contentReference[oaicite:6]{index=6}

---

# 🎯 Lead Generation System

## 1. Search Idle Lead
Triggered when:
- User searches
- No action for 3 minutes

➡ Distributed to:
- Diamond vendors
- Same category
- Same city

---

## 2. Direct Action Lead

- Call / WhatsApp / Chat
- Logged but NOT redistributed

---

## 3. Inquiry Lead

➡ Distributed by:
- Category
- Location
- Ranking order

*(From pages 6–7)* :contentReference[oaicite:7]{index=7}

---

# 🔁 Follow-Up System

After 6 days:

- Email + WhatsApp sent

If:
- ✅ Closed → Vendor notified
- ❌ Not closed → Lead redistributed

*(From page 7)* :contentReference[oaicite:8]{index=8}

---

# 📦 Core Features

- Vendor listing system
- Lead distribution engine
- Ranking engine
- Subscription engine
- Analytics dashboard
- Payment tracking
- Admin control panel

---

# 🗄️ Database Design

## Core Tables

- Users
- Vendors
- Categories
- Products
- Keywords
- Leads
- LeadLifecycle
- Transactions
- Packages
- Rankings
- Reviews
- Notifications

*(From page 9)* :contentReference[oaicite:9]{index=9}

---

# 📂 Project Structure

```text
backend/
├── prisma/                 # Database schema & migrations
│   └── schema.prisma       # Core lead economy schema
├── src/
│   ├── config/             # App configurations (Prisma, Cloudinary, Razorpay)
│   ├── controllers/        # Request handlers (Auth, Lead, Vendor, Payment)
│   ├── jobs/               # Background tasks (Ranking engine, Follow-up)
│   ├── middleware/         # Security, Auth, RBAC, Validation
│   ├── routes/             # API entry points
│   ├── services/           # Core Engines (Lead Distribution, Notifications)
│   ├── utils/              # Standard Response & Error helpers
│   ├── validations/        # Joi schemas for request sanitization
│   └── server.js           # API entry point
├── .env.example            # Environment template
└── B2B_Marketplace_API.postman_collection.json # API Documentation
```

# 🔌 API Overview

### 🔐 Authentication
- `POST /api/auth/register` - New user signup (Buyer by default)
- `POST /api/auth/login` - Get JWT access token

### 🏢 Vendor Management
- `GET /api/vendors` - Public search (Filter by city, category, search term)
- `GET /api/vendors/me` - Private vendor profile
- `POST /api/vendors/upload-verification` - Upload GST/ID docs to Cloudinary

### 🎯 Lead Distribution
- `POST /api/leads` - Public lead inquiry submission
- `GET /api/leads/my-leads/:vendorId` - Private lead retrieval for vendors

### 💰 Subscription (Razorpay)
- `POST /api/payments/create-order` - Initialize plan upgrade
- `POST /api/payments/verify-payment` - Activate plan via signature verification

### 🛡️ Admin Dashboard
- `PATCH /api/admin/approve-vendor/:vendorId` - Verify vendor account
- `GET /api/admin/analytics` - Platform stats (leads, revenue, vendors)

---

# 🔐 Security

- JWT Authentication
- Role-based access control
- SSL mandatory
- SQL injection protection
- GST data encryption

*(From page 8)* :contentReference[oaicite:10]{index=10}

---

# ⚡ Performance

- Max 3 sec load time
- Caching enabled
- Scalable architecture

*(From page 8)* :contentReference[oaicite:11]{index=11}

---

# 🚀 Getting Started

### 1. Prerequisites
- PostgreSQL
- Node.js (v18+)

### 2. Installation
```bash
npm install
cp .env.example .env
# Fill in your DB_URL, RAZORPAY, and CLOUDINARY keys
```

### 3. Database Setup
```bash
npx prisma migrate dev
```

### 4. Run Development
```bash
npm run dev
```

## Services

- Frontend → http://localhost:3000  
- Backend → http://localhost:5000  
- Database → PostgreSQL  

---

# 📈 Scalability Plan

Phase 1:
- Single VPS

Phase 2:
- Separate DB + Redis

Phase 3:
- Load balancer + CDN

*(From page 10)* :contentReference[oaicite:12]{index=12}

---

# ⏳ Development Timeline

Total: **2–3 Months**

- Planning → 2 weeks  
- Core Dev → 4–6 weeks  
- Ranking Engine → 2–3 weeks  
- Payment → 1–2 weeks  
- Testing → 1–2 weeks  

*(From page 9)* :contentReference[oaicite:13]{index=13}

---

# 🛠️ Future Enhancements

- AI vendor ranking
- Smart lead prediction
- WhatsApp automation
- Elasticsearch search
- Real-time analytics

---

# 📜 License

All source code and IP belong to the client after full payment.

*(From page 13)* :contentReference[oaicite:14]{index=14}

---

# 💡 Final Positioning

This platform is:

- Location strict
- Keyword intelligent
- Performance ranked
- Subscription controlled
- Lead economy based
- Admin regulated
- Scalable SaaS system

*(From final positioning section, page 13)* :contentReference[oaicite:15]{index=15}

---

# 👨‍💻 Author

Full Stack SaaS System  
Built for scalable B2B marketplace platform