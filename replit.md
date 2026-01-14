# AlgoHive

## Overview
AlgoHive is an investment portfolio platform offering ready-made investment strategies. It's a Node.js/Express application serving static HTML pages with a Supabase backend.

## Project Structure
- `public/` - Static HTML/JS/CSS files for the frontend
- `api/` - Serverless-style API endpoints (adapted for Express)
- `server.js` - Express server serving static files and API routes
- `samsubServices.js` - Sumsub KYC service utilities

## Tech Stack
- **Runtime**: Node.js 20
- **Server**: Express.js
- **Database/Auth**: Supabase (external)
- **Frontend**: Static HTML with Tailwind CSS, React (via CDN), Chart.js
- **Third-party APIs**: Sumsub (KYC), Paystack (payments), Alpaca (trading)

## Running the Application
The application runs on port 5000:
```bash
node server.js
```

## API Endpoints
- `GET /api/health` - Health check
- `POST /api/auth/signin` - User sign in
- `POST /api/auth/signup` - User sign up
- `GET /api/alpaca/account` - Alpaca trading account info
- `POST /api/paystack/init` - Initialize Paystack payment
- `POST /api/samsub/kyc/init` - Initialize Sumsub KYC
- `POST /api/samsub/kyc/access-token` - Get Sumsub access token
- `POST /api/samsub/kyc/create-applicant` - Create KYC applicant
- `POST /api/samsub/kyc/init-websdk` - Initialize Sumsub WebSDK
- `POST /api/samsub/kyc/websdk-link` - Get Sumsub WebSDK link
- `GET /api/samsub/kyc/status/:applicantId` - Get KYC status

## Password Security Requirements
The application enforces strong password requirements:
- Minimum 8 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one number (0-9)
- At least one special character (!@#$%^&*()-_+={}[]|;:,.?/)

The signup page displays a password strength indicator (Weak/Medium/Strong/Very Strong) with a visual progress bar.

### Weak Password Update Flow
When existing users log in with a password that doesn't meet current requirements, they see a non-dismissable modal prompting them to:
1. Enter a new password that meets all requirements
2. Confirm the new password
3. Either update their password or cancel (which signs them out)

This is handled client-side without sending password reset emails - the user is already authenticated so we can update their password directly via Supabase's `auth.updateUser()`.

## UI Consistency
- Profile avatars use 2-letter initials (first name + last name initials) with consistent dark circular styling
- Markets dropdown shows "US Stocks" (active) and "South African Stocks — Coming Soon" (disabled)
- Status badges use formatted text (e.g., "Trading Universe" instead of "trading_universe")

## Environment Variables (Optional)
The app has hardcoded defaults but can be configured via:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUMSUB_APP_TOKEN` - Sumsub API token
- `SUMSUB_SECRET_KEY` / `SUMSUB_APP_SECRET` - Sumsub secret
- `PAYSTACK_SECRET_KEY` - Paystack secret key
- `ALPACA_KEY_ID` - Alpaca API key
- `ALPACA_SECRET_KEY` - Alpaca secret key
