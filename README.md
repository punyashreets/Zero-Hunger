# 🌾 Zero Hunger Connect v2

A smart food donation and allocation platform that dynamically matches food donors with receivers based on urgency, expiry time, distance, and demand.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+

### Install & Run

```bash
# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install

# Terminal 1: Start backend (port 4000)
cd backend && npm run dev

# Terminal 2: Start frontend (port 5173)
cd frontend && npm run dev
```

Open http://localhost:5173

---

## 🏗️ Architecture

```
zero-hunger-connect/
├── backend/
│   ├── db/
│   │   ├── data.json            # Live database (auto-created, clean on start)
│   │   └── jsonDb.js            # JSON DB with all new collections
│   ├── middleware/
│   │   └── auth.js              # JWT auth + role/ownership guards
│   ├── routes/
│   │   ├── auth.js              # Register/login + district uniqueness
│   │   ├── food.js              # Donations CRUD + auto-match trigger
│   │   ├── requests.js          # Requests + auto-match trigger
│   │   ├── match.js             # Preview + confirm + history
│   │   ├── notifications.js     # In-app notifications
│   │   └── admin.js             # Analytics + district management
│   ├── services/
│   │   ├── matchingEngine.js    # Smart priority scoring algorithm
│   │   ├── autoMatcher.js       # Real-time auto-matching orchestrator
│   │   └── notificationService.js # In-app + Socket.IO notifications
│   └── server.js                # Express + Socket.IO server
└── frontend/
    └── src/
        ├── App.jsx              # Full React app (auth + all dashboards)
        ├── api.js               # API client layer
        └── index.css            # Dark theme styles
```

---

## ✨ Features Implemented

### 1. District-Based Admin System
- **One admin per district** — enforced at registration (DB + API level)
- Shivamogga/Shimogga etc. — all Karnataka districts supported
- Admin sees only their district's data (donations, requests, matches)
- District admins cannot be created if one exists for that district

### 2. Smart Matching Algorithm

**Priority Score Formula:**
```
score = (urgency × 0.4) + (expiry × 0.3) + (distance × 0.2) + (demand × 0.1)
```

**Urgency Levels:**
- 🔴 Less than 1 hour → weight 1.0 (EMERGENCY)
- 🟠 1–2 hours → weight 0.8
- 🟡 2–3 hours → weight 0.6
- 🔵 4–5 hours → weight 0.4
- ⚪ More than 5 hours → weight 0.2

**Expiry Logic:**
- Food expiring < 1h → allocated to nearest receiver first
- Food expiring > 8h → can be allocated to farther receivers

### 3. Dynamic Food Splitting

- **Case 1**: Donor has MORE than needed → only allocate what's needed, `remainingMeals` updated
- **Case 2**: Receiver needs MORE than one donor → system combines multiple donors
- **Case 3**: Not enough food → allocates available amount, keeps request `partial` for future donors

### 4. Auto-Matching Engine
- Fires automatically on every new donation AND new request
- Uses `setImmediate()` for non-blocking async execution
- Prevents duplicate allocations via status tracking
- Real-time Socket.IO notifications on match events

### 5. Notifications
- In-app notifications for both donor and receiver on every match
- Shows: donor/receiver name, phone, location, quantity allocated
- Socket.IO for real-time push (no refresh needed)
- Unread badge in sidebar

### 6. Privacy & Isolation
- **Donors**: see only own donations
- **Receivers**: see food listings WITHOUT donor contact info; only see contact details after matching
- **After match**: both parties see each other's contact info
- JWT token auth on every protected route

### 7. Location Features
- Manual address entry
- Auto-detect via browser Geolocation API
- Haversine formula for accurate distance calculation
- Distance shown in match preview/results

### 8. Clean Data
- `data.json` starts empty — no dummy data
- Completed matches archived to `matchHistory`
- Expired donations filtered from active views

---

## 📡 API Reference

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | public | Register (with district uniqueness for admin) |
| POST | /api/auth/login | public | Login |
| GET | /api/auth/me | any | Current user |
| GET | /api/auth/districts | public | List taken districts |
| GET | /api/food | any | List donations (role-filtered) |
| POST | /api/food | donor | Create donation + trigger auto-match |
| DELETE | /api/food/:id | donor/admin | Delete donation |
| GET | /api/requests | any | List requests (role-filtered) |
| POST | /api/requests | receiver | Create request + trigger auto-match |
| PATCH | /api/requests/:id/cancel | receiver | Cancel request |
| POST | /api/match/preview | receiver | Preview match (no write) |
| POST | /api/match/confirm | receiver | Confirm match |
| GET | /api/match | any | Own matches |
| GET | /api/match/history | any | Match history |
| GET | /api/notifications | any | Own notifications |
| PATCH | /api/notifications/read-all | any | Mark all read |
| GET | /api/admin/analytics | admin | District analytics |
| GET | /api/admin/users | admin | District users |
| GET | /api/admin/donations | admin | All district donations |
| GET | /api/admin/requests | admin | All district requests |
| GET | /api/admin/matches | admin | All district matches |

---

## 🗄️ Database Collections

| Collection | Purpose |
|-----------|---------|
| `users` | All users (donors, receivers, admins) |
| `foodListings` | Donations with `totalMeals`, `remainingMeals`, `expiryTime` |
| `requests` | Food requests with `requiredMeals`, `remainingMealsNeeded`, `urgencyLevel` |
| `matches` | Active matches with per-allocation detail |
| `matchHistory` | Archived fulfilled matches |
| `notifications` | Per-user in-app notifications |
| `districtAnalytics` | Per-district aggregate stats |
| `analytics` | Global counters |

---

## 🔐 Security

- JWT tokens (7-day expiry)
- `bcryptjs` password hashing (10 rounds)
- Role middleware: `requireRole("donor" | "receiver" | "admin")`
- Ownership checks: donors/receivers can only modify their own records
- Admin scoped to district data
- No cross-user data leaks (contacts only revealed post-match)
