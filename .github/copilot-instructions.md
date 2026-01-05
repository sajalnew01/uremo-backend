# UREMO Backend Copilot Instructions

## Project Overview

UREMO is an Express.js backend API built with Node.js and MongoDB. The active codebase is in `uremo-backend/` directory (root `src/` folders are not yet implemented). The project includes authentication (JWT), file uploads (Cloudinary), payments (Stripe), and email services (Resend).

## Technology Stack

- **Framework**: Express.js 5.2.1
- **Database**: MongoDB with Mongoose 9.1.1
- **Auth**: JWT (jsonwebtoken) with bcryptjs for password hashing
- **File Upload**: Multer + Cloudinary integration
- **Payments**: Stripe SDK
- **Email**: Resend API
- **Rate Limiting**: express-rate-limit
- **Dev Tool**: Nodemon for auto-reload
- **Configuration**: dotenv for environment variables

## Directory Structure

```
uremo-backend/src/
├── app.js           # Express app configuration (CORS, JSON middleware setup)
├── server.js        # Server entry point (DB connection, port setup)
├── config/          # DB connection, environment variables
├── controllers/     # Business logic handlers for routes
├── models/          # Mongoose schemas
├── routes/          # API endpoint definitions
├── middlewares/     # Authentication, validation, error handling
└── utils/           # Helper functions, constants
```

## Key Architectural Patterns

### 1. MVC Architecture

- **Models**: Mongoose schemas in `models/` (define data structure & validation)
- **Controllers**: Business logic in `controllers/` (handle requests, process data)
- **Routes**: API endpoints in `routes/` (HTTP method mappings to controllers)

### 2. Middleware Pattern

- Authentication middleware for protected routes (JWT verification expected in `middlewares/`)
- Rate limiting for API protection (express-rate-limit already installed)
- CORS enabled globally in `app.js`

### 3. Configuration Management

- Use `dotenv` for environment variables (`.env` file expected but not in repo)
- Database connection in `config/db.js` (imports Mongoose)
- Cloudinary, Stripe, and Resend credentials stored as env vars

## Development Workflow

### Setup

```bash
cd uremo-backend
npm install
nodemon src/server.js  # Auto-reload on file changes
```

### Environment Variables Required

Create `.env` in `uremo-backend/`:

```
PORT=5000
MONGODB_URI=<your_mongo_connection>
JWT_SECRET=<your_jwt_secret>
CLOUDINARY_NAME=<cloudinary_account>
CLOUDINARY_API_KEY=<cloudinary_key>
CLOUDINARY_API_SECRET=<cloudinary_secret>
STRIPE_SECRET_KEY=<stripe_key>
RESEND_API_KEY=<resend_key>
```

### Current Development State

- Basic Express setup with CORS enabled
- No routes, controllers, or models implemented yet
- All `models/`, `controllers/`, `routes/` directories are empty
- Ready for feature development

## Common Tasks

### Adding a New API Route

1. Create model in `models/YourModel.js`
2. Create controller in `controllers/yourController.js`
3. Create route file in `routes/yourRoutes.js`
4. Import and register route in `app.js`: `app.use('/api/your-path', routeHandler)`

### Authentication

- Expect JWT tokens in Authorization header: `Bearer <token>`
- Middleware pattern: verify token and attach user to `req.user`
- Use bcryptjs for password hashing in user registration

### File Uploads

- Use Multer with Cloudinary storage (already configured in dependencies)
- Storage setup likely in middleware or utils
- Return Cloudinary URL in response

### Database Operations

- Connect to MongoDB via Mongoose in `server.js` before starting server
- Use schema validation and indexes for performance
- Handle connection errors gracefully

## Code Conventions (Infer from Stack)

- Use async/await for asynchronous operations (not callbacks)
- Structure responses consistently: `{ success: boolean, data/error, message }`
- Use descriptive variable names following camelCase
- Keep controller functions focused on single responsibilities
- Implement input validation before database operations
- Return appropriate HTTP status codes (200, 201, 400, 401, 404, 500)

## Integration Points

- **Cloudinary**: Image/file storage via multer-storage-cloudinary
- **Stripe**: Payment processing (webhook handling expected)
- **Resend**: Email notifications (verify endpoint integration)
- **MongoDB Atlas**: Production database (connection via MONGODB_URI)

## Known Limitations

- Test script not configured (`npm test` currently throws error)
- No API documentation/Swagger setup yet
- No error logging system configured
- Rate limiting setup incomplete (middleware not created)

## Next Steps for New Contributors

1. Review `server.js` entry point to understand initialization
2. Start with models (database schema design)
3. Implement controllers using database models
4. Create routes connecting controllers to HTTP endpoints
5. Add middleware for auth/validation as routes grow
