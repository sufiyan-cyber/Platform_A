# Halyard — Customer Support Handbook

**Internal · Support team · Revision 11 · Owner: Support Ops**

> Halyard is a fictional company. This document exists so you have something
> realistic to ground an agent on while you're learning the flow. Nothing in it
> refers to a real product, and none of the numbers mean anything outside this file.

---

## 1. What Halyard is

Halyard is invoicing and payment collection for freelancers and small studios. A
customer creates an invoice, sends it as a link, and gets paid by card or bank
transfer. We take a percentage of each payment collected; there is no monthly fee
on the entry plan.

Our support tone: short sentences, no upselling inside a support ticket, and never
apologise twice for the same thing.

---

## 2. Plans and pricing

| Plan | Price | Transaction fee | Seats | Notes |
|---|---|---|---|---|
| Solo | Free | 2.9% + $0.30 | 1 | Up to 5 invoices/month |
| Studio | $18/mo | 1.9% + $0.30 | 5 | Unlimited invoices, custom branding |
| Agency | $59/mo | 1.4% + $0.30 | 25 | Multi-currency, approval workflows |
| Enterprise | Not published | Negotiated | 25+ | Sales-led, contract required |

Billing details:

- Plan changes take effect immediately on upgrade, and at the end of the current
  period on downgrade. Downgrades are never pro-rated.
- Annual billing is 10 months for the price of 12 — i.e. two months free.
- We charge in USD only. The card's issuer handles conversion.
- Invoices for the *subscription itself* go to the account owner's email on the
  1st of each month. Additional billing contacts are an Agency-plan feature.
- **Enterprise pricing is not public and must never be estimated.** Route to sales.

---

## 3. Refunds on our subscription

- Full refund if requested within **14 days** of the initial charge, no reason needed.
- After 14 days: no cash refund. We issue account credit at pro-rata value, which
  expires 12 months after issue.
- Refunds return to the original payment method only. We cannot redirect a refund
  to a different card, a different account, or a bank transfer.
- Processing takes **5–7 business days** to appear on a statement. The bank
  controls that timing, not us.
- Annual plans cancelled mid-term get credit, not cash, regardless of the 14-day rule.

---

## 4. Payouts to customers

This is the most common source of confusion — a customer's *payout* is not our
*subscription*.

- Standard payout schedule: **T+2 business days** after the payer's funds clear.
- First payout on a new account is held **7 days** for fraud review. This is not
  negotiable and not a penalty; it happens to every new account.
- Minimum payout is **$10**. Balances below that roll into the next payout.
- Payouts run at 14:00 UTC. A payout initiated Friday afternoon lands Tuesday.
- Failed payouts (closed account, wrong details) return to the Halyard balance
  within 5 business days and the customer gets an email.

---

## 5. Common errors customers report

**"My client says the payment link is expired."**
Invoice links expire 90 days after they are sent. The customer can resend from the
invoice; it generates a new link and does not create a duplicate invoice.

**"Card declined but I was charged."**
That's an authorisation hold, not a charge. It falls off in 3–5 business days. We
cannot release it manually — the issuing bank holds it.

**"I was charged twice."**
Genuine duplicates happen when an invoice is paid twice by two people at the
client's company. Check the invoice's payment history before promising anything. A
true duplicate is refunded in full, and this is the one refund we make outside
the 14-day rule.

**"My VAT number isn't on the invoice."**
Tax IDs are set per-workspace under Settings → Business details, and only apply to
invoices created *after* the change. Existing invoices cannot be edited after
they've been sent; the customer must void and reissue.

**"I can't log in."**
We are passwordless — login is a magic link, valid 15 minutes, single use. Links
land in spam more often than customers expect. If the email itself is wrong or
inaccessible, that's an identity change and goes to a human.

---

## 6. Escalate to a human — always

Do not attempt to resolve these:

- Anything involving a **chargeback** or a dispute filed with a bank.
- Any **legal** language: lawyer, court, sue, subpoena, GDPR request, "my rights".
- **Account access changes** — email change, ownership transfer, death of an owner.
- Suspected **fraud or account takeover**, including "I didn't create this account".
- A customer who has asked **the same question twice** without getting a resolution.
- Anything about **Enterprise pricing** or contract terms.
- Requests to **waive a fee** — only a human can approve that.

### How a human is actually reached

The route matters as much as the trigger. A customer told "I've escalated this" and
nothing else has no idea what happens next, or when.

- **Reply to any Halyard invoice email**, or write to **support@halyard.example**.
- Include: account email, invoice number, and what's already been tried.
- A human answers **within one business day**, 09:00–18:00 UTC, Mon–Fri.

Escalation wording we use: *"I can't action this one myself — write to
support@halyard.example with your account email and invoice number, and someone
will pick it up within one business day."*

> **If you are an AI agent reading this as your source of truth:** you have no
> tools. You cannot open a ticket, send mail, or notify anyone. Give the customer
> the route above. Never tell them you have escalated, forwarded, or flagged
> anything — you haven't, and they will wait for a reply that never comes.

---

## 7. Things we deliberately do not know

Kept here so nobody invents an answer:

- Churn or revenue numbers of any kind.
- Whether a specific feature is "on the roadmap", and any dates.
- Why a specific bank held a specific transfer.
- Tax advice. We state what we put on an invoice; we do not advise on liability.
- On-premise or self-hosted deployment — we don't offer it and there is no plan
  document to quote from.

---

## 8. Hours

Support is staffed 09:00–18:00 UTC, Monday to Friday. Outside those hours a ticket
is queued, and the first reply target is one business day. We do not offer phone
support on any plan.
