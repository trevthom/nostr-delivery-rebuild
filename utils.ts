import type { DeliveryRequest, DeliveryBid } from './types';
import type { NostrEvent } from './nostr';

/** Format seconds remaining into a human-readable string like "1d 12h" or "3h 45m" */
export function formatTimeRemaining(expiresAt: number): string | null {
  const now = Math.floor(Date.now() / 1000);
  const diff = expiresAt - now;
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Aggregate raw Nostr events into DeliveryRequest objects */
export function aggregateDeliveries(
  devEvs: NostrEvent[],
  bidEvs: NostrEvent[],
  stEvs: NostrEvent[]
): DeliveryRequest[] {
  const dMap = new Map<string, DeliveryRequest>();
  const seenDeliveryEvIds = new Set<string>();
  for (const ev of devEvs) {
    try {
      if (seenDeliveryEvIds.has(ev.id)) continue;
      seenDeliveryEvIds.add(ev.id);
      const d = JSON.parse(ev.content) as DeliveryRequest;
      const ex = dMap.get(d.id);
      if (!ex || ev.created_at > (ex.created_at || 0)) dMap.set(d.id, d);
    } catch {}
  }

  const bMap = new Map<string, DeliveryBid[]>();
  const seenBidIds = new Set<string>();
  for (const ev of bidEvs) {
    try {
      const b = JSON.parse(ev.content) as DeliveryBid;
      const did = ev.tags.find(t => t[0] === 'delivery_id')?.[1];
      if (did && !seenBidIds.has(b.id)) {
        seenBidIds.add(b.id);
        if (!bMap.has(did)) bMap.set(did, []);
        bMap.get(did)!.push(b);
      }
    } catch {}
  }

  const sMap = new Map<string, any[]>();
  const declinedMap = new Map<string, Set<string>>();
  const withdrawnMap = new Map<string, Set<string>>();
  const seenStatusIds = new Set<string>();
  for (const ev of stEvs) {
    try {
      if (seenStatusIds.has(ev.id)) continue;
      seenStatusIds.add(ev.id);
      const u = JSON.parse(ev.content);
      const did = ev.tags.find(t => t[0] === 'delivery_id')?.[1];
      if (did) {
        if (u.type === 'bid_declined' && u.bid_id) {
          if (!declinedMap.has(did)) declinedMap.set(did, new Set());
          declinedMap.get(did)!.add(u.bid_id);
        } else if (u.type === 'bid_withdrawn' && u.bid_id) {
          if (!withdrawnMap.has(did)) withdrawnMap.set(did, new Set());
          withdrawnMap.get(did)!.add(u.bid_id);
        } else {
          if (!sMap.has(did)) sMap.set(did, []);
          sMap.get(did)!.push({ ...u, _ts: ev.created_at });
        }
      }
    } catch {}
  }

  const res: DeliveryRequest[] = [];
  const now = Math.floor(Date.now() / 1000);
  for (const [id, d] of dMap) {
    d.bids = bMap.get(id) || [];
    d.bids.sort((a, b) => a.created_at - b.created_at);
    const ups = sMap.get(id) || [];
    const statusOrder: Record<string, number> = { open: 0, expired: 1, accepted: 2, intransit: 3, completed: 4, confirmed: 5 };
    ups.sort((a, b) => (a._ts || 0) - (b._ts || 0) || (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0));
    for (const u of ups) {
      if (u.status) d.status = u.status;
      if (u.proof_of_delivery) d.proof_of_delivery = u.proof_of_delivery;
      if (u.completed_at) d.completed_at = u.completed_at;
      if (u.accepted_bid) d.accepted_bid = u.accepted_bid;
      if (u.sender_rating != null) d.sender_rating = u.sender_rating;
      if (u.sender_feedback) d.sender_feedback = u.sender_feedback;
      if (u.payment_invoice) d.payment_invoice = u.payment_invoice;
      if (u.payment_preimage) d.payment_preimage = u.payment_preimage;
    }
    // Apply declined and withdrawn bids
    const declined = declinedMap.get(id);
    const withdrawn = withdrawnMap.get(id);
    if (declined) d.declined_bids = Array.from(declined);
    if (withdrawn) d.withdrawn_bids = Array.from(withdrawn);
    // Filter out bids created before bids_reset_at
    if (d.bids_reset_at) {
      d.bids = d.bids.filter(b => b.created_at > d.bids_reset_at!);
    }
    // Filter out declined and withdrawn bids from the active bids list
    if (d.declined_bids?.length || d.withdrawn_bids?.length) {
      const removedIds = new Set([...(d.declined_bids || []), ...(d.withdrawn_bids || [])]);
      d.bids = d.bids.filter(b => !removedIds.has(b.id));
    }
    if (d.status === 'open' && d.expires_at && d.expires_at < now) d.status = 'expired';
    res.push(d);
  }
  return res;
}

/** Compute notification badge counts */
export function computeNotifications(
  deliveries: DeliveryRequest[],
  npub: string,
  seenBids: Record<string, boolean>,
  seenActive: Record<string, boolean>,
  seenCompleted: Set<string>
) {
  const newBids = deliveries.filter(r => r.sender === npub && r.bids.length > 0 && r.status === 'open' && !seenBids[r.id]).length;
  const compSender = deliveries.filter(r => r.sender === npub && r.status === 'completed').length;
  const bidAccepted = deliveries.filter(r => r.bids.some(b => b.courier === npub) && r.status === 'accepted' && r.bids.find(b => b.courier === npub && r.accepted_bid === b.id) && !seenActive[r.id]).length;
  const compCourier = deliveries.filter(r => r.status === 'confirmed' && r.bids.some(b => b.courier === npub && r.accepted_bid === b.id) && !seenCompleted.has(r.id)).length;
  return { newBids, compSender, bidAccepted, compCourier };
}

/** Filter deliveries into categorized lists for sender and courier tabs */
export function filterDeliveryLists(deliveries: DeliveryRequest[], npub: string) {
  const senderReqs = deliveries.filter(r => r.sender === npub);
  const awaitingBids = senderReqs.filter(r => r.status === 'open' && r.bids.length === 0);
  const bidsPending = senderReqs.filter(r => r.status === 'open' && r.bids.length > 0);
  const inTransport = senderReqs.filter(r => r.status === 'accepted' || r.status === 'intransit');
  const pendingCompletion = senderReqs.filter(r => r.status === 'completed');
  const completedReqs = senderReqs.filter(r => r.status === 'confirmed');
  // Browse Jobs: open requests not by this user where courier has no active bid (bids filtered by aggregation already exclude declined/withdrawn)
  const browseJobs = deliveries.filter(r => r.status === 'open' && r.sender !== npub && !r.bids.some(b => b.courier === npub));
  // Your Bids: open requests where courier has an active bid (not declined/withdrawn)
  const awaitingBidApproval = deliveries.filter(r => r.status === 'open' && r.sender !== npub && r.bids.some(b => b.courier === npub));
  const activeTransports = deliveries.filter(r => (r.status === 'accepted' || r.status === 'intransit') && r.bids.some(b => b.courier === npub && r.accepted_bid === b.id));
  const awaitingDeliveryConfirmation = deliveries.filter(r => r.status === 'completed' && r.bids.some(b => b.courier === npub && r.accepted_bid === b.id));
  const completedTransports = deliveries.filter(r => r.status === 'confirmed' && r.bids.some(b => b.courier === npub && r.accepted_bid === b.id));
  return { senderReqs, awaitingBids, bidsPending, inTransport, pendingCompletion, completedReqs, browseJobs, awaitingBidApproval, activeTransports, awaitingDeliveryConfirmation, completedTransports };
}
