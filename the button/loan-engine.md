# Loan Engine TODO Checklist

- [x] Credit Score (Experian) · 25% · normalize 300-850 CompuScore and apply weight
- [x] Credit Utilization Ratio · 5% · pull revolving balances/limits from Experian NLR/CCA or bank feeds
- [x] Adverse Listings · 10% · count adverse accounts/judgments and map to score tiers
- [x] Income Stability · 10% · automatic 100% for Government employees; private sector pending payroll/bank data(only 100 for government 0% for private sector for now)
- [x] Debt to Income Ratio · 15% · compare borrower income vs. total debt obligations
- [ ] Bank Statement Cashflow · 10% · analyze net inflow/outflow over last 3-6 months
- [x] Employment Tenure · 5% · capture borrower-declared tenure (years × 12 months) from onboarding UI
- [x] Employee Category · 5% · government vs. listed private employers with CSV-backed lookup
- [x] Contract Type · 5% · capture borrower-declared contract type (perm, probation, fixed-term, self-employed)
- [x] Agl Retrieval Score · 5% · automatic 100% grant (until Algolend API integration)
- [x] Algolend Repayment History · 3% · ask borrower if brand-new (100%) or existing (50%) until live feeds
- [x] Device (IP) Risk · 2% · derive fraud signals from client IP/device fingerprint

**Current coverage:** 90% of the total weight (Credit Score 25% + Credit Utilization 5% + Adverse Listings 10% + Debt-to-Income 15% + Employment Tenure 5% + Contract Type 5% + Employment Category 5% + Income Stability 10% + AGL Retrieval 5% + Algolend Repayment 3% + Device/IP 2%) has live scoring. Remaining 10% is pending bank statement cashflow analysis.