# Fix data plans and transaction integrity

## Goal
Make plan removal reliable and ensure every wallet debit has a matching transaction record, with refunds only on confirmed provider failure.

## Changes

### 1. Remove MTN HOT reliably
- Add a category-level disable/remove action in Admin Data Pricing so all plans under `MTN HOT` are handled together, rather than deleting only one plan row.
- Prefer deactivation over permanent deletion so historical transactions and provider mappings remain traceable.
- Hide inactive categories and plans immediately in the customer data screen.

### 2. Make purchase accounting atomic
- Add backend database operations that perform these steps as single transactions:
  - Create a unique pending transaction and debit the wallet together before contacting the provider.
  - Mark that same transaction completed after confirmed delivery.
  - Refund the wallet and mark the same transaction failed/refunded together after confirmed rejection.
- Add a unique request identifier to prevent duplicate processing when users tap twice or the client retries.
- Restrict these accounting operations to trusted backend functions.

### 3. Update data provider functions
- Migrate RGC and Bonanza data purchases to the atomic workflow.
- Stop inserting a second transaction after the provider responds; update the pending transaction created during debit instead.
- Treat network errors, timeouts, invalid responses, and provider 5xx responses as `pending/unconfirmed`, not failed. The wallet stays debited until reconciliation because delivery may have occurred.
- Refund only when the provider definitively rejects or records the exact order as failed.
- Make transaction-write failures stop processing before any provider request is sent.

### 4. Correct client messaging
- Send a stable request identifier with each purchase.
- Display confirmed failures as refunded failures.
- Display ambiguous responses as “Delivery pending” and direct the user to transaction history instead of saying “Purchase failed.”
- Prevent repeat submission while a request is in progress.

### 5. Improve admin transaction visibility
- Ensure pending/unconfirmed purchases appear in the admin transaction list.
- Surface provider, recipient, plan, request identifier, provider status, and whether a refund occurred.
- Replace the current non-atomic manual refund with the guarded backend refund operation so the same transaction cannot be refunded twice.

## Technical details
- Database migration: add an idempotency/request identifier and atomic security-definer purchase lifecycle functions; revoke direct public execution and grant only the trusted backend role.
- Preserve the existing transaction status enum by using `pending`, `completed`, and `failed`, with refund timestamps/details stored in metadata unless a dedicated field is required by the existing UI.
- Existing mobile versions benefit from the server-side accounting fix immediately; the improved pending message and generated client request identifier require an app update, while old clients remain protected by a server-generated identifier.

## Verification
- Disable all MTN HOT plans and confirm none appear in the customer data selector.
- Test confirmed success, confirmed provider rejection, timeout/ambiguous response, duplicate request, and insufficient balance.
- Verify each debit has exactly one transaction, confirmed failures restore the exact amount once, ambiguous requests remain pending, and admin history shows every attempt.
