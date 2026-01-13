# Gating logic fields by page

This document lists the profile fields used to determine completion gates for each page that defines gating helpers or profile-completion checks. The lists below are pulled directly from the `REQUIRED_PROFILE_FIELDS` or `REQUIRED_FIELDS` arrays in each page.

## public/home.html

**Required profile fields**
- first_name
- last_name
- phone
- address_line1
- address_city
- address_state
- address_postal_code
- dob
- id_number
- tax_id_type
- tax_id_number
- country_birth
- nationality
- country_residence
- employment_status
- occupation
- employer
- source_of_funds
- experience_level
- risk_tolerance
- annual_income_min
- annual_income_max
- liquid_net_worth_min
- liquid_net_worth_max
- total_net_worth_min
- total_net_worth_max
- objectives

**Additional gate**
- KYC status must resolve as done/verified via `kyc_status`.

## public/onboarding.html

**Required profile fields**
- first_name
- last_name
- phone
- address_line1
- address_city
- address_state
- address_postal_code
- dob
- id_number
- tax_id_type
- tax_id_number
- country_birth
- nationality
- country_residence
- employment_status
- occupation
- employer
- source_of_funds
- experience_level
- risk_tolerance
- annual_income_min
- annual_income_max
- liquid_net_worth_min
- liquid_net_worth_max
- total_net_worth_min
- total_net_worth_max
- objectives

**Additional gate**
- Redirects to `/home.html` when an existing plan is present *and* KYC is complete via `kyc_status`.

## public/strategy.html

**Required profile fields**
- first_name
- last_name
- phone
- dob
- id_number
- nationality
- country_residence
- employment_status
- occupation
- employer
- income_bracket
- source_of_funds
- net_worth_range
- experience_level
- risk_tolerance
- objectives

**Additional gate**
- KYC status must resolve as done/verified via `kyc_status`.

## public/strategies.html

**Required profile fields**
- first_name
- last_name
- phone
- dob
- id_number
- nationality
- country_residence
- employment_status
- occupation
- employer
- income_bracket
- source_of_funds
- net_worth_range
- experience_level
- risk_tolerance
- objectives

**Additional gate**
- KYC status must resolve as done/verified via `kyc_status`.

## public/my-strategies.html

**Required profile fields**
- first_name
- last_name
- phone
- dob
- id_number
- nationality
- country_residence
- employment_status
- occupation
- employer
- income_bracket
- source_of_funds
- net_worth_range
- experience_level
- risk_tolerance
- objectives

**Additional gate**
- KYC status must resolve as done/verified via `kyc_status`.

## public/support.html

**Required profile fields**
- first_name
- last_name
- phone
- dob
- id_number
- nationality
- country_residence
- employment_status
- occupation
- employer
- income_bracket
- source_of_funds
- net_worth_range
- experience_level
- risk_tolerance
- objectives

**Additional gate**
- KYC status must resolve as done/verified via `kyc_status`.

## public/reset.html

**Required profile fields**
- first_name
- last_name
- phone
- dob
- id_number
- nationality
- country_residence
- employment_status
- occupation
- employer
- income_bracket
- source_of_funds
- net_worth_range
- experience_level
- risk_tolerance
- objectives

**Additional gate**
- KYC status must resolve as done/verified via `kyc_status`.

## public/settings.html

**Required profile fields**
- first_name
- last_name
- phone
- dob
- id_number
- nationality
- country_residence
- employment_status
- occupation
- employer
- income_bracket
- source_of_funds
- net_worth_range
- experience_level
- risk_tolerance
- objectives

**Additional gate**
- KYC status must resolve as done/verified via `kyc_status`.

## public/settings-original.html

**Required profile fields**
- first_name
- last_name
- phone
- dob
- id_number
- nationality
- country_residence
- employment_status
- occupation
- employer
- income_bracket
- source_of_funds
- net_worth_range
- experience_level
- risk_tolerance
- objectives

**Additional gate**
- KYC status must resolve as done/verified via `kyc_status`.

## public/auth.html

**Required profile fields**
- first_name
- last_name
- phone
- dob
- id_number
- nationality
- country_residence
- employment_status
- occupation
- employer
- income_bracket
- source_of_funds
- net_worth_range
- experience_level
- risk_tolerance
- objectives

**Additional gate**
- Used for post-auth routing; KYC status is checked separately during routing.

## public/preauth.html

**Required profile fields**
- first_name
- last_name
- phone
- dob
- id_number
- nationality
- country_residence
- employment_status
- occupation
- employer
- income_bracket
- source_of_funds
- net_worth_range
- experience_level
- risk_tolerance
- objectives

**Additional gate**
- Used for post-auth routing; KYC status is checked separately during routing.

## public/onboardingtest.html

**Required profile fields**
- first_name
- last_name
- phone
- dob
- id_number
- nationality
- country_residence
- employment_status
- occupation
- employer
- income_bracket
- source_of_funds
- net_worth_range
- experience_level
- risk_tolerance
- objectives

**Additional gate**
- KYC status is evaluated alongside profile completeness.

## public/demo/strategy.html

**Required profile fields**
- first_name
- last_name
- phone
- dob
- id_number
- nationality
- country_residence
- employment_status
- occupation
- employer
- income_bracket
- source_of_funds
- net_worth_range
- experience_level
- risk_tolerance
- objectives

**Additional gate**
- KYC status must resolve as done/verified via `kyc_status`.

## public/demo/strategies.html

**Required profile fields**
- first_name
- last_name
- phone
- dob
- id_number
- nationality
- country_residence
- employment_status
- occupation
- employer
- income_bracket
- source_of_funds
- net_worth_range
- experience_level
- risk_tolerance
- objectives

**Additional gate**
- KYC status must resolve as done/verified via `kyc_status`.
