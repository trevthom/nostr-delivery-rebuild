import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Package, Key, Settings, LogOut, Bitcoin } from 'lucide-react';
import { RelayPool, signEvent, nsecToNpub, nsecToHex, isValidNsec, genId, KIND_DELIVERY, KIND_BID, KIND_STATUS, KIND_PROFILE } from './nostr';
import { PkgSize, Mode, getStyles } from './types';
import NWCWallet from './NWCWallet';
import type { View, DeliveryRequest, DeliveryBid, ProofOfDelivery, UserProfile, FormState, AppSettings } from './types';
import { publishProfile, loadProfile, publishSettings, loadSettings } from './nostrService';
import { aggregateDeliveries, computeNotifications, filterDeliveryLists } from './utils';
import { createPaymentInvoice, payPaymentInvoice } from './nwcPayment';

import CreateRequestTab from './tabs/CreateRequestTab';
import AwaitingBidsTab from './tabs/AwaitingBidsTab';
import BidsPendingTab from './tabs/BidsPendingTab';
import InTransportTab from './tabs/InTransportTab';
import CompletedRequestsTab from './tabs/CompletedRequestsTab';
import BrowseJobsTab from './tabs/BrowseJobsTab';
import ActiveTransportsTab from './tabs/ActiveTransportsTab';
import CompletedTransportsTab from './tabs/CompletedTransportsTab';
import AwaitingBidApprovalTab from './tabs/AwaitingBidApprovalTab';
import AwaitingDeliveryConfirmationTab from './tabs/AwaitingDeliveryConfirmationTab';
import PendingCompletionTab from './tabs/PendingCompletionTab';

export default function DeliveryApp() {
  const [auth, setAuth] = useState(false);
  const [mode, setMode] = useState<Mode>(Mode.SENDER);
  const [profile, setProfile] = useState<UserProfile>({ npub: '', reputation: 4.5, completed_deliveries: 0, verified_identity: false });
  const [deliveries, setDeliveries] = useState<DeliveryRequest[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<DeliveryRequest | null>(null);
  const [view, setView] = useState<View>('create');
  const [showLogin, setShowLogin] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<DeliveryRequest | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [nwcUrl, setNwcUrl] = useState('');
  const [nsecInput, setNsecInput] = useState('');
  const [privHex, setPrivHex] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [seenBids, setSeenBids] = useState<Record<string, boolean>>({});
  const [seenActive, setSeenActive] = useState<Record<string, boolean>>({});
  const [seenCompleted, setSeenCompleted] = useState<Set<string>>(new Set());
  const [courierProfiles, setCourierProfiles] = useState<Record<string, UserProfile>>({});
  const [proofImages, setProofImages] = useState<string[]>([]);
  const [sigName, setSigName] = useState('');
  const [delComments, setDelComments] = useState('');
  const [showCompForm, setShowCompForm] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(0);
  const [isPkg, setIsPkg] = useState(false);
  const [isPerson, setIsPerson] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  const [relayConnected, setRelayConnected] = useState(false);
  const [btcPrice, setBtcPrice] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    pickupAddr: '', pickupInst: '', dropoffAddr: '', dropoffInst: '',
    packages: [{ size: PkgSize.SMALL, description: '', fragile: false, requires_signature: false }],
    persons: { adults: 1, children: 0, carSeatRequested: false, luggage: { hasLuggage: false, dimensions: '', weight: '' } },
    offer: '', insurance: '', timeWindow: 'asap', customDate: ''
  });
  const pool = useRef<RelayPool>(new RelayPool());
  const pendingLocal = useRef<Map<string, DeliveryRequest>>(new Map());
  const pendingBids = useRef<Map<string, DeliveryBid[]>>(new Map());
  const pendingDeletes = useRef<Set<string>>(new Set());
  const autoApprovedIds = useRef<Set<string>>(new Set());
  const publishedExpirations = useRef<Set<string>>(new Set());
  const generatedInvoiceIds = useRef<Set<string>>(new Set());
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { pool.current.connect().then(() => { setRelayConnected(pool.current.connected); console.log('Relays connected:', pool.current.connected); }); }, []);
  useEffect(() => {
    const fetchBtcPrice = () => {
      fetch('https://api.coinbase.com/v2/prices/spot?currency=USD')
        .then(r => r.json())
        .then(data => { if (data?.data?.amount) setBtcPrice(parseFloat(data.data.amount).toLocaleString('en-US', { maximumFractionDigits: 0 })); })
        .catch(() => {});
    };
    fetchBtcPrice();
    const interval = setInterval(fetchBtcPrice, 60000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => { if (auth) loadData(); }, [auth, mode]);
  useEffect(() => {
    if (!showSettings) return;
    const h = (e: MouseEvent) => { if (settingsRef.current && !settingsRef.current.contains(e.target as Node) && settingsBtnRef.current && !settingsBtnRef.current.contains(e.target as Node)) setShowSettings(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, [showSettings]);
  const prevSettings = useRef(showSettings);
  useEffect(() => { if (prevSettings.current && !showSettings && auth && privHex) doPublishProfile(profile); prevSettings.current = showSettings; }, [showSettings]);

  const doPublishProfile = (p: UserProfile) => publishProfile(pool.current, privHex, p);
  const doLoadProfile = (npub: string) => loadProfile(pool.current, npub);
  const doPublishSettings = (hex: string, npub: string, settings: AppSettings) => publishSettings(pool.current, hex, npub, settings);
  const doLoadSettings = (npub: string, hex: string) => loadSettings(pool.current, npub, hex);
  async function loadData() {
    try {
      setLoading(true);
      const devEvs = await pool.current.query({ kinds: [KIND_DELIVERY], limit: 500 });
      const bidEvs = await pool.current.query({ kinds: [KIND_BID], limit: 500 });
      const stEvs = await pool.current.query({ kinds: [KIND_STATUS], limit: 500 });
      const res = aggregateDeliveries(devEvs, bidEvs, stEvs);

      // Merge pending local deliveries that relay hasn't returned yet
      const relayIds = new Set(res.map(r => r.id));
      for (const [id, d] of pendingLocal.current) {
        if (relayIds.has(id)) {
          // Relay has it now, remove from pending
          pendingLocal.current.delete(id);
        } else {
          // Relay doesn't have it yet, keep in merged results
          res.push(d);
        }
      }
      // Apply pending deletions
      for (const id of pendingDeletes.current) {
        const req = res.find(r => r.id === id);
        if (req) {
          if (req.status === 'expired') {
            pendingDeletes.current.delete(id);
          } else {
            req.status = 'expired';
          }
        }
      }
      // Merge pending local bids
      for (const [rid, bids] of pendingBids.current) {
        const req = res.find(r => r.id === rid);
        if (req) {
          const existingBidIds = new Set(req.bids.map(b => b.id));
          const newBids = bids.filter(b => !existingBidIds.has(b.id));
          if (newBids.length === 0) {
            pendingBids.current.delete(rid);
          } else {
            req.bids = [...req.bids, ...newBids];
            req.bids.sort((a, b) => a.created_at - b.created_at);
          }
        }
      }

      setDeliveries(res);

      // Auto-approve: accept first matching bid on auto-approve requests
      const toAutoApprove = res.filter(r => r.sender === profile.npub && r.status === 'open' && r.auto_approve && r.bids.length > 0 && !autoApprovedIds.current.has(r.id));
      for (const req of toAutoApprove) {
        const matchIdx = req.bids.findIndex(b => b.amount === req.offer_amount);
        if (matchIdx >= 0) {
          autoApprovedIds.current.add(req.id);
          acceptBid(req, matchIdx);
        }
      }

      // Auto-confirm: if a delivery has been in 'completed' status for over 2 hours, auto-confirm with 5-star rating
      const autoConfirmCutoff = Math.floor(Date.now()/1000) - 2 * 3600;
      const toAutoConfirm = res.filter(r => r.sender === profile.npub && r.status === 'completed' && r.completed_at && r.completed_at < autoConfirmCutoff);
      for (const req of toAutoConfirm) {
        try {
          // Auto-pay the courier's Lightning invoice if available
          let paymentPreimage: string | undefined;
          if (req.payment_invoice && nwcUrl) {
            try {
              paymentPreimage = await payPaymentInvoice(nwcUrl, req.payment_invoice);
            } catch (e) {
              console.error('Auto-confirm payment failed for', req.id, e);
            }
          }
          const cb = req.bids.find(b => b.id === req.accepted_bid);
          if (cb) {
            const cp = await doLoadProfile(cb.courier);
            const nr = cp.completed_deliveries === 0 ? 5 : 5 - (5 - cp.reputation) * 0.9 + (5 - cp.reputation) * 0.1;
            const up: UserProfile = { ...cp, reputation: Math.min(5, Math.max(0, nr)), completed_deliveries: cp.completed_deliveries + 1, verified_identity: true };
            const pe = await signEvent(privHex, KIND_PROFILE, JSON.stringify(up), [['d', cb.courier]]); await pool.current.publish(pe);
          }
          const upd = { status: 'confirmed', sender_rating: 5, sender_feedback: 'Auto-confirmed after 2 hours', completed_at: req.completed_at, accepted_bid: req.accepted_bid, payment_preimage: paymentPreimage, timestamp: Math.floor(Date.now()/1000) };
          const ev = await signEvent(privHex, KIND_STATUS, JSON.stringify(upd), [['delivery_id', req.id], ['status', 'confirmed']]);
          await pool.current.publish(ev);
        } catch {}
      }

      // Auto-generate payment invoices for courier's accepted transports (so sender can pay on cancel or completion)
      if (nwcUrl) {
        const needsInvoice = res.filter(r =>
          (r.status === 'accepted' || r.status === 'intransit') &&
          r.bids.some(b => b.courier === profile.npub && r.accepted_bid === b.id) &&
          !r.payment_invoice &&
          !generatedInvoiceIds.current.has(r.id)
        );
        for (const req of needsInvoice) {
          generatedInvoiceIds.current.add(req.id);
          try {
            const ab = req.bids.find(b => b.id === req.accepted_bid);
            const amt = ab?.amount || req.offer_amount;
            const invoice = await createPaymentInvoice(nwcUrl, amt, `Nostr Delivery payment for ${req.id.substring(0, 8)}`);
            const invoiceEv = await signEvent(privHex, KIND_STATUS, JSON.stringify({
              status: req.status, accepted_bid: req.accepted_bid, payment_invoice: invoice, timestamp: Math.floor(Date.now()/1000)
            }), [['delivery_id', req.id], ['status', req.status]]);
            await pool.current.publish(invoiceEv);
            req.payment_invoice = invoice;
          } catch (e) {
            console.error('Failed to auto-generate invoice for', req.id, e);
            generatedInvoiceIds.current.delete(req.id);
          }
        }
      }

      // Auto-publish expired status for sender's expired jobs to relay
      const newlyExpired = res.filter(r => r.sender === profile.npub && r.status === 'expired' && !publishedExpirations.current.has(r.id));
      for (const req of newlyExpired) {
        publishedExpirations.current.add(req.id);
        try {
          const ev = await signEvent(privHex, KIND_STATUS, JSON.stringify({ status: 'expired', timestamp: Math.floor(Date.now()/1000) }), [['delivery_id',req.id],['status','expired']]);
          pool.current.publish(ev);
        } catch {}
      }

      const act = res.find(r => (r.status==='accepted'||r.status==='intransit') && r.bids.some(b => b.courier===profile.npub && r.accepted_bid===b.id));
      setActiveDelivery(act || null);
      const nps = new Set<string>(); res.filter(r => (r.status==='confirmed'||r.status==='completed') && r.accepted_bid).forEach(d => { const cb = d.bids.find(b => b.id===d.accepted_bid); if (cb) nps.add(cb.courier); });
      const profs: Record<string, UserProfile> = {}; for (const np of nps) { try { profs[np] = await doLoadProfile(np); } catch {} } setCourierProfiles(profs);
      if (profile.npub) { const up = await doLoadProfile(profile.npub); setProfile(p => ({ ...p, reputation: up.reputation, completed_deliveries: up.completed_deliveries, display_name: up.display_name || p.display_name })); }
      setError(null);
    } catch (e) { setError('Failed to load deliveries'); console.error(e); } finally { setLoading(false); }
  }

  async function handleLogin() {
    try { setLoading(true); setError(null); if (!isValidNsec(nsecInput.trim())) { setError('Invalid nsec format.'); setLoading(false); return; }
      const npub = await nsecToNpub(nsecInput.trim()); const hex = nsecToHex(nsecInput.trim()); setPrivHex(hex);
      const p = await doLoadProfile(npub); setProfile({ ...p, npub, verified_identity: true });
      const saved = await doLoadSettings(npub, hex);
      if (saved) {
        setDarkMode(saved.darkMode);
        setNwcUrl(saved.nwcUrl || '');
        if (saved.displayName) setProfile(prev => ({ ...prev, display_name: prev.display_name || saved.displayName }));
      }
      setAuth(true); setShowLogin(false); setNsecInput('');
    } catch { setError('Failed to login.'); } finally { setLoading(false); }
  }
  function handleLogout() {
    // Save current settings and profile before clearing state
    if (privHex && profile.npub) {
      doPublishSettings(privHex, profile.npub, { darkMode, nwcUrl, displayName: profile.display_name || '' });
      doPublishProfile(profile);
    }
    setAuth(false); setShowLogin(true); setNsecInput(''); setPrivHex(''); setDarkMode(false); setNwcUrl(''); setProfile({ npub: '', reputation: 4.5, completed_deliveries: 0, verified_identity: false }); setDeliveries([]); setActiveDelivery(null); setError(null); pendingLocal.current.clear(); pendingBids.current.clear(); pendingDeletes.current.clear(); publishedExpirations.current.clear(); generatedInvoiceIds.current.clear();
  }
  function handleDarkModeToggle() {
    const next = !darkMode; setDarkMode(next);
    if (privHex && profile.npub) doPublishSettings(privHex, profile.npub, { darkMode: next, nwcUrl, displayName: profile.display_name || '' });
  }
  function handleNwcUrlChange(url: string) {
    setNwcUrl(url);
    if (privHex && profile.npub) doPublishSettings(privHex, profile.npub, { darkMode, nwcUrl: url, displayName: profile.display_name || '' });
  }
  function handleUsernameBlur() {
    if (privHex && profile.npub) {
      doPublishSettings(privHex, profile.npub, { darkMode, nwcUrl, displayName: profile.display_name || '' });
      doPublishProfile(profile);
    }
  }

  async function publishAndVerify(ev: ReturnType<typeof signEvent> extends Promise<infer T> ? T : never, label: string): Promise<boolean> {
    const ok = await pool.current.publishWithRetry(ev);
    if (!ok) { setError(`Failed to publish ${label} to relays. Check your connection.`); return false; }
    // Give relay time to index, then verify
    await new Promise(r => setTimeout(r, 1500));
    const verified = await pool.current.verifyPublished(ev);
    if (!verified) console.warn(`${label} published but not yet verified on relay`);
    return ok;
  }

  async function createDel() {
    try { if (!form.pickupAddr||!form.dropoffAddr||!form.offer) { setError('Fill all required fields'); return; } setLoading(true);
      const id = genId(); const d: DeliveryRequest = { id, sender: profile.npub, pickup: { address: form.pickupAddr, instructions: form.pickupInst||undefined }, dropoff: { address: form.dropoffAddr, instructions: form.dropoffInst||undefined }, packages: isPkg ? form.packages : [], persons: isPerson ? form.persons : undefined, offer_amount: parseInt(form.offer), insurance_amount: form.insurance?parseInt(form.insurance):undefined, time_window: form.timeWindow==='custom'?form.customDate:form.timeWindow, status: 'open', bids: [], created_at: Math.floor(Date.now()/1000), expires_at: Math.floor(Date.now()/1000)+2*3600, auto_approve: autoApprove||undefined };
      const ev = await signEvent(privHex, KIND_DELIVERY, JSON.stringify(d), [['d',id],['sender',profile.npub],['status','open']]);
      // Track locally so loadData merges it until relay confirms
      pendingLocal.current.set(id, d);
      setDeliveries(prev => [...prev.filter(r => r.id !== id), d]);
      resetForm(); setView('awaiting'); setLoading(false);
      await publishAndVerify(ev, 'request');
      await loadData();
    } catch { setError('Failed to create request'); setLoading(false); }
  }
  async function updateDel() {
    if (!editing) return; try { if (!form.pickupAddr||!form.dropoffAddr||!form.offer) { setError('Fill all required fields'); return; } setLoading(true);
      const hadBids = editing.bids.length > 0;
      const d: DeliveryRequest = { ...editing, pickup: { address: form.pickupAddr, instructions: form.pickupInst||undefined }, dropoff: { address: form.dropoffAddr, instructions: form.dropoffInst||undefined }, packages: isPkg?form.packages:[], persons: isPerson?form.persons:undefined, offer_amount: parseInt(form.offer), insurance_amount: form.insurance?parseInt(form.insurance):undefined, time_window: form.timeWindow==='custom'?form.customDate:form.timeWindow, auto_approve: autoApprove||undefined, ...(hadBids ? { bids_reset_at: Math.floor(Date.now()/1000), bids: [] } : {}) };
      const ev = await signEvent(privHex, KIND_DELIVERY, JSON.stringify(d), [['d',editing.id],['sender',profile.npub],['status','open']]);
      pendingLocal.current.set(editing.id, d);
      setDeliveries(prev => prev.map(r => r.id === editing.id ? d : r));
      setEditing(null); resetForm(); setView('awaiting'); setLoading(false);
      await publishAndVerify(ev, 'update');
      await loadData();
    } catch { setError('Failed to update'); setLoading(false); }
  }
  async function placeBid(rid: string, amt: number) {
    try { setLoading(true); const bid: DeliveryBid = { id: genId(), courier: profile.npub, amount: amt, estimated_time: '1-2 hours', reputation: profile.reputation, completed_deliveries: profile.completed_deliveries, message: '', created_at: Math.floor(Date.now()/1000) };
      const ev = await signEvent(privHex, KIND_BID, JSON.stringify(bid), [['delivery_id',rid],['courier',profile.npub]]);
      const existing = pendingBids.current.get(rid) || [];
      pendingBids.current.set(rid, [...existing, bid]);
      setDeliveries(prev => prev.map(r => r.id === rid ? { ...r, bids: [...r.bids, bid] } : r));
      setLoading(false);
      await publishAndVerify(ev, 'bid');
      await loadData();
    } catch { setError('Failed to place bid'); setLoading(false); }
  }
  async function acceptBid(req: DeliveryRequest, bi: number) {
    try { setLoading(true); const bid = req.bids[bi]; const upd = { status: 'accepted', accepted_bid: bid.id, timestamp: Math.floor(Date.now()/1000) };
      const ev = await signEvent(privHex, KIND_STATUS, JSON.stringify(upd), [['delivery_id',req.id],['status','accepted']]); await pool.current.publish(ev);
      setSeenBids(p=>({...p,[req.id]:true}));
      setDeliveries(prev => prev.map(r => r.id === req.id ? { ...r, status: 'accepted', accepted_bid: bid.id } : r));
      setView('transport');
      loadData();
    } catch { setError('Failed to accept bid'); } finally { setLoading(false); }
  }
  async function deleteDel(id: string) {
    if (!confirm('Delete this request?')) return; try { setLoading(true);
      const ev = await signEvent(privHex, KIND_STATUS, JSON.stringify({ status: 'expired', timestamp: Math.floor(Date.now()/1000) }), [['delivery_id',id],['status','expired']]);
      pendingDeletes.current.add(id);
      setDeliveries(prev => prev.map(r => r.id === id ? { ...r, status: 'expired' } : r));
      setLoading(false);
      await publishAndVerify(ev, 'delete');
      await loadData();
    } catch { setError('Failed to delete'); setLoading(false); }
  }
  async function cancelJob(id: string) {
    const d = deliveries.find(r=>r.id===id); if (!d) return; const ab = d.bids.find(b=>b.id===d.accepted_bid); const amt = ab?.amount||d.offer_amount;
    if (!confirm(`Cancel? You forfeit ${amt.toLocaleString()} sats to the courier.`)) return;
    try {
      setLoading(true);
      // Pay the courier's Lightning invoice as forfeiture
      let paymentPreimage: string | undefined;
      if (d.payment_invoice) {
        if (!nwcUrl) {
          setError('Connect your NWC wallet in Settings to forfeit payment to courier.');
          setLoading(false);
          return;
        }
        try {
          paymentPreimage = await payPaymentInvoice(nwcUrl, d.payment_invoice);
        } catch (e: any) {
          setError(`Forfeiture payment failed: ${e?.message || 'Unknown error'}. Please try again.`);
          setLoading(false);
          return;
        }
      } else if (nwcUrl) {
        // No invoice from courier yet — warn the sender
        if (!confirm('The courier has not generated a payment invoice yet. Cancel anyway? The courier can claim forfeited sats later.')) {
          setLoading(false);
          return;
        }
      }
      const ev = await signEvent(privHex, KIND_STATUS, JSON.stringify({ status: 'expired', forfeited_amount: amt, payment_preimage: paymentPreimage, timestamp: Math.floor(Date.now()/1000) }), [['delivery_id',id],['status','expired']]);
      await pool.current.publish(ev);
      alert(paymentPreimage ? `Cancelled. ${amt.toLocaleString()} sats forfeited to courier.` : 'Cancelled.');
      await loadData();
    } catch { setError('Failed to cancel'); } finally { setLoading(false); }
  }
  async function declineBid(deliveryId: string, bidId: string) {
    try { setLoading(true);
      const ev = await signEvent(privHex, KIND_STATUS, JSON.stringify({ type: 'bid_declined', bid_id: bidId, timestamp: Math.floor(Date.now()/1000) }), [['delivery_id',deliveryId],['status','bid_declined']]);
      await pool.current.publish(ev);
      setDeliveries(prev => prev.map(r => r.id === deliveryId ? { ...r, declined_bids: [...(r.declined_bids||[]), bidId], bids: r.bids.filter(b => b.id !== bidId) } : r));
      await loadData();
    } catch { setError('Failed to decline bid'); } finally { setLoading(false); }
  }
  async function removeBid(deliveryId: string, bidId: string) {
    try { setLoading(true);
      const ev = await signEvent(privHex, KIND_STATUS, JSON.stringify({ type: 'bid_withdrawn', bid_id: bidId, timestamp: Math.floor(Date.now()/1000) }), [['delivery_id',deliveryId],['status','bid_withdrawn']]);
      await pool.current.publish(ev);
      setDeliveries(prev => prev.map(r => r.id === deliveryId ? { ...r, withdrawn_bids: [...(r.withdrawn_bids||[]), bidId], bids: r.bids.filter(b => b.id !== bidId) } : r));
      await loadData();
    } catch { setError('Failed to remove bid'); } finally { setLoading(false); }
  }
  async function completeDel() {
    if (!activeDelivery) return; if (activeDelivery.packages.some(p=>p.requires_signature) && !sigName.trim()) { setError('Signature required'); return; }
    try { setLoading(true); const pod: ProofOfDelivery = { images: proofImages, signature_name: sigName.trim()||undefined, timestamp: Math.floor(Date.now()/1000), comments: delComments.trim()||undefined };
      // Generate Lightning invoice for payment from courier's NWC wallet
      let paymentInvoice: string | undefined;
      if (nwcUrl) {
        try {
          const ab = activeDelivery.bids.find(b => b.id === activeDelivery.accepted_bid);
          const amt = ab?.amount || activeDelivery.offer_amount;
          paymentInvoice = await createPaymentInvoice(nwcUrl, amt, `Nostr Delivery payment for ${activeDelivery.id.substring(0, 8)}`);
        } catch (e: any) {
          setError(`Failed to generate payment invoice: ${e?.message || 'Unknown error'}. Make sure your NWC wallet is connected.`);
          setLoading(false);
          return;
        }
      } else {
        setError('Connect your NWC wallet in Settings to receive payment.');
        setLoading(false);
        return;
      }
      const upd = { status: 'completed', proof_of_delivery: pod, completed_at: Math.floor(Date.now()/1000), accepted_bid: activeDelivery.accepted_bid, payment_invoice: paymentInvoice, timestamp: Math.floor(Date.now()/1000) };
      const ev = await signEvent(privHex, KIND_STATUS, JSON.stringify(upd), [['delivery_id',activeDelivery.id],['status','completed']]);
      await publishAndVerify(ev, 'completion');
      alert('Completed! Awaiting confirmation and payment.'); setProofImages([]); setSigName(''); setDelComments(''); setShowCompForm(false); await loadData();
    } catch { setError('Failed to complete'); } finally { setLoading(false); }
  }
  async function confirmDel(d: DeliveryRequest) {
    if (rating===0) { setError('Select a rating'); return; }
    try { setLoading(true);
      // Pay the courier's Lightning invoice
      let paymentPreimage: string | undefined;
      if (d.payment_invoice) {
        if (!nwcUrl) {
          setError('Connect your NWC wallet in Settings to release payment.');
          setLoading(false);
          return;
        }
        try {
          paymentPreimage = await payPaymentInvoice(nwcUrl, d.payment_invoice);
        } catch (e: any) {
          setError(`Payment failed: ${e?.message || 'Unknown error'}. Please try again.`);
          setLoading(false);
          return;
        }
      }
      const cb = d.bids.find(b=>b.id===d.accepted_bid);
      if (cb) { const cp = await doLoadProfile(cb.courier); const nr = cp.completed_deliveries===0 ? rating : 5-(5-cp.reputation)*0.9+(rating-cp.reputation)*0.1;
        const up: UserProfile = { ...cp, reputation: Math.min(5,Math.max(0,nr)), completed_deliveries: cp.completed_deliveries+1, verified_identity: true };
        const pe = await signEvent(privHex, KIND_PROFILE, JSON.stringify(up), [['d',cb.courier]]); await pool.current.publish(pe); }
      const upd = { status: 'confirmed', sender_rating: rating, sender_feedback: feedback.trim()||undefined, completed_at: d.completed_at||Math.floor(Date.now()/1000), accepted_bid: d.accepted_bid, payment_preimage: paymentPreimage, timestamp: Math.floor(Date.now()/1000) };
      const ev = await signEvent(privHex, KIND_STATUS, JSON.stringify(upd), [['delivery_id',d.id],['status','confirmed']]);
      await publishAndVerify(ev, 'confirmation');
      alert(paymentPreimage ? 'Confirmed! Payment sent to courier.' : 'Confirmed!'); setFeedback(''); setRating(0); await loadData();
    } catch { setError('Failed to confirm'); } finally { setLoading(false); }
  }

  function startEdit(d: DeliveryRequest) {
    setEditing(d); setForm({ pickupAddr: d.pickup.address, pickupInst: d.pickup.instructions||'', dropoffAddr: d.dropoff.address, dropoffInst: d.dropoff.instructions||'',
      packages: d.packages.length?d.packages:[{size:PkgSize.SMALL,description:'',fragile:false,requires_signature:false}],
      persons: d.persons||{adults:1,children:0,carSeatRequested:false,luggage:{hasLuggage:false,dimensions:'',weight:''}},
      offer: d.offer_amount.toString(), insurance: d.insurance_amount?.toString()||'', timeWindow: d.time_window, customDate: '' });
    setIsPkg(d.packages.length>0); setIsPerson(!!d.persons&&(d.persons.adults>0||d.persons.children>0)); setAutoApprove(!!d.auto_approve); setView('create');
  }
  function resetForm() { setForm({ pickupAddr:'',pickupInst:'',dropoffAddr:'',dropoffInst:'',packages:[{size:PkgSize.SMALL,description:'',fragile:false,requires_signature:false}],persons:{adults:1,children:0,carSeatRequested:false,luggage:{hasLuggage:false,dimensions:'',weight:''}},offer:'',insurance:'',timeWindow:'asap',customDate:'' }); setIsPkg(false); setIsPerson(false); setAutoApprove(false); }
  const handleImg = (e:React.ChangeEvent<HTMLInputElement>) => { if (!e.target.files) return; Array.from(e.target.files).forEach(f => { const r=new FileReader(); r.onloadend=()=>setProofImages(p=>[...p,r.result as string]); r.readAsDataURL(f); }); };

  const { dm, bg, inp, card, sub, txt, sec } = getStyles(darkMode);

  // Login screen
  if (showLogin) return (
    <div className={`min-h-screen ${dm?'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900':'bg-gradient-to-br from-orange-50 via-white to-purple-50'} flex items-center justify-center p-4`}>
      <div className={`${bg} rounded-2xl shadow-xl max-w-md w-full p-8`}>
        <div className="text-center mb-8"><Package className="w-16 h-16 text-orange-500 mx-auto mb-4" /><h1 className={`text-3xl font-bold ${txt} mb-2`}>Nostr Delivery</h1><p className={dm?'text-gray-300':'text-gray-600'}>Decentralized peer-to-peer delivery network</p></div>
        {error && <div className={`mb-4 p-3 ${dm?'bg-red-900 border-red-700 text-red-200':'bg-red-50 border-red-200 text-red-700'} border rounded-lg text-sm`}>{error}</div>}
        <div className="space-y-4">
          <div><label className={`block text-sm font-medium ${dm?'text-gray-300':'text-gray-700'} mb-2`}>Nostr Private Key (nsec)</label>
            <input type="password" value={nsecInput} onChange={e=>setNsecInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!loading&&relayConnected)handleLogin();}} placeholder="nsec1..." spellCheck={false} className={`${inp} font-mono text-sm`} />
            <p className={`mt-2 text-xs ${sub}`}>Enter your Nostr private key (nsec1...) to login</p></div>
          <button onClick={handleLogin} disabled={loading||!relayConnected||!nsecInput.trim()} className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
            {loading?'Logging in...':<><Key className="w-5 h-5"/>Login with Nostr</>}</button>
          <div className={`mt-4 p-4 ${dm?'bg-yellow-900 border-yellow-700':'bg-yellow-50 border-yellow-200'} border rounded-lg`}><p className={`text-sm ${dm?'text-yellow-200':'text-yellow-900'}`}><strong>Security:</strong> Your nsec is only used to derive your npub and sign events. It is not stored or transmitted.</p></div>
        </div>
        <div className="mt-6 flex items-center justify-center gap-4 text-sm"><div className={`flex items-center gap-2 ${relayConnected?'text-green-600':'text-red-600'}`}><div className={`w-2 h-2 rounded-full ${relayConnected?'bg-green-500':'bg-red-500'}`}/>Relays {relayConnected?'Connected':'Connecting...'}</div></div>
      </div>
    </div>
  );

  // Notification counts
  const { newBids, compSender, bidAccepted, compCourier } = computeNotifications(deliveries, profile.npub, seenBids, seenActive, seenCompleted);

  // Filtered delivery lists
  const { awaitingBids, bidsPending, inTransport, pendingCompletion, completedReqs, browseJobs, awaitingBidApproval, activeTransports, awaitingDeliveryConfirmation, completedTransports } = filterDeliveryLists(deliveries, profile.npub);

  // Total sats earned from completed transports
  const totalSatsEarned = completedTransports.reduce((sum, d) => {
    const ab = d.bids.find(b => b.id === d.accepted_bid);
    return sum + (ab ? ab.amount : d.offer_amount);
  }, 0);

  // Tab button helper
  const tabBtn = (v: View, label: string, badge?: number) => (
    <button onClick={() => { setView(v); loadData(); }} className={`px-6 py-3 font-medium transition-colors whitespace-nowrap ${view === v ? 'border-b-2 border-orange-500 text-orange-600' : dm ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
      {label}{badge !== undefined && badge > 0 && <span className={`ml-2 px-2 py-0.5 text-xs rounded-full font-bold ${dm ? 'bg-red-700 text-red-100' : 'bg-red-500 text-white'}`}>{badge}</span>}
    </button>
  );

  return (
    <div className={`min-h-screen ${dm?'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900':'bg-gradient-to-br from-orange-50 via-white to-purple-50'}`}>
      <header className={`${dm?'bg-gray-800 border-gray-700':'bg-white border-gray-200'} border-b sticky top-0 z-10`}>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3"><Package className="w-8 h-8 text-orange-500" /><div><h1 className={`text-xl font-bold ${txt}`}>Nostr Delivery</h1><p className={`text-xs ${sub}`}>{profile.display_name?`${profile.display_name} (${profile.npub})`:profile.npub}</p></div></div>
            {btcPrice && <div className="flex items-center gap-2"><Bitcoin className="w-5 h-5 text-orange-500" /><span className={`text-lg font-bold ${dm ? 'text-orange-400' : 'text-orange-600'}`}>${btcPrice}</span></div>}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2"><span className={`text-sm font-medium ${dm?'text-gray-300':'text-gray-700'}`}>CONTEXT:</span>
                <select value={mode} onChange={e=>{setMode(e.target.value as Mode);setView(e.target.value===Mode.SENDER?'create':'browse');loadData();}} className={`px-3 py-2 border ${dm?'border-gray-600 bg-gray-700 text-white':'border-gray-300 bg-white'} rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500`}>
                  <option value={Mode.SENDER}>Requester</option><option value={Mode.COURIER}>Transporter</option></select></div>
              <button ref={settingsBtnRef} onClick={()=>{setShowSettings(!showSettings);window.scrollTo({top:0,behavior:'smooth'});}} className={`p-2 ${dm?'hover:bg-gray-700':'hover:bg-gray-100'} rounded-lg`}><Settings className={`w-5 h-5 ${dm?'text-gray-300':'text-gray-600'}`}/></button>
              <button onClick={handleLogout} className={`p-2 ${dm?'hover:bg-gray-700':'hover:bg-gray-100'} rounded-lg`}><LogOut className={`w-5 h-5 ${dm?'text-gray-300':'text-gray-600'}`}/></button>
            </div>
          </div>
        </div>
      </header>

      {error&&<div className="max-w-7xl mx-auto px-4 py-2"><div className={`${dm?'bg-red-900 border-red-700':'bg-red-50 border-red-200'} border rounded-lg p-3 flex items-center justify-between`}><span className={`${dm?'text-red-200':'text-red-700'} text-sm`}>{error}</span><button onClick={()=>setError(null)} className={dm?'text-red-200':'text-red-700'}>&#10005;</button></div></div>}

      {showSettings&&<div className="max-w-7xl mx-auto px-4 py-4"><div ref={settingsRef} className={card}>
        <h2 className={`text-xl font-bold mb-6 ${txt}`}>Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className={`p-4 ${sec} rounded-lg`}><div className="flex items-center justify-between mb-2"><h3 className={`font-semibold ${txt}`}>Dark Mode</h3>
            <button onClick={handleDarkModeToggle} className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${dm?'bg-orange-500':'bg-gray-300'}`}><span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${dm?'translate-x-7':'translate-x-1'}`}/></button></div>
            <p className={`text-sm ${dm?'text-gray-300':'text-gray-600'}`}>Switch theme</p></div>
          <NWCWallet darkMode={darkMode} savedNwcUrl={nwcUrl} onNwcUrlChange={handleNwcUrlChange} />
        </div>
        <h3 className={`text-lg font-bold mb-4 ${txt}`}>Profile</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className={`p-4 ${dm?'bg-purple-900':'bg-purple-50'} rounded-lg`}><p className={`text-sm ${dm?'text-gray-300':'text-gray-600'} mb-1`}>Username</p>
            <input type="text" value={profile.display_name||''} onChange={e=>setProfile({...profile,display_name:e.target.value})} onBlur={handleUsernameBlur} placeholder="Optional" spellCheck={false} className={`w-full text-sm font-medium ${dm?'bg-purple-800 text-purple-300 placeholder-purple-500':'bg-white text-purple-600 placeholder-purple-400'} border ${dm?'border-purple-700':'border-purple-300'} rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-purple-500`}/></div>
          <div className={`p-4 ${dm?'bg-orange-900':'bg-orange-50'} rounded-lg`}><p className={`text-sm ${dm?'text-gray-300':'text-gray-600'} mb-1`}>Reputation</p><p className={`text-2xl font-bold ${dm?'text-orange-400':'text-orange-600'}`}>{profile.completed_deliveries===0?'N/A':`${profile.reputation.toFixed(1)} ⭐`}</p></div>
          <div className={`p-4 ${dm?'bg-green-900':'bg-green-50'} rounded-lg`}><p className={`text-sm ${dm?'text-gray-300':'text-gray-600'} mb-1`}>Total Sats Earned</p><p className={`text-2xl font-bold ${dm?'text-green-400':'text-green-600'}`}>{totalSatsEarned.toLocaleString()} sats</p></div>
        </div>
      </div></div>}

      {/* Tab Navigation */}
      <div className="max-w-7xl mx-auto px-4 py-4"><div className={`flex gap-2 border-b ${dm?'border-gray-700':'border-gray-200'} overflow-x-auto`}>
        {mode===Mode.SENDER&&<>
          {tabBtn('create', 'Create Request')}
          {tabBtn('awaiting', 'Awaiting Bids', awaitingBids.length > 0 ? awaitingBids.length : undefined)}
          {tabBtn('pending', 'Accept/Decline Bids', newBids > 0 ? newBids : undefined)}
          {tabBtn('transport', 'In Transport', inTransport.length > 0 ? inTransport.length : undefined)}
          {tabBtn('pending_completion', 'Pending Completion', compSender > 0 ? compSender : undefined)}
          {tabBtn('done', 'Completed')}
        </>}
        {mode===Mode.COURIER&&<>
          {tabBtn('browse', 'Browse Jobs')}
          {tabBtn('bid_approval', 'Your Bids', awaitingBidApproval.length > 0 ? awaitingBidApproval.length : undefined)}
          {tabBtn('active', 'Active Transports', bidAccepted > 0 ? bidAccepted : undefined)}
          {tabBtn('awaiting_confirmation', 'Awaiting Delivery Confirmation', awaitingDeliveryConfirmation.length > 0 ? awaitingDeliveryConfirmation.length : undefined)}
          <button onClick={()=>{setView('completed');loadData();setSeenCompleted(p=>new Set([...p,...deliveries.filter(r=>r.status==='confirmed'&&r.bids.some(b=>b.courier===profile.npub&&r.accepted_bid===b.id)).map(r=>r.id)]));}} className={`px-6 py-3 font-medium transition-colors whitespace-nowrap ${view==='completed'?'border-b-2 border-orange-500 text-orange-600':dm?'text-gray-300 hover:text-white':'text-gray-600 hover:text-gray-900'}`}>Completed Transports{compCourier > 0 && <span className={`ml-2 px-2 py-0.5 text-xs rounded-full font-bold ${dm ? 'bg-red-700 text-red-100' : 'bg-red-500 text-white'}`}>{compCourier}</span>}</button>
        </>}
      </div></div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 pb-8">
        {/* Sender Tabs */}
        {view==='create'&&mode===Mode.SENDER&&<CreateRequestTab darkMode={darkMode} editing={editing} setEditing={setEditing} form={form} setForm={setForm} isPkg={isPkg} setIsPkg={setIsPkg} isPerson={isPerson} setIsPerson={setIsPerson} autoApprove={autoApprove} setAutoApprove={setAutoApprove} loading={loading} resetForm={resetForm} onCreate={createDel} onUpdate={updateDel} />}
        {view==='awaiting'&&mode===Mode.SENDER&&<AwaitingBidsTab darkMode={darkMode} deliveries={awaitingBids} loading={loading} onEdit={startEdit} onDelete={deleteDel} />}
        {view==='pending'&&mode===Mode.SENDER&&<BidsPendingTab darkMode={darkMode} deliveries={bidsPending} loading={loading} seenBids={seenBids} setSeenBids={setSeenBids} onAcceptBid={acceptBid} onDeclineBid={declineBid} onEdit={startEdit} onDelete={deleteDel} />}
        {view==='transport'&&mode===Mode.SENDER&&<InTransportTab darkMode={darkMode} deliveries={inTransport} loading={loading} onCancel={cancelJob} />}
        {view==='pending_completion'&&mode===Mode.SENDER&&<PendingCompletionTab darkMode={darkMode} deliveries={pendingCompletion} loading={loading} rating={rating} setRating={setRating} feedback={feedback} setFeedback={setFeedback} onConfirm={confirmDel} />}
        {view==='done'&&mode===Mode.SENDER&&<CompletedRequestsTab darkMode={darkMode} deliveries={completedReqs} loading={loading} collapsed={collapsed} setCollapsed={setCollapsed} courierProfiles={courierProfiles} />}

        {/* Courier Tabs */}
        {view==='browse'&&mode===Mode.COURIER&&<BrowseJobsTab darkMode={darkMode} deliveries={browseJobs} loading={loading} profile={profile} onPlaceBid={placeBid} />}
        {view==='bid_approval'&&mode===Mode.COURIER&&<AwaitingBidApprovalTab darkMode={darkMode} deliveries={awaitingBidApproval} loading={loading} profile={profile} onRemoveBid={removeBid} />}
        {view==='active'&&mode===Mode.COURIER&&<ActiveTransportsTab darkMode={darkMode} activeDelivery={activeDelivery} loading={loading} seenActive={seenActive} setSeenActive={setSeenActive} showCompForm={showCompForm} setShowCompForm={setShowCompForm} proofImages={proofImages} setProofImages={setProofImages} sigName={sigName} setSigName={setSigName} delComments={delComments} setDelComments={setDelComments} onImageUpload={handleImg} onComplete={completeDel} />}
        {view==='awaiting_confirmation'&&mode===Mode.COURIER&&<AwaitingDeliveryConfirmationTab darkMode={darkMode} deliveries={awaitingDeliveryConfirmation} loading={loading} />}
        {view==='completed'&&mode===Mode.COURIER&&<CompletedTransportsTab darkMode={darkMode} deliveries={completedTransports} loading={loading} collapsed={collapsed} setCollapsed={setCollapsed} />}
      </div>
    </div>
  );
}
