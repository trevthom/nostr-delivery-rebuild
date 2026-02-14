# Peer-to-Peer Delivery/Transport over Nostr

## Architecture

This application uses **Nostr as the backend** — no separate server needed. All data is stored as Nostr events on public relays:

- **Deliveries** → Kind 35000 events
- **Bids** → Kind 35001 events
- **Status Updates** → Kind 35002 events
- **User Profiles** → Kind 35009 events

The frontend connects directly to Nostr relays via WebSocket, publishes signed events, and queries for data. No Rust backend required.

## To run:

1. Ensure Node.js is installed
2. `npm install`
3. `npm run dev`
4. Open the link
5. Login with nsec (nostrtool.com if you need one)

## Configuration

Default relays: `wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.nostr.band`

## Implemented Features ✔

- ✔ No periodic refresh (no screen jumping)
- ✔ Reputation Score system
- ✔ "Deliveries Completed" counter in Settings
- ✔ Optional display name/identifier alongside npub
- ✔ Taxi wording/options for transporting persons
- ✔ Dark mode toggle
- ✔ Package management (sizes, fragile, signature required)
- ✔ Bid/counter-offer system
- ✔ Proof of delivery with images
- ✔ Star rating and feedback system
- ✔ Collapsible completed delivery cards
- ✔ Notification badges for new bids/completions
