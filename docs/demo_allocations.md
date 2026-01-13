# Demo allocations capture

When a user allocates funds from `/demo/strategy.html`, a new row is inserted into `demo_allocations` to record the action and seed cached performance fields.

## Insert payload
- `demo_profile_id`: ID of the demo profile making the allocation.
- `strategy_id`: Strategy being allocated to.
- `amount_invested`: Amount allocated in the account/base currency.
- `base_currency`: Currency used for the allocation.
- `start_date`: Allocation date (set to the current day).
- `end_date`: Left `NULL` on creation.
- `status`: Set to `active` on creation.
- `portfolio_holdings` / `asset_allocation`: Pulled from the latest `strategy_metrics` for the strategy.
- Performance series fields are initialized as empty arrays and `latest_value`/`latest_return_pct` are stored as `NULL`.

If the insert fails, the UI logs a warning but continues with the profile update so the user experience is not blocked.
