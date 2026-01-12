# replit.md

## Overview

Credit Pulse Engine is a credit assessment and loan eligibility platform that integrates with Experian's credit bureau API to evaluate borrower creditworthiness. The system performs credit checks, calculates weighted loan eligibility scores across multiple factors, and provides detailed breakdowns of credit exposure, adverse listings, and employment verification.

The core functionality centers on a multi-factor "Loan Engine" that weights various credit and employment indicators to produce a composite eligibility score for lending decisions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **API Pattern**: RESTful endpoints serving both static HTML files and JSON API responses
- **Entry Point**: `server.js` handles HTTP routing and loan engine calculations

### Credit Check Service
- **External Integration**: Experian SOAP API for credit bureau data
- **Data Processing**: XML parsing via `xml2js` for Experian responses
- **File Compression**: `adm-zip` for handling compressed credit report data
- **Mock Mode**: Environment-configurable mock mode for development (`EXPERIAN_MOCK=true`)

### Bank Statement Analysis (Stitch Money Integration)
- **Service**: Stitch Money Open Banking API for automated bank account linking
- **Authentication**: OAuth 2.0 flow with secure server-side state validation
- **API Type**: GraphQL queries for bank accounts and transactions
- **Analysis Features**:
  - Automatic income consistency calculation (coefficient of variation)
  - 3-month average balance tracking
  - Overdraft detection and counting
  - Gambling transaction identification (betway, hollywoodbets, etc.)
- **Service File**: `stitchService.js` handles all Stitch API interactions
- **Endpoints**:
  - `GET /api/stitch/status` - Check if Stitch is configured
  - `GET /api/stitch/link/:userId` - Generate OAuth authorization URL
  - `GET /api/stitch/callback` - Handle OAuth callback with state validation
  - `GET /api/stitch/analyze/:userId` - Perform bank statement analysis
  - `GET /api/stitch/linked/:userId` - Check if user has linked bank

### Loan Engine Scoring System
The server implements a weighted scoring algorithm with these components:
| Factor | Weight |
|--------|--------|
| Credit Score (Experian CompuScore) | 25% |
| Debt-to-Income Ratio | 15% |
| Adverse Listings | 10% |
| Income Stability | 10% |
| Bank Statement Cashflow | 10% |
| Credit Utilization | 5% |
| Employment Tenure | 5% |
| Employment Category | 5% |
| Contract Type | 5% |
| Algolend Retrieval Score | 5% |
| Algolend Repayment History | 3% |
| Device/IP Risk | 2% |
| Bank Statement Cashflow | 10% |

### Frontend Architecture
- **Approach**: Static HTML files with embedded CSS and vanilla JavaScript
- **Styling**: Custom CSS with CSS variables for theming, Space Grotesk font
- **Icons**: Font Awesome CDN integration
- **Layout**: Responsive sidebar layout with mobile overlay support

### Data Storage
- **Current**: File-based JSON storage (`data/credit-checks.json`)
- **Pattern**: Simple append-only log of credit check results with UUIDs
- **Note**: No database currently configured; file-based storage is used for persistence

## External Dependencies

### Third-Party APIs
- **Experian Credit Bureau**: SOAP-based NormalSearchService API for South African credit data
  - Credentials configured via environment variables
  - Returns XML containing credit scores, account histories, judgments, and adverse listings

### NPM Packages
| Package | Purpose |
|---------|---------|
| express | HTTP server framework |
| axios | HTTP client for Experian API calls |
| xml2js | XML parsing for SOAP responses |
| adm-zip | ZIP file handling for credit report attachments |
| cors | Cross-origin resource sharing middleware |
| dotenv | Environment variable management |
| nodemon | Development auto-reload (dev dependency) |

### CDN Resources
- Font Awesome 6.5.2 for iconography
- Google Fonts (Space Grotesk)

### Environment Variables Required
**Experian API:**
- `EXPERIAN_URL` - Experian API endpoint
- `EXPERIAN_USERNAME` - API authentication
- `EXPERIAN_PASSWORD` - API authentication
- `EXPERIAN_VERSION` - API version
- `EXPERIAN_ORIGIN` - Client identifier
- `EXPERIAN_ORIGIN_VERSION` - Client version
- `EXPERIAN_MOCK` - Enable mock mode for development

**Stitch Money API:**
- `STITCH_CLIENT_ID` - Stitch OAuth client ID
- `STITCH_CLIENT_SECRET` - Stitch OAuth client secret
- `STITCH_REDIRECT_URI` - OAuth callback URL (optional, defaults to app domain)