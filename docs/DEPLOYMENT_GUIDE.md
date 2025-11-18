# Travel App - Deployment Guide

> Hướng dẫn triển khai toàn bộ hệ thống Travel App lên production.

**Version:** 1.0.0  
**Last Updated:** 18/11/2025

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Production Deployment](#production-deployment)
4. [Docker Deployment](#docker-deployment)
5. [Cloud Deployment](#cloud-deployment)
6. [Environment Variables](#environment-variables)
7. [Database Setup](#database-setup)
8. [CI/CD Pipeline](#cicd-pipeline)
9. [Monitoring & Logging](#monitoring--logging)
10. [Troubleshooting](#troubleshooting)

---

## 1. Prerequisites

### System Requirements

**Development:**
- Node.js >= 18.x
- npm >= 9.x
- Python >= 3.10
- MongoDB >= 6.x
- Git

**Production:**
- Same as development
- Docker >= 24.x (optional)
- Docker Compose >= 2.x (optional)

### Required Accounts & API Keys

1. **MongoDB Atlas** (Database)
   - Sign up: https://www.mongodb.com/cloud/atlas
   - Create a cluster
   - Get connection string

2. **Google Cloud Platform** (APIs)
   - Enable Distance Matrix API
   - Enable Places API
   - Enable Geocoding API
   - Get API keys

3. **Google OAuth** (Authentication)
   - Create OAuth 2.0 credentials
   - Get Client ID and Client Secret

4. **Expo** (Mobile App)
   - Sign up: https://expo.dev
   - Install EAS CLI: `npm install -g eas-cli`

---

## 2. Local Development Setup

### 2.1 Clone Repository

```bash
git clone https://github.com/Tooltu-deve/Travel-App.git
cd Travel-App
```

### 2.2 Backend Setup (NestJS)

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
# Database
MONGODB_URI=mongodb://localhost:27017/travel-app

# JWT
JWT_SECRET=your-super-secret-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# AI Optimizer Service
AI_OPTIMIZER_BASE_URL=http://localhost:5000

# Port
PORT=3000
EOF

# Start development server
npm run start:dev
```

**Backend will run on:** http://localhost:3000

### 2.3 Frontend Setup (Expo/React Native)

```bash
cd frontend

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
API_BASE_URL=http://localhost:3000
EOF

# Start Expo development server
npm start
```

**Expo DevTools will open on:** http://localhost:8081

**Run on device:**
- iOS: `npm run ios` (requires macOS + Xcode)
- Android: `npm run android` (requires Android Studio)
- Web: `npm run web`

### 2.4 AI Optimizer Setup (Python/FastAPI)

```bash
cd ai_optimizer_servive

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cat > .env << EOF
# Google Maps APIs
GOOGLE_DISTANCE_MATRIX_API_KEY=your-google-api-key
GOOGLE_GEOCODING_API_KEY=your-google-api-key
EOF

# Start FastAPI server
uvicorn main:app --host 0.0.0.0 --port 5000 --reload
```

**AI Optimizer will run on:** http://localhost:5000

### 2.5 Data Processing Setup (Python)

```bash
cd data_processing

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers (for scraping)
playwright install chromium

# Create .env file with MongoDB connection
cat > .env << EOF
MONGODB_URI=mongodb://localhost:27017/travel-app
EOF

# Run scripts as needed
python scrape_poi_reviews.py
python process_emotional_tags.py
```

### 2.6 Database Setup (MongoDB)

**Option 1: Local MongoDB**
```bash
# Install MongoDB (Ubuntu/Debian)
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Verify
mongosh --eval "db.version()"
```

**Option 2: MongoDB Atlas (Cloud)**
1. Sign up at https://www.mongodb.com/cloud/atlas
2. Create a free cluster
3. Create database user
4. Whitelist IP: 0.0.0.0/0 (for development)
5. Get connection string: `mongodb+srv://username:password@cluster.mongodb.net/travel-app`

**Seed Database:**
```bash
cd backend
npm run seed
```

---

## 3. Production Deployment

### 3.1 Backend Deployment (NestJS)

#### 3.1.1 Build for Production

```bash
cd backend

# Install production dependencies only
npm ci --production

# Build
npm run build

# Output: dist/ folder
```

#### 3.1.2 Deploy to Heroku

```bash
# Install Heroku CLI
curl https://cli-assets.heroku.com/install.sh | sh

# Login
heroku login

# Create app
heroku create travel-app-backend

# Set environment variables
heroku config:set MONGODB_URI="your-mongodb-atlas-uri"
heroku config:set JWT_SECRET="your-production-secret"
heroku config:set GOOGLE_CLIENT_ID="your-client-id"
heroku config:set GOOGLE_CLIENT_SECRET="your-client-secret"
heroku config:set AI_OPTIMIZER_BASE_URL="https://your-ai-optimizer-url.com"

# Deploy
git push heroku main

# Open app
heroku open
```

#### 3.1.3 Deploy to AWS EC2

```bash
# Launch EC2 instance (Ubuntu 22.04)
# SSH into instance
ssh -i your-key.pem ubuntu@ec2-xx-xx-xx-xx.compute.amazonaws.com

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (Process Manager)
sudo npm install -g pm2

# Clone repository
git clone https://github.com/Tooltu-deve/Travel-App.git
cd Travel-App/backend

# Install dependencies and build
npm ci --production
npm run build

# Create .env file with production variables
nano .env

# Start with PM2
pm2 start npm --name "travel-app-backend" -- run start:prod

# Save PM2 configuration
pm2 save
pm2 startup

# Setup Nginx reverse proxy
sudo apt install nginx
sudo nano /etc/nginx/sites-available/travel-app

# Add this configuration:
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/travel-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Setup SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 3.2 AI Optimizer Deployment (Python/FastAPI)

#### 3.2.1 Deploy to AWS Lambda (Serverless)

```bash
# Install Serverless Framework
npm install -g serverless

# Create serverless.yml
cd ai_optimizer_servive
cat > serverless.yml << EOF
service: travel-app-ai-optimizer

provider:
  name: aws
  runtime: python3.10
  region: us-east-1
  environment:
    GOOGLE_DISTANCE_MATRIX_API_KEY: \${env:GOOGLE_API_KEY}

functions:
  optimize:
    handler: main.handler
    events:
      - http:
          path: /optimize-route
          method: post
          cors: true

plugins:
  - serverless-python-requirements
EOF

# Install plugin
npm install --save-dev serverless-python-requirements

# Deploy
serverless deploy
```

#### 3.2.2 Deploy to Google Cloud Run

```bash
# Install gcloud CLI
# Create Dockerfile
cd ai_optimizer_servive
cat > Dockerfile << EOF
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
EOF

# Build and push to Google Container Registry
gcloud builds submit --tag gcr.io/your-project-id/ai-optimizer

# Deploy to Cloud Run
gcloud run deploy ai-optimizer \
  --image gcr.io/your-project-id/ai-optimizer \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_DISTANCE_MATRIX_API_KEY=your-api-key
```

### 3.3 Frontend Deployment (Expo)

#### 3.3.1 Build for Production

```bash
cd frontend

# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure project
eas build:configure

# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios

# Submit to app stores
eas submit --platform android
eas submit --platform ios
```

#### 3.3.2 Over-the-Air (OTA) Updates

```bash
# Publish update
eas update --branch production --message "Bug fixes and improvements"
```

---

## 4. Docker Deployment

### 4.1 Docker Compose Setup

Create `docker-compose.yml` in root:

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:8
    container_name: travel-app-mongodb
    restart: always
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password123

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: travel-app-backend
    restart: always
    ports:
      - "3000:3000"
    environment:
      - MONGODB_URI=mongodb://admin:password123@mongodb:27017/travel-app?authSource=admin
      - JWT_SECRET=${JWT_SECRET}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
      - AI_OPTIMIZER_BASE_URL=http://ai-optimizer:5000
    depends_on:
      - mongodb

  ai-optimizer:
    build:
      context: ./ai_optimizer_servive
      dockerfile: Dockerfile
    container_name: travel-app-ai-optimizer
    restart: always
    ports:
      - "5000:5000"
    environment:
      - GOOGLE_DISTANCE_MATRIX_API_KEY=${GOOGLE_API_KEY}
      - GOOGLE_GEOCODING_API_KEY=${GOOGLE_API_KEY}

volumes:
  mongo-data:
```

### 4.2 Create Dockerfiles

**Backend Dockerfile (`backend/Dockerfile`):**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
```

**AI Optimizer Dockerfile (`ai_optimizer_servive/Dockerfile`):**
```dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
```

### 4.3 Run with Docker Compose

```bash
# Create .env file in root
cat > .env << EOF
JWT_SECRET=your-production-secret
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_API_KEY=your-google-api-key
EOF

# Build and start all services
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

---

## 5. Cloud Deployment

### 5.1 AWS Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     AWS Architecture                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Route 53 (DNS)                                         │
│       │                                                  │
│       ▼                                                  │
│  CloudFront (CDN)                                       │
│       │                                                  │
│       ▼                                                  │
│  Application Load Balancer                              │
│       │                                                  │
│       ├─────────────────────────────────────┐           │
│       │                                      │           │
│       ▼                                      ▼           │
│  ECS Fargate                            Lambda          │
│  (Backend NestJS)                  (AI Optimizer)       │
│       │                                                  │
│       ▼                                                  │
│  MongoDB Atlas                                          │
│  (Database)                                             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Google Cloud Platform Deployment

```
┌─────────────────────────────────────────────────────────┐
│                     GCP Architecture                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Cloud DNS                                              │
│       │                                                  │
│       ▼                                                  │
│  Cloud Load Balancing                                   │
│       │                                                  │
│       ├─────────────────────────────────────┐           │
│       │                                      │           │
│       ▼                                      ▼           │
│  Cloud Run                              Cloud Run       │
│  (Backend NestJS)                   (AI Optimizer)      │
│       │                                                  │
│       ▼                                                  │
│  MongoDB Atlas / Cloud SQL                              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Environment Variables

### 6.1 Backend (.env)

```bash
# Server
NODE_ENV=production
PORT=3000

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/travel-app?retryWrites=true&w=majority

# JWT
JWT_SECRET=your-super-secret-key-min-32-characters
JWT_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123def456
GOOGLE_CALLBACK_URL=https://api.yourapp.com/auth/google/callback

# AI Optimizer
AI_OPTIMIZER_BASE_URL=https://ai-optimizer.yourapp.com

# CORS
CORS_ORIGIN=https://yourapp.com,https://www.yourapp.com

# Rate Limiting
RATE_LIMIT_TTL=900
RATE_LIMIT_MAX=100
```

### 6.2 AI Optimizer (.env)

```bash
# Google Maps APIs
GOOGLE_DISTANCE_MATRIX_API_KEY=AIzaSy...
GOOGLE_GEOCODING_API_KEY=AIzaSy...

# Server
PORT=5000
HOST=0.0.0.0
```

### 6.3 Frontend (.env)

```bash
# API Base URL
API_BASE_URL=https://api.yourapp.com

# Expo
EXPO_PUBLIC_API_URL=https://api.yourapp.com
```

---

## 7. Database Setup

### 7.1 MongoDB Atlas Setup

1. **Create Cluster:**
   - Go to https://cloud.mongodb.com
   - Create a new cluster (M0 Free Tier or higher)
   - Choose region closest to your backend

2. **Create Database User:**
   ```
   Username: travelapp
   Password: [Generate strong password]
   Roles: Read and write to any database
   ```

3. **Network Access:**
   ```
   Add IP Address: 0.0.0.0/0 (Allow from anywhere)
   Or: Add specific IP addresses of your servers
   ```

4. **Get Connection String:**
   ```
   mongodb+srv://travelapp:<password>@cluster0.xxxxx.mongodb.net/travel-app?retryWrites=true&w=majority
   ```

5. **Create Indexes:**
   ```javascript
   // Connect to MongoDB
   use travel-app

   // Create indexes for users collection
   db.users.createIndex({ email: 1 }, { unique: true })
   db.users.createIndex({ googleId: 1 }, { unique: true, sparse: true })

   // Create indexes for places collection
   db.places.createIndex({ google_place_id: 1 }, { unique: true })
   db.places.createIndex({ city: 1 })
   db.places.createIndex({ location: "2dsphere" })
   db.places.createIndex({ types: 1 })
   db.places.createIndex({ rating: -1 })
   db.places.createIndex({ price_level: 1 })
   ```

### 7.2 Seed Production Database

```bash
# From backend directory
NODE_ENV=production MONGODB_URI="your-production-uri" npm run seed
```

---

## 8. CI/CD Pipeline

### 8.1 GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Travel App

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd backend
          npm ci
      
      - name: Lint
        run: |
          cd backend
          npm run lint
      
      - name: Build
        run: |
          cd backend
          npm run build
      
      - name: Deploy to Heroku
        if: github.ref == 'refs/heads/main'
        uses: akhileshns/heroku-deploy@v3.12.14
        with:
          heroku_api_key: ${{secrets.HEROKU_API_KEY}}
          heroku_app_name: "travel-app-backend"
          heroku_email: "your-email@example.com"
          appdir: "backend"

  ai-optimizer:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      
      - name: Install dependencies
        run: |
          cd ai_optimizer_servive
          pip install -r requirements.txt
      
      - name: Deploy to Google Cloud Run
        if: github.ref == 'refs/heads/main'
        uses: google-github-actions/deploy-cloudrun@v1
        with:
          service: ai-optimizer
          image: gcr.io/${{ secrets.GCP_PROJECT_ID }}/ai-optimizer
          region: us-central1
          credentials: ${{ secrets.GCP_SA_KEY }}

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Setup Expo
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      
      - name: Install dependencies
        run: |
          cd frontend
          npm ci
      
      - name: Publish Update
        if: github.ref == 'refs/heads/main'
        run: |
          cd frontend
          eas update --branch production --message "Deploy from GitHub Actions"
```

---

## 9. Monitoring & Logging

### 9.1 Backend Monitoring

**Install Sentry:**
```bash
npm install @sentry/node
```

**Configure Sentry (`main.ts`):**
```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

### 9.2 Application Performance Monitoring (APM)

**New Relic:**
```bash
npm install newrelic
```

**DataDog:**
```bash
npm install dd-trace --save
```

### 9.3 Logging

**Winston Logger:**
```bash
npm install winston
```

**Configure Winston:**
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});
```

---

## 10. Troubleshooting

### 10.1 Common Issues

**Backend not connecting to MongoDB:**
```bash
# Check MongoDB connection string
# Whitelist IP address in MongoDB Atlas
# Verify network connectivity
ping cluster0.xxxxx.mongodb.net
```

**AI Optimizer timeout:**
```bash
# Increase timeout in backend
# Check Google API quotas
# Verify API keys are correct
```

**Frontend can't connect to backend:**
```bash
# Check CORS configuration
# Verify API_BASE_URL in frontend .env
# Check network connectivity
```

### 10.2 Health Checks

**Backend Health Check:**
```bash
curl http://localhost:3000/health
# Expected: {"status": "ok"}
```

**AI Optimizer Health Check:**
```bash
curl http://localhost:5000/
# Expected: {"message": "AI Optimizer Service"}
```

### 10.3 Logs

**Backend Logs (PM2):**
```bash
pm2 logs travel-app-backend
```

**Docker Logs:**
```bash
docker-compose logs -f backend
docker-compose logs -f ai-optimizer
```

**Heroku Logs:**
```bash
heroku logs --tail --app travel-app-backend
```

---

## Conclusion

Hệ thống Travel App đã sẵn sàng để triển khai lên production. Đảm bảo:

- ✅ Tất cả environment variables được cấu hình đúng
- ✅ Database indexes đã được tạo
- ✅ API keys có đủ quota và permissions
- ✅ SSL certificates được cài đặt
- ✅ Monitoring và logging được kích hoạt
- ✅ Backup strategy được thiết lập

**Next Steps:**
1. Thiết lập backup tự động cho MongoDB
2. Cấu hình CDN cho static assets
3. Implement rate limiting
4. Thiết lập alerting system
5. Performance testing

---

**Document Version:** 1.0.0  
**Maintained by:** Development Team
