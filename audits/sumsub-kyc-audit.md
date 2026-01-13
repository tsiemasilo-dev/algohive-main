# AlgoHive Sumsub KYC Flow Audit

## Scope
- Onboarding Sumsub integration (frontend `public/onboarding.html`).
- Sumsub API routes under `api/samsub/kyc/`.
- Vercel CSP configuration (`vercel.json`).

## Findings

### ✅ Duplicate applicant handling
- `POST /api/samsub/kyc/create-applicant` trims `externalUserId`, posts to Sumsub, and on `409` re-fetches the existing applicant by `externalUserId` instead of creating a duplicate.【F:api/samsub/kyc/create-applicant.js†L45-L83】
- Both session initialisers (`init.js` token flow and `init-websdk.js` link flow) follow the same pattern: attempt creation, catch the `409`, retrieve the existing applicant, and continue.【F:api/samsub/kyc/init.js†L42-L105】【F:api/samsub/kyc/init-websdk.js†L40-L97】

### ✅ WebSDK link/token generation
- `init-websdk` issues `POST /resources/sdkIntegrations/levels/-/websdkLink` with `ttlInSecs`, `levelName`, and `userId` = `externalUserId`, plus optional identifiers—matching Sumsub’s guidance for WebSDK resumes.【F:api/samsub/kyc/init-websdk.js†L73-L94】
- `init` (modal/token path) requests `POST /resources/accessTokens` with the same `externalUserId`, satisfying the alternative integration path.【F:api/samsub/kyc/init.js†L85-L103】

### ✅ Frontend entry point
- The onboarding CTA calls `/api/samsub/kyc/init-websdk` with `externalUserId = supabaseUser.id`, ensuring a stable identifier per logged-in account, and redirects the browser to the returned WebSDK URL on every click.【F:public/onboarding.html†L1717-L1726】【F:public/onboarding.html†L2758-L2778】

### ⚠️ Resume UX gaps
- `startSamsubVerification` never records the returned WebSDK link or any applicant identifier; the helper `markSamsubPending` is defined but never invoked. As a result, `samsubApplicantId` remains `null` unless something outside this repo persists it, so the UI keeps showing “Start” and `checkSamsubStatus` refuses to run because it requires a populated applicant id.【F:public/onboarding.html†L2667-L2681】【F:public/onboarding.html†L2758-L2792】【F:public/onboarding.html†L3120-L3134】
- Without persisting the applicant id when launching the session, users who return mid-flow cannot trigger the built-in status poller or copy/resend link tools, despite backend support for reuse. Consider updating the start handler (or the API response) to surface the applicant id and call `markSamsubPending`/`applySamsubLink` accordingly.

### ⚠️ CSP configuration
- `vercel.json` allows `frame-src https://web.sumsub.com` but omits the regional host returned by the WebSDK (`https://in.sumsub.com`). Embedding the link in an iframe (as the UI attempts via `sumsubIframe`) will be blocked by CSP until the regional domain is whitelisted.【F:vercel.json†L1-L15】【F:public/onboarding.html†L1831-L1843】

## Recommendations
1. Update the WebSDK init response or client handler to capture the applicant id (and latest link), call `markSamsubPending`, and persist it so “Resend”/status checks function after the first launch.
2. Extend `frame-src` in `vercel.json` with `https://in.sumsub.com` (and any other regional domains in use) to match the WebSDK URLs Sumsub issues.

With those adjustments, the flow will satisfy the duplicate-safe resume behaviour end to end.
