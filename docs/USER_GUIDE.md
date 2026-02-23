# Stakd End User Guide

Last updated: February 23, 2026

## 1. Who This Guide Is For

This guide is for everyday users of Stakd who want to:

- track crypto positions safely,
- understand how values and P&L are calculated,
- use rebalancing features correctly,
- manage passphrase and data deletion safely.

It is written for product usage, not development setup.

## 2. Core Security Model (Read This First)

Stakd is designed as a zero-knowledge portfolio app.

- Your portfolio vault is encrypted client-side before upload.
- The server stores encrypted vault blobs, not your plaintext portfolio.
- Your passphrase derives encryption/authentication keys in the browser.
- If you lose your passphrase, your vault cannot be recovered.

Important implications:

1. Save your passphrase in a secure password manager.
2. Do not share your exported vault backup file (it is sensitive plaintext JSON).
3. Use a strong passphrase (minimum 8 characters, longer is strongly recommended).

## 3. Account Setup and Login

### 3.1 Create an Account

1. Open the app.
2. Switch to `Register`.
3. Enter `Username`.
4. Enter and confirm `Passphrase`.
5. Click `Create Account`.
6. Save the passphrase when the confirmation screen appears.
7. Click `I have saved my passphrase`.

### 3.2 Sign In

1. Select `Login`.
2. Enter username + passphrase.
3. Click `Sign In`.

The app derives keys locally, authenticates, and decrypts your vault.

### 3.3 Logout / Lock Behavior

- `Logout` clears auth session and local encryption key.
- You must sign in again to decrypt vault data.
- Encryption key is stored in `sessionStorage` and is not persistent across full session loss.

## 4. App Navigation

Main sidebar pages:

- `Dashboard` — overview, allocation, health alerts.
- `Portfolio` — transactions, manual entries, import/export.
- `Rebalance` — targets, strategy suggestions, execution session.
- `History` — value timeline and realized P&L timeline.
- `Settings` — passphrase, rebalance settings, danger zone.
- `Rebalance Guide` — in-app strategy education page.

## 5. Dashboard

Dashboard shows:

- Total Value
- Total P&L
- Total Fees
- Asset count
- Rebalance alerts
- Allocation chart
- Portfolio history chart
- Category breakdown (if categories are configured)

Price freshness:

- A badge shows relative age (`Prices: x minutes ago`).
- If price data is old, status becomes stale.
- Click `Refresh` to request fresh prices.

Alert behavior:

- Deviation alerts compare current allocation vs saved targets.
- Dashboard concentration alerts trigger when a token exceeds roughly 40% weight.
- Rebalance page concentration alerts are stricter (roughly 30%+).

## 6. Portfolio Page

### 6.1 Transaction Types and Meaning

- `Buy`: increases quantity, adds cost basis.
- `Sell`: decreases quantity, realizes P&L.
- `Receive`: increases quantity with zero purchase cost basis.
- `Send`: decreases quantity without realizing P&L.

### 6.2 How Holdings Are Grouped

Holdings are grouped by:

- `Token Symbol (uppercased)` + `CoinGecko ID`.

If you use the same symbol with different CoinGecko IDs, they are treated as separate holdings.

### 6.3 Add Transaction (Dedicated Add Page)

Recommended workflow:

1. Click `Add Transaction`.
2. Search token in the CoinGecko-based search box.
3. Choose the correct token result.
4. Confirm symbol, name, and CoinGecko ID.
5. Enter quantity, price, fee, date, note.
6. Submit.

Notes:

- Search results are prioritized by Binance-available tokens.
- App auto-fetches token price when possible.
- For `Receive/Send`, UI pre-fills price as `0` (you can adjust if needed).
- If you manually change token fields after selecting search result, a warning appears.

### 6.4 Holdings Table

Common columns:

- `Qty` — current quantity.
- `Avg Cost` — average buy cost basis per unit.
- `Price` — current USD price.
- `Value` — current USD position value.
- `Unrealized P&L` — mark-to-market profit/loss for open quantity.
- `Realized P&L` — sell-result P&L based on running average cost basis.
- `24h Change` — weighted portfolio change effect.
- `Fees` — cumulative transaction fees.
- `Held` — age based on earliest `buy/receive` date.

### What `Held 0d` means

`Held 0d` means the earliest recorded acquisition date for that holding is today (less than 1 full day elapsed).

Display rules:

- `< 30 days`: `Xd`
- `>= 30 days`: `Xm`
- `>= 365 days`: `Xy`

### 6.5 Quick Add/Adjust from Portfolio

Inside holdings you can:

- add quick `buy/sell/receive/send`,
- repeat the last transaction style,
- edit and delete existing transactions.

### 6.6 Manual Entries (Quick Add Holdings)

Use manual entries when you know current holdings but do not want to reconstruct full transaction history.

Behavior:

- Manual entries are merged into holdings totals.
- You can optionally set `Initial Price (USD)` in Quick Add. If it is greater than 0, Stakd saves it as a `Buy` transaction to preserve cost basis.
- If a holding only has manual quantity and no buy cost basis, cost-based P&L metrics are limited.
- CoinGecko ID is optional but strongly recommended for pricing.

Manual symbol input includes search suggestions with Binance marker where available.

### 6.7 CSV Export / Import

#### Export

- Click `Export` to download transactions as CSV.

#### Import

1. Click `Import`.
2. Select CSV file.
3. Review parsed preview.
4. Fix validation errors if any.
5. Confirm import.

Required columns:

- `Date`
- `Symbol`
- `Quantity`
- `Price`

Supported optional columns:

- `Type` (`buy`, `sell`, `receive`, `send`; defaults to `buy` if omitted)
- `Name`
- `Fee`
- `Note`
- `CoinGecko ID`

Validation basics:

- Quantity must be positive.
- Price must be non-negative.
- Fee must be non-negative.
- Date must be parseable.

### 6.8 Portfolio Keyboard Shortcuts

- `/` focus search
- `Ctrl/Cmd + I` open import modal
- `Esc` close modal/forms
- `Ctrl/Cmd + Enter` submit active form

## 7. Price Data, Refresh, and Provider Fallbacks

Stakd uses a source cascade to reduce CoinGecko rate-limit risk:

1. Binance (primary)
2. OKX
3. Bybit
4. MEXC
5. Gate
6. CoinGecko (last fallback)

Regional note:

- Bybit public APIs may be unavailable from some regions/IP ranges. The app handles this by continuing down the provider cascade.

### 7.1 CoinGecko Protection

CoinGecko fallback is rate-controlled per token with cooldown (target around 4 fetches/day/token).

Why this matters:

- avoids quick provider throttling on public multi-user deployments,
- reduces total external API pressure,
- keeps CoinGecko as safety net rather than primary path.

### 7.2 Why a Token Might Show Zero or Stale Price

Possible reasons:

1. Token is unavailable across exchange sources and CoinGecko is in cooldown window.
2. Token was just added and only placeholder price exists.
3. External provider timeout/network issue occurred.
4. Symbol/ID mapping is incomplete or ambiguous.

Usually the next refresh cycle resolves this when provider data is available.

### 7.3 Refresh Behavior

- Prices are fetched periodically in the client.
- Prices are also refreshed on the server in the background (independent of user login) when enabled.
- Manual refresh can be triggered from dashboard/rebalance flows.
- Server-side refresh requests are debounced to avoid excessive churn.
- `Auto-refresh` in Settings controls scheduled client refresh interval.

Current practical timings:

- Client polling: every ~60 seconds.
- Server refresh debounce: ~60 seconds.
- Background server refresh interval: configurable via `PRICES_BACKGROUND_REFRESH_MINUTES` (default: 15).
- CoinGecko fallback cooldown (per token): ~6 hours.

## 8. Rebalance Page

Rebalancing in Stakd is advisory. It does not place exchange orders automatically.

### 8.1 Setup Targets

1. Add target rows (`symbol`, `target %`, optional `CoinGecko ID`).
2. Make sure total target allocation is intentional.
3. Save targets.
4. Review generated suggestions.

You can also:

- use allocation templates,
- auto-generate equal weights,
- add untargeted tokens quickly.

### 8.2 Token Groups

Groups let you rebalance related tokens as one logical target.

Example:

- Group `ETH Ecosystem` with `ETH, STETH, WSTETH`.

### 8.3 Asset Categories

Assign tokens to categories (stablecoin, large-cap, defi, etc.) for risk visibility and breakdown views.

### 8.4 Strategy Modes

#### Threshold

- Trade when deviation exceeds hold zone and amount exceeds minimum trade size.

#### Calendar

- Rebalance only on schedule (weekly/monthly/quarterly).
- If schedule is not due yet, suggestions are held.

#### Percent-of-Portfolio

- Trade only when drift impact exceeds configured percentage of effective portfolio size.

#### Risk-Parity

- Computes target weights inverse to volatility.
- If volatility coverage is incomplete, falls back to your saved targets.

#### DCA-Weighted

- Splits each trade into multiple chunks over time.
- Suggestions show chunk-sized amounts plus DCA schedule.

### 8.5 Suggestion Fields

- `Action`: buy/sell/hold
- `Amount`: suggested gross trade amount (USD)
- `Estimated Slippage`: cost estimate from slippage setting
- `Estimated Fee`: cost estimate from fee setting
- `Net Amount`: buy includes costs, sell subtracts costs

### 8.6 Alerts

Rebalance page highlights:

- deviation alerts,
- concentration alerts,
- untargeted portfolio tokens,
- execution priority (sells first, then buys).

### 8.7 Execution Session and Recording Trades

Suggested workflow:

1. Start execution session.
2. Execute trades on exchange/broker externally.
3. Mark progress in session.
4. At completion, record executed trades into vault transactions.
5. Provide actual filled quantities before save.

This keeps portfolio history and future rebalancing context accurate.

### 8.8 What-If Calculator

Use What-If to simulate hypothetical buy/sell changes before committing real entries.

### 8.9 Export

Rebalance reports can be exported for review/audit.

## 9. History Page

History includes:

- Portfolio value-over-time line chart.
- Realized P&L timeline from sell transactions.
- Snapshot list (timestamp + portfolio value).

Snapshot behavior:

- snapshots are created when meaningful changes occur,
- minimum interval is about 30 minutes unless value change is significant,
- significant change threshold is about 0.5%,
- oldest snapshots are pruned after internal cap (about 2000 snapshots).

Realized P&L model:

- based on running average cost basis at sell time.
- `Send` transfers reduce inventory but do not realize P&L.

## 10. Settings Page

### 10.1 Change Passphrase

Process summary:

1. Enter current passphrase.
2. Enter + confirm new passphrase.
3. App verifies current credentials.
4. Vault is re-encrypted client-side with new key.
5. Server updates auth hash + salt + encrypted vault.

If this flow fails, do not assume passphrase changed. Re-check before logging out.

### 10.2 Rebalance Settings Reference

| Setting | Typical Default | Used By | Effect |
|---|---:|---|---|
| Hold Zone (%) | 5 | All strategies | No trade if deviation is within hold zone. |
| Minimum Trade Size (USD) | 50 | All strategies | Filters tiny trades. |
| Buy-Only Mode | Off | All strategies | Converts sell suggestions to hold; for cash deployment workflows. |
| New Cash to Deploy (USD) | 0 | Buy-only context | Adds investable cash for suggestions. |
| Cash Reserve (USD / %) | 0 / 0 | All strategies | Keeps part of capital unallocated. |
| Dust Threshold (USD) | 1 | Rebalance display logic | Treats tiny positions as dust in suggestion context. |
| Slippage (%) | 0.5 | All strategies | Estimated execution cost. |
| Trading Fee (%) | 0.1 | All strategies | Estimated fee cost. |
| Auto-Refresh (minutes) | 0 | Price refresh scheduling | 0 disables periodic refresh. |
| Strategy | threshold | Rebalance engine | Selects strategy algorithm. |
| Rebalance Interval | monthly | Calendar only | Weekly/monthly/quarterly gate. |
| Portfolio Change Threshold (%) | 5 | Percent-of-Portfolio only | Drift impact trigger. |
| Volatility Lookback Days | 30 | Risk-Parity only | Volatility computation window. |
| Number of Chunks | 4 | DCA only | Trade split count. |
| Days Between Chunks | 7 | DCA only | Chunk interval schedule. |

### 10.3 Danger Zone (Destructive Actions)

Every danger action requires:

1. current passphrase verification,
2. confirmation keyword `DELETE`,
3. cooldown countdown completion.

Available actions:

- `Delete portfolio data`
  - clears transactions, manual entries, rebalance targets/sessions/logs, snapshots, groups, categories
  - keeps account and settings
- `Delete settings`
  - clears settings only
  - keeps portfolio records
- `Delete all vault data`
  - resets vault to empty
  - logs out
  - account remains
- `Delete account`
  - removes account and associated server data (vault, sessions, preferences) via cascade delete
  - logs out and clears local auth state

### 10.4 Export Backup

`Export Backup` downloads current vault JSON for safekeeping.

Important:

- treat this file as sensitive,
- protect it with secure local storage/encryption,
- do not upload it to public cloud drives unencrypted.

## 11. Data Management and Recovery

There is no passphrase reset for encrypted vault recovery.

Best practice checklist:

1. Save passphrase in password manager.
2. Export backups periodically.
3. Verify backup readability after export.
4. Before dangerous deletes, export backup first.

## 12. Multi-User Privacy Notes (For Public Deployments)

For users:

- operator cannot read plaintext portfolio vault contents.
- operator can still see infrastructure-level metadata (API traffic, timestamps, IP logs depending on deployment).

For service operators:

- avoid collecting unnecessary logs that could expose user behavior patterns.
- do not store exported plaintext backups server-side by default.
- publish a clear privacy policy explaining metadata handling.

## 13. Troubleshooting

### 13.1 I cannot log in

Check:

1. Username exact spelling.
2. Correct passphrase.
3. Keyboard layout/caps lock.

If passphrase is lost, vault decryption is not recoverable.

### 13.2 Prices look stale

Try:

1. Manual refresh.
2. Wait for next auto-refresh cycle.
3. Confirm token has valid CoinGecko ID and symbol mapping.

Some long-tail tokens may need fallback windows before CoinGecko retry.

### 13.3 I see unexpected P&L values

Verify:

1. Transaction types were entered correctly.
2. Fees were included correctly.
3. Manual entries are not assumed to have historical cost basis.

### 13.4 Rebalance says hold when I expected a trade

Common causes:

1. Deviation is within hold zone.
2. Trade size is below minimum trade size.
3. Buy-only mode suppresses sells.
4. Calendar strategy is blocked until next interval.

### 13.5 Save conflict / version conflict

Vault writes use optimistic concurrency. If a conflict occurs:

1. reload/sync vault,
2. re-apply latest edits if needed,
3. save again.

## 14. FAQ

### Q: Is this an exchange trading bot?

No. Stakd computes suggestions and records executed trades. It does not execute trades automatically on exchanges.

### Q: Does Stakd support multiple fiat currencies?

Current valuation is USD-only across the app.

### Q: Why does a newly added token sometimes show `$0` first?

If primary exchanges do not have the symbol and CoinGecko fallback is rate-limited or cooling down, a temporary placeholder may be shown until the next eligible refresh.

### Q: What does `Held 0d` mean?

The position's first recorded acquisition (`buy`/`receive`) is less than one full day old.
