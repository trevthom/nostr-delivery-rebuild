import React, { useState, useEffect, useRef } from 'react';
import { Package, Clock, Bitcoin, CheckCircle, AlertCircle, Settings, LogOut, Key, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { RelayPool, signEvent, nsecToNpub, nsecToHex, isValidNsec, formatNpub, genId, KIND_DELIVERY, KIND_BID, KIND_STATUS, KIND_PROFILE, type NostrEvent } from './nostr';

enum PkgSize { ENVELOPE='envelope', SMALL='small', MEDIUM='medium', LARGE='large', EXTRA_LARGE='extra_large' }
interface PackageInfo { size: PkgSize; description: string; fragile: boolean; requires_signature: boolean; }
interface Location { address: string; instructions?: string; }
interface ProofOfDelivery { images: string[]; signature_name?: string; timestamp: number; comments?: string; }
interface PersonsInfo { adults: number; children: number; carSeatRequested: boolean; luggage: { hasLuggage: boolean; dimensions: string; weight: string } }
interface DeliveryBid { id: string; courier: string; amount: number; estimated_time: string; reputation: number; completed_deliveries: number; message?: string; created_at: number; }
interface DeliveryRequest {
  id: string; sender: string; pickup: Location; dropoff: Location; packages: PackageInfo[];
  persons?: PersonsInfo; offer_amount: number; insurance_amount?: number; time_window: string;
  expires_at?: number; status: string; bids: DeliveryBid[]; accepted_bid?: string; created_at: number;
  proof_of_delivery?: ProofOfDelivery; sender_feedback?: string; sender_rating?: number; completed_at?: number;
}
interface UserProfile { npub: string; display_name?: string; reputation: number; completed_deliveries: number; verified_identity: boolean; }
enum Mode { SENDER='sender', COURIER='courier' }
type View = 'create' | 'browse' | 'active' | 'confirmed' | 'completed';
const fmtDate = (d: Date) => d.toLocaleDateString();
const fmtTime = (d: Date) => `${d.toLocaleTimeString()} ${d.toLocaleTimeString('en-US',{timeZoneName:'short'}).split(' ').pop()||''}`;

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
  const [form, setForm] = useState({
    pickupAddr: '', pickupInst: '', dropoffAddr: '', dropoffInst: '',
    packages: [{ size: PkgSize.SMALL, description: '', fragile: false, requires_signature: false }] as PackageInfo[],
    persons: { adults: 1, children: 0, carSeatRequested: false, luggage: { hasLuggage: false, dimensions: '', weight: '' } } as PersonsInfo,
    offer: '', insurance: '', timeWindow: 'asap', customDate: ''
  });
  const pool = useRef<RelayPool>(new RelayPool());
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { pool.current.connect().then(() => console.log('Relays connected:', pool.current.connected)); }, []);
  useEffect(() => { if (auth) loadData(); }, [auth, mode]);
  useEffect(() => {
    if (!showSettings) return;
    const h = (e: MouseEvent) => { if (settingsRef.current && !settingsRef.current.contains(e.target as Node) && settingsBtnRef.current && !settingsBtnRef.current.contains(e.target as Node)) setShowSettings(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, [showSettings]);
  const prevSettings = useRef(showSettings);
  useEffect(() => { if (prevSettings.current && !showSettings && auth && privHex) publishProfile(profile); prevSettings.current = showSettings; }, [showSettings]);

  async function publishProfile(p: UserProfile) {
    try { const ev = await signEvent(privHex, KIND_PROFILE, JSON.stringify(p), [['d', p.npub]]); await pool.current.publish(ev); } catch (e) { console.error('publish profile:', e); }
  }
  async function loadProfile(npub: string): Promise<UserProfile> {
    try { const evs = await pool.current.query({ kinds: [KIND_PROFILE], '#d': [npub], limit: 10 }); if (evs.length > 0) { evs.sort((a, b) => b.created_at - a.created_at); return JSON.parse(evs[0].content); } } catch {}
    return { npub, reputation: 0, completed_deliveries: 0, verified_identity: false };
  }
  async function loadData() {
    try {
      setLoading(true);
      const devEvs = await pool.current.query({ kinds: [KIND_DELIVERY], limit: 500 });
      const dMap = new Map<string, DeliveryRequest>();
      for (const ev of devEvs) { try { const d = JSON.parse(ev.content) as DeliveryRequest; const ex = dMap.get(d.id); if (!ex || ev.created_at > (ex.created_at || 0)) dMap.set(d.id, d); } catch {} }
      const bidEvs = await pool.current.query({ kinds: [KIND_BID], limit: 500 });
      const bMap = new Map<string, DeliveryBid[]>();
      for (const ev of bidEvs) { try { const b = JSON.parse(ev.content) as DeliveryBid; const did = ev.tags.find(t => t[0] === 'delivery_id')?.[1]; if (did) { if (!bMap.has(did)) bMap.set(did, []); bMap.get(did)!.push(b); } } catch {} }
      const stEvs = await pool.current.query({ kinds: [KIND_STATUS], limit: 500 });
      const sMap = new Map<string, any[]>();
      for (const ev of stEvs) { try { const u = JSON.parse(ev.content); const did = ev.tags.find(t => t[0] === 'delivery_id')?.[1]; if (did) { if (!sMap.has(did)) sMap.set(did, []); sMap.get(did)!.push({ ...u, _ts: ev.created_at }); } } catch {} }
      const res: DeliveryRequest[] = [];
      for (const [id, d] of dMap) {
        d.bids = bMap.get(id) || []; d.bids.sort((a, b) => a.created_at - b.created_at);
        const ups = sMap.get(id) || []; ups.sort((a, b) => (a._ts||0) - (b._ts||0));
        if (ups.length > 0) { const l = ups[ups.length-1]; if (l.status) d.status = l.status; if (l.proof_of_delivery) d.proof_of_delivery = l.proof_of_delivery; if (l.completed_at) d.completed_at = l.completed_at; if (l.accepted_bid) d.accepted_bid = l.accepted_bid; if (l.sender_rating != null) d.sender_rating = l.sender_rating; if (l.sender_feedback) d.sender_feedback = l.sender_feedback; }
        res.push(d);
      }
      setDeliveries(res);
      const act = res.find(r => (r.status==='accepted'||r.status==='intransit'||r.status==='completed') && r.bids.some(b => b.courier===profile.npub && r.accepted_bid===b.id));
      setActiveDelivery(act || null);
      const nps = new Set<string>(); res.filter(r => (r.status==='confirmed'||r.status==='completed') && r.accepted_bid).forEach(d => { const cb = d.bids.find(b => b.id===d.accepted_bid); if (cb) nps.add(cb.courier); });
      const profs: Record<string, UserProfile> = {}; for (const np of nps) { try { profs[np] = await loadProfile(np); } catch {} } setCourierProfiles(profs);
      if (profile.npub) { const up = await loadProfile(profile.npub); setProfile(p => ({ ...p, reputation: up.reputation, completed_deliveries: up.completed_deliveries, display_name: up.display_name || p.display_name })); }
      setError(null);
    } catch (e) { setError('Failed to load deliveries'); console.error(e); } finally { setLoading(false); }
  }

  async function handleLogin() {
    try { setLoading(true); setError(null); if (!isValidNsec(nsecInput.trim())) { setError('Invalid nsec format.'); setLoading(false); return; }
      const npub = await nsecToNpub(nsecInput.trim()); const hex = nsecToHex(nsecInput.trim()); setPrivHex(hex);
      const p = await loadProfile(npub); setProfile({ ...p, npub, verified_identity: true }); setAuth(true); setShowLogin(false); setNsecInput('');
    } catch { setError('Failed to login.'); } finally { setLoading(false); }
  }
  function handleLogout() { setAuth(false); setShowLogin(true); setNsecInput(''); setPrivHex(''); setProfile({ npub: '', reputation: 4.5, completed_deliveries: 0, verified_identity: false }); setDeliveries([]); setActiveDelivery(null); setError(null); }

  async function createDel() {
    try { if (!form.pickupAddr||!form.dropoffAddr||!form.offer) { setError('Fill all required fields'); return; } setLoading(true);
      const id = genId(); const d: DeliveryRequest = { id, sender: profile.npub, pickup: { address: form.pickupAddr, instructions: form.pickupInst||undefined }, dropoff: { address: form.dropoffAddr, instructions: form.dropoffInst||undefined }, packages: isPkg ? form.packages : [], persons: isPerson ? form.persons : undefined, offer_amount: parseInt(form.offer), insurance_amount: form.insurance?parseInt(form.insurance):undefined, time_window: form.timeWindow==='custom'?form.customDate:form.timeWindow, status: 'open', bids: [], created_at: Math.floor(Date.now()/1000), expires_at: Math.floor(Date.now()/1000)+7*86400 };
      const ev = await signEvent(privHex, KIND_DELIVERY, JSON.stringify(d), [['d',id],['sender',profile.npub],['status','open']]); await pool.current.publish(ev);
      alert('Request created!'); resetForm(); await loadData(); setView('active');
    } catch { setError('Failed to create request'); } finally { setLoading(false); }
  }
  async function updateDel() {
    if (!editing) return; try { if (!form.pickupAddr||!form.dropoffAddr||!form.offer) { setError('Fill all required fields'); return; } setLoading(true);
      const d: DeliveryRequest = { ...editing, pickup: { address: form.pickupAddr, instructions: form.pickupInst||undefined }, dropoff: { address: form.dropoffAddr, instructions: form.dropoffInst||undefined }, packages: isPkg?form.packages:[], persons: isPerson?form.persons:undefined, offer_amount: parseInt(form.offer), insurance_amount: form.insurance?parseInt(form.insurance):undefined, time_window: form.timeWindow==='custom'?form.customDate:form.timeWindow };
      const ev = await signEvent(privHex, KIND_DELIVERY, JSON.stringify(d), [['d',editing.id],['sender',profile.npub],['status','open']]); await pool.current.publish(ev);
      alert('Updated!'); setEditing(null); resetForm(); await loadData(); setView('active');
    } catch { setError('Failed to update'); } finally { setLoading(false); }
  }
  async function placeBid(rid: string, amt: number) {
    try { setLoading(true); const bid: DeliveryBid = { id: genId(), courier: profile.npub, amount: amt, estimated_time: '1-2 hours', reputation: profile.reputation, completed_deliveries: profile.completed_deliveries, message: '', created_at: Math.floor(Date.now()/1000) };
      const ev = await signEvent(privHex, KIND_BID, JSON.stringify(bid), [['delivery_id',rid],['courier',profile.npub]]); await pool.current.publish(ev);
      alert('Bid placed!'); await loadData(); setView('active');
    } catch { setError('Failed to place bid'); } finally { setLoading(false); }
  }
  async function acceptBid(req: DeliveryRequest, bi: number) {
    try { setLoading(true); const bid = req.bids[bi]; const upd = { status: 'accepted', accepted_bid: bid.id, timestamp: Math.floor(Date.now()/1000) };
      const ev = await signEvent(privHex, KIND_STATUS, JSON.stringify(upd), [['delivery_id',req.id],['status','accepted']]); await pool.current.publish(ev);
      setSeenBids(p=>({...p,[req.id]:true})); alert('Bid accepted!'); await loadData(); setView('active');
    } catch { setError('Failed to accept bid'); } finally { setLoading(false); }
  }
  async function deleteDel(id: string) {
    if (!confirm('Delete this request?')) return; try { setLoading(true);
      const ev = await signEvent(privHex, KIND_STATUS, JSON.stringify({ status: 'expired', timestamp: Math.floor(Date.now()/1000) }), [['delivery_id',id],['status','expired']]); await pool.current.publish(ev);
      alert('Deleted!'); await loadData();
    } catch { setError('Failed to delete'); } finally { setLoading(false); }
  }
  async function cancelJob(id: string) {
    const d = deliveries.find(r=>r.id===id); if (!d) return; const ab = d.bids.find(b=>b.id===d.accepted_bid); const amt = ab?.amount||d.offer_amount;
    if (!confirm(`Cancel? You forfeit ${amt.toLocaleString()} sats.`)) return;
    try { setLoading(true); const ev = await signEvent(privHex, KIND_STATUS, JSON.stringify({ status: 'expired', timestamp: Math.floor(Date.now()/1000) }), [['delivery_id',id],['status','expired']]); await pool.current.publish(ev); alert('Cancelled.'); await loadData(); } catch { setError('Failed to cancel'); } finally { setLoading(false); }
  }
  async function completeDel() {
    if (!activeDelivery) return; if (activeDelivery.packages.some(p=>p.requires_signature) && !sigName.trim()) { setError('Signature required'); return; }
    try { setLoading(true); const pod: ProofOfDelivery = { images: proofImages, signature_name: sigName.trim()||undefined, timestamp: Math.floor(Date.now()/1000), comments: delComments.trim()||undefined };
      const upd = { status: 'completed', proof_of_delivery: pod, completed_at: Math.floor(Date.now()/1000), accepted_bid: activeDelivery.accepted_bid, timestamp: Math.floor(Date.now()/1000) };
      const ev = await signEvent(privHex, KIND_STATUS, JSON.stringify(upd), [['delivery_id',activeDelivery.id],['status','completed']]); await pool.current.publish(ev);
      alert('Completed! Awaiting confirmation.'); setProofImages([]); setSigName(''); setDelComments(''); setShowCompForm(false); await loadData();
    } catch { setError('Failed to complete'); } finally { setLoading(false); }
  }
  async function confirmDel(d: DeliveryRequest) {
    if (rating===0) { setError('Select a rating'); return; }
    try { setLoading(true); const cb = d.bids.find(b=>b.id===d.accepted_bid);
      if (cb) { const cp = await loadProfile(cb.courier); const nr = cp.completed_deliveries===0 ? rating : 5-(5-cp.reputation)*0.9+(rating-cp.reputation)*0.1;
        const up: UserProfile = { ...cp, reputation: Math.min(5,Math.max(0,nr)), completed_deliveries: cp.completed_deliveries+1, verified_identity: true };
        const pe = await signEvent(privHex, KIND_PROFILE, JSON.stringify(up), [['d',cb.courier]]); await pool.current.publish(pe); }
      const upd = { status: 'confirmed', sender_rating: rating, sender_feedback: feedback.trim()||undefined, completed_at: d.completed_at||Math.floor(Date.now()/1000), accepted_bid: d.accepted_bid, timestamp: Math.floor(Date.now()/1000) };
      const ev = await signEvent(privHex, KIND_STATUS, JSON.stringify(upd), [['delivery_id',d.id],['status','confirmed']]); await pool.current.publish(ev);
      alert('Confirmed!'); setFeedback(''); setRating(0); await loadData();
    } catch { setError('Failed to confirm'); } finally { setLoading(false); }
  }

  function startEdit(d: DeliveryRequest) {
    setEditing(d); setForm({ pickupAddr: d.pickup.address, pickupInst: d.pickup.instructions||'', dropoffAddr: d.dropoff.address, dropoffInst: d.dropoff.instructions||'',
      packages: d.packages.length?d.packages:[{size:PkgSize.SMALL,description:'',fragile:false,requires_signature:false}],
      persons: d.persons||{adults:1,children:0,carSeatRequested:false,luggage:{hasLuggage:false,dimensions:'',weight:''}},
      offer: d.offer_amount.toString(), insurance: d.insurance_amount?.toString()||'', timeWindow: d.time_window, customDate: '' });
    setIsPkg(d.packages.length>0); setIsPerson(!!d.persons&&(d.persons.adults>0||d.persons.children>0)); setView('create');
  }
  function resetForm() { setForm({ pickupAddr:'',pickupInst:'',dropoffAddr:'',dropoffInst:'',packages:[{size:PkgSize.SMALL,description:'',fragile:false,requires_signature:false}],persons:{adults:1,children:0,carSeatRequested:false,luggage:{hasLuggage:false,dimensions:'',weight:''}},offer:'',insurance:'',timeWindow:'asap',customDate:'' }); setIsPkg(false); setIsPerson(false); }
  const uPkg = (i:number, u:Partial<PackageInfo>) => { const p=[...form.packages]; p[i]={...p[i],...u}; setForm({...form,packages:p}); };
  const handleImg = (e:React.ChangeEvent<HTMLInputElement>) => { if (!e.target.files) return; Array.from(e.target.files).forEach(f => { const r=new FileReader(); r.onloadend=()=>setProofImages(p=>[...p,r.result as string]); r.readAsDataURL(f); }); };

  const dm=darkMode, bg=dm?'bg-gray-800 text-white':'bg-white', inp=`w-full px-4 py-3 border ${dm?'border-gray-600 bg-gray-700 text-white placeholder-gray-400':'border-gray-300 bg-white'} rounded-lg focus:ring-2 focus:ring-orange-500`;
  const card=`${dm?'bg-gray-800 text-white':'bg-white'} rounded-xl shadow-lg p-6`, sub=dm?'text-gray-400':'text-gray-500', txt=dm?'text-white':'text-gray-900', sec=dm?'bg-gray-700':'bg-gray-50';

  // Render: Location block helper
  const LocBlock = ({label,loc}:{label:string,loc:Location}) => (
    <div className={`mb-4 p-3 ${sec} rounded-lg`}>
      <p className={`text-sm font-bold ${sub} mb-1`}>{label}</p><p className={`${txt} mb-2`}>{loc.address}</p>
      {loc.instructions && <><p className={`text-sm font-bold ${sub} mb-1 mt-3`}>Special Instructions:</p><p className={`text-sm ${dm?'text-gray-300':'text-gray-700'}`}>{loc.instructions}</p></>}
    </div>
  );
  const PkgBlock = ({pkgs}:{pkgs:PackageInfo[]}) => pkgs.length>0 ? <div className="mb-4">{pkgs.map((pkg,i) => (
    <div key={i} className={`mb-3 p-3 ${sec} rounded-lg`}><p className={`text-sm mb-2 ${dm?'text-gray-300':'text-gray-700'}`}><strong>Package Size:</strong> {pkg.size}</p>
      {pkg.description && <p className={`text-sm mb-2 ${dm?'text-gray-300':'text-gray-700'}`}><strong>Description:</strong> {pkg.description}</p>}
      <div className="flex flex-wrap gap-2">{pkg.fragile && <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">Fragile</span>}{pkg.requires_signature && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Signature Required</span>}</div>
    </div>))}</div> : null;
  const PersonBlock = ({p}:{p?:PersonsInfo}) => p && (p.adults>0||p.children>0) ? (
    <div className={`mb-4 p-3 ${sec} rounded-lg`}><p className={`text-sm mb-2 ${dm?'text-gray-300':'text-gray-700'}`}><strong>Adults:</strong> {p.adults}, <strong>Children:</strong> {p.children}</p>
      <div className="flex flex-wrap gap-2">{p.carSeatRequested && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">Car Seat Needed</span>}</div>
      {p.luggage?.hasLuggage && <div className={`text-sm mt-2 ${dm?'text-gray-300':'text-gray-700'}`}><strong>Luggage:</strong>{p.luggage.dimensions&&` ${p.luggage.dimensions}`}{p.luggage.weight&&`, ${p.luggage.weight}`}</div>}
    </div>) : null;
  const ProofBlock = ({pod}:{pod?:ProofOfDelivery}) => pod ? (
    <div className={`mb-4 p-3 ${sec} rounded-lg`}><h4 className={`font-semibold mb-2 ${txt}`}>Proof of Delivery</h4>
      {pod.signature_name && <p className={`text-sm mb-2 ${dm?'text-gray-300':'text-gray-700'}`}><strong>Received by:</strong> {pod.signature_name}</p>}
      {pod.comments && <p className={`text-sm mb-2 ${dm?'text-gray-300':'text-gray-700'}`}><strong>Comments:</strong> {pod.comments}</p>}
      {pod.images.length>0 && <div className="grid grid-cols-4 gap-2 mt-2">{pod.images.map((img,i) => <img key={i} src={img} alt={`Proof ${i+1}`} className="w-full h-24 object-cover rounded-lg cursor-pointer hover:opacity-80" onClick={()=>window.open(img,'_blank')} />)}</div>}
    </div>) : null;

  if (showLogin) return (
    <div className={`min-h-screen ${dm?'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900':'bg-gradient-to-br from-orange-50 via-white to-purple-50'} flex items-center justify-center p-4`}>
      <div className={`${bg} rounded-2xl shadow-xl max-w-md w-full p-8`}>
        <div className="text-center mb-8"><Package className="w-16 h-16 text-orange-500 mx-auto mb-4" /><h1 className={`text-3xl font-bold ${txt} mb-2`}>Nostr Delivery</h1><p className={dm?'text-gray-300':'text-gray-600'}>Decentralized peer-to-peer delivery network</p></div>
        {error && <div className={`mb-4 p-3 ${dm?'bg-red-900 border-red-700 text-red-200':'bg-red-50 border-red-200 text-red-700'} border rounded-lg text-sm`}>{error}</div>}
        <div className="space-y-4">
          <div><label className={`block text-sm font-medium ${dm?'text-gray-300':'text-gray-700'} mb-2`}>Nostr Private Key (nsec)</label>
            <input type="password" value={nsecInput} onChange={e=>setNsecInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!loading&&pool.current.connected)handleLogin();}} placeholder="nsec1..." spellCheck={false} className={`${inp} font-mono text-sm`} />
            <p className={`mt-2 text-xs ${sub}`}>Enter your Nostr private key (nsec1...) to login</p></div>
          <button onClick={handleLogin} disabled={loading||!pool.current.connected||!nsecInput.trim()} className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
            {loading?'Logging in...':<><Key className="w-5 h-5"/>Login with Nostr</>}</button>
          <div className={`mt-4 p-4 ${dm?'bg-yellow-900 border-yellow-700':'bg-yellow-50 border-yellow-200'} border rounded-lg`}><p className={`text-sm ${dm?'text-yellow-200':'text-yellow-900'}`}><strong>Security:</strong> Your nsec is only used to derive your npub and sign events. It is not stored or transmitted.</p></div>
        </div>
        <div className="mt-6 flex items-center justify-center gap-4 text-sm"><div className={`flex items-center gap-2 ${pool.current.connected?'text-green-600':'text-red-600'}`}><div className={`w-2 h-2 rounded-full ${pool.current.connected?'bg-green-500':'bg-red-500'}`}/>Relays {pool.current.connected?'Connected':'Connecting...'}</div></div>
      </div>
    </div>
  );

  const newBids = deliveries.filter(r=>r.sender===profile.npub&&r.bids.length>0&&r.status==='open'&&!seenBids[r.id]).length;
  const compSender = deliveries.filter(r=>r.sender===profile.npub&&r.status==='completed').length;
  const bidAccepted = deliveries.filter(r=>r.bids.some(b=>b.courier===profile.npub)&&r.status==='accepted'&&r.bids.find(b=>b.courier===profile.npub&&r.accepted_bid===b.id)&&!seenActive[r.id]).length;
  const compCourier = deliveries.filter(r=>r.status==='confirmed'&&r.bids.some(b=>b.courier===profile.npub&&r.accepted_bid===b.id)&&!seenCompleted.has(r.id)).length;

  return (
    <div className={`min-h-screen ${dm?'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900':'bg-gradient-to-br from-orange-50 via-white to-purple-50'}`}>
      <header className={`${dm?'bg-gray-800 border-gray-700':'bg-white border-gray-200'} border-b sticky top-0 z-10`}>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3"><Package className="w-8 h-8 text-orange-500" /><div><h1 className={`text-xl font-bold ${txt}`}>Nostr Delivery</h1><p className={`text-xs ${sub}`}>{profile.display_name?`${profile.display_name} (${profile.npub})`:profile.npub}</p></div></div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2"><span className={`text-sm font-medium ${dm?'text-gray-300':'text-gray-700'}`}>CONTEXT:</span>
                <select value={mode} onChange={e=>{setMode(e.target.value as Mode);setView(e.target.value===Mode.SENDER?'create':'browse');loadData();}} className={`px-3 py-2 border ${dm?'border-gray-600 bg-gray-700 text-white':'border-gray-300 bg-white'} rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500`}>
                  <option value={Mode.SENDER}>Request Shipping/Taxi</option><option value={Mode.COURIER}>Provide Transport</option></select></div>
              <button ref={settingsBtnRef} onClick={()=>{setShowSettings(!showSettings);window.scrollTo({top:0,behavior:'smooth'});}} className={`p-2 ${dm?'hover:bg-gray-700':'hover:bg-gray-100'} rounded-lg`}><Settings className={`w-5 h-5 ${dm?'text-gray-300':'text-gray-600'}`}/></button>
              <button onClick={handleLogout} className={`p-2 ${dm?'hover:bg-gray-700':'hover:bg-gray-100'} rounded-lg`}><LogOut className={`w-5 h-5 ${dm?'text-gray-300':'text-gray-600'}`}/></button>
            </div>
          </div>
          <div className="flex justify-center mt-2">
            {mode===Mode.SENDER&&<>{newBids>0&&<div className={`flex items-center gap-2 px-4 py-2 ${dm?'bg-blue-900 text-blue-200':'bg-blue-100 text-blue-800'} rounded-full text-sm`}><Bell className="w-4 h-4"/><span>{newBids} new bid(s)</span></div>}{compSender>0&&<div className={`flex items-center gap-2 px-4 py-2 ml-2 ${dm?'bg-green-900 text-green-200':'bg-green-100 text-green-800'} rounded-full text-sm`}><Bell className="w-4 h-4"/><span>{compSender} delivery(ies) completed</span></div>}</>}
            {mode===Mode.COURIER&&<>{bidAccepted>0&&<div className={`flex items-center gap-2 px-4 py-2 ${dm?'bg-green-900 text-green-200':'bg-green-100 text-green-800'} rounded-full text-sm`}><Bell className="w-4 h-4"/><span>{bidAccepted} bid(s) accepted</span></div>}{compCourier>0&&<div className={`flex items-center gap-2 px-4 py-2 ml-2 ${dm?'bg-blue-900 text-blue-200':'bg-blue-100 text-blue-800'} rounded-full text-sm`}><Bell className="w-4 h-4"/><span>Transport Completed!</span></div>}</>}
          </div>
        </div>
      </header>

      {error&&<div className="max-w-7xl mx-auto px-4 py-2"><div className={`${dm?'bg-red-900 border-red-700':'bg-red-50 border-red-200'} border rounded-lg p-3 flex items-center justify-between`}><span className={`${dm?'text-red-200':'text-red-700'} text-sm`}>{error}</span><button onClick={()=>setError(null)} className={dm?'text-red-200':'text-red-700'}>✕</button></div></div>}

      {showSettings&&<div className="max-w-7xl mx-auto px-4 py-4"><div ref={settingsRef} className={card}>
        <h2 className={`text-xl font-bold mb-6 ${txt}`}>Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className={`p-4 ${sec} rounded-lg`}><div className="flex items-center justify-between mb-2"><h3 className={`font-semibold ${txt}`}>Dark Mode</h3>
            <button onClick={()=>setDarkMode(!dm)} className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${dm?'bg-orange-500':'bg-gray-300'}`}><span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${dm?'translate-x-7':'translate-x-1'}`}/></button></div>
            <p className={`text-sm ${dm?'text-gray-300':'text-gray-600'}`}>Switch theme</p></div>
          <div className={`p-4 ${sec} rounded-lg`}><h3 className={`font-semibold ${txt} mb-2`}>Bitcoin Wallet (NWC)</h3><p className={`text-sm ${dm?'text-gray-300':'text-gray-600'}`}>NWC wallet integration placeholder.</p></div>
        </div>
        <h3 className={`text-lg font-bold mb-4 ${txt}`}>Profile</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className={`p-4 ${dm?'bg-purple-900':'bg-purple-50'} rounded-lg`}><p className={`text-sm ${dm?'text-gray-300':'text-gray-600'} mb-1`}>Username</p>
            <input type="text" value={profile.display_name||''} onChange={e=>setProfile({...profile,display_name:e.target.value})} placeholder="Optional" spellCheck={false} className={`w-full text-sm font-medium ${dm?'bg-purple-800 text-purple-300 placeholder-purple-500':'bg-white text-purple-600 placeholder-purple-400'} border ${dm?'border-purple-700':'border-purple-300'} rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-purple-500`}/></div>
          <div className={`p-4 ${dm?'bg-orange-900':'bg-orange-50'} rounded-lg`}><p className={`text-sm ${dm?'text-gray-300':'text-gray-600'} mb-1`}>Reputation</p><p className={`text-2xl font-bold ${dm?'text-orange-400':'text-orange-600'}`}>{profile.completed_deliveries===0?'N/A':`${profile.reputation.toFixed(1)} ⭐`}</p></div>
          <div className={`p-4 ${dm?'bg-green-900':'bg-green-50'} rounded-lg`}><p className={`text-sm ${dm?'text-gray-300':'text-gray-600'} mb-1`}>Deliveries Completed</p><p className={`text-2xl font-bold ${dm?'text-green-400':'text-green-600'}`}>{profile.completed_deliveries}</p></div>
          <div className={`p-4 ${dm?'bg-blue-900':'bg-blue-50'} rounded-lg`}><p className={`text-sm ${dm?'text-gray-300':'text-gray-600'} mb-1`}>ID</p><p className={`text-xs font-mono ${dm?'text-blue-400':'text-blue-600'} truncate`}>{profile.display_name?`${profile.display_name} (${profile.npub})`:profile.npub}</p></div>
        </div>
      </div></div>}

      <div className="max-w-7xl mx-auto px-4 py-4"><div className={`flex gap-2 border-b ${dm?'border-gray-700':'border-gray-200'}`}>
        {mode===Mode.SENDER&&<button onClick={()=>{setView('create');loadData();}} className={`px-6 py-3 font-medium transition-colors ${view==='create'?'border-b-2 border-orange-500 text-orange-600':dm?'text-gray-300 hover:text-white':'text-gray-600 hover:text-gray-900'}`}>Create Request</button>}
        {mode===Mode.COURIER&&<button onClick={()=>{setView('browse');loadData();}} className={`px-6 py-3 font-medium transition-colors ${view==='browse'?'border-b-2 border-orange-500 text-orange-600':dm?'text-gray-300 hover:text-white':'text-gray-600 hover:text-gray-900'}`}>Browse Jobs</button>}
        <button onClick={()=>{setView('active');loadData();}} className={`px-6 py-3 font-medium transition-colors ${view==='active'?'border-b-2 border-orange-500 text-orange-600':dm?'text-gray-300 hover:text-white':'text-gray-600 hover:text-gray-900'}`}>{mode===Mode.SENDER?'My Requests':'Active Transports'}</button>
        {mode===Mode.SENDER&&<button onClick={()=>{setView('confirmed');loadData();}} className={`px-6 py-3 font-medium transition-colors ${view==='confirmed'?'border-b-2 border-orange-500 text-orange-600':dm?'text-gray-300 hover:text-white':'text-gray-600 hover:text-gray-900'}`}>Completed Requests</button>}
        {mode===Mode.COURIER&&<button onClick={()=>{setView('completed');loadData();setSeenCompleted(p=>new Set([...p,...deliveries.filter(r=>r.status==='confirmed'&&r.bids.some(b=>b.courier===profile.npub&&r.accepted_bid===b.id)).map(r=>r.id)]));}} className={`px-6 py-3 font-medium transition-colors ${view==='completed'?'border-b-2 border-orange-500 text-orange-600':dm?'text-gray-300 hover:text-white':'text-gray-600 hover:text-gray-900'}`}>Completed Transports</button>}
      </div></div>

      <div className="max-w-7xl mx-auto px-4 pb-8">
        {/* CREATE */}
        {view==='create'&&mode===Mode.SENDER&&<div className={card}>
          <h2 className={`text-2xl font-bold mb-6 ${txt}`}>{editing?'Edit Request':'Create Request'}</h2>
          {editing&&<div className={`mb-4 p-3 ${dm?'bg-blue-900 border-blue-700':'bg-blue-50 border-blue-200'} border rounded-lg flex items-center justify-between`}><span className={`${dm?'text-blue-200':'text-blue-700'} text-sm`}><strong>Editing:</strong> Modify until accepted.</span><button onClick={()=>{setEditing(null);resetForm();}} className={`${dm?'text-blue-200':'text-blue-700'} text-sm font-medium`}>Cancel Edit</button></div>}
          <div className="space-y-6">
            <div><label className={`block text-sm font-medium ${dm?'text-gray-300':'text-gray-700'} mb-2`}>Pickup Location *</label><input type="text" value={form.pickupAddr} onChange={e=>setForm({...form,pickupAddr:e.target.value})} placeholder="123 Main St, City, State ZIP" spellCheck={false} className={inp}/>
              <input type="text" value={form.pickupInst} onChange={e=>setForm({...form,pickupInst:e.target.value})} placeholder="Special instructions (optional)" spellCheck={false} className={`${inp} mt-2`}/></div>
            <div><label className={`block text-sm font-medium ${dm?'text-gray-300':'text-gray-700'} mb-2`}>Dropoff Location *</label><input type="text" value={form.dropoffAddr} onChange={e=>setForm({...form,dropoffAddr:e.target.value})} placeholder="456 Oak Ave, City, State ZIP" spellCheck={false} className={inp}/>
              <input type="text" value={form.dropoffInst} onChange={e=>setForm({...form,dropoffInst:e.target.value})} placeholder="Dropoff instructions (optional)" spellCheck={false} className={`${inp} mt-2`}/></div>
            <div><label className={`block text-sm font-medium ${dm?'text-gray-300':'text-gray-700'} mb-2`}>Request Type *</label>
              <div className="flex gap-6"><label className={`flex items-center gap-2 ${dm?'text-gray-300':'text-gray-700'}`}><input type="checkbox" checked={isPkg} onChange={e=>setIsPkg(e.target.checked)} className="rounded"/>Packages</label>
                <label className={`flex items-center gap-2 ${dm?'text-gray-300':'text-gray-700'}`}><input type="checkbox" checked={isPerson} onChange={e=>setIsPerson(e.target.checked)} className="rounded"/>Persons</label></div></div>
            {isPkg&&<div><label className={`block text-sm font-medium ${dm?'text-gray-300':'text-gray-700'} mb-2`}>Packages</label>
              {form.packages.map((pkg,i)=><div key={i} className={`${sec} rounded-lg p-4 mb-3`}><div className="flex items-center justify-between mb-3"><span className={`font-medium ${txt}`}>Package {i+1}</span>{form.packages.length>1&&<button onClick={()=>setForm({...form,packages:form.packages.filter((_,j)=>j!==i)})} className={`${dm?'text-red-400':'text-red-600'} text-sm`}>Remove</button>}</div>
                <select value={pkg.size} onChange={e=>uPkg(i,{size:e.target.value as PkgSize})} className={`w-full px-3 py-2 border ${dm?'border-gray-600 bg-gray-600 text-white':'border-gray-300 bg-white'} rounded-lg mb-2`}><option value={PkgSize.ENVELOPE}>Envelope</option><option value={PkgSize.SMALL}>Small (1-5 lbs)</option><option value={PkgSize.MEDIUM}>Medium (5-20 lbs)</option><option value={PkgSize.LARGE}>Large (20-50 lbs)</option><option value={PkgSize.EXTRA_LARGE}>Extra Large (50+ lbs)</option></select>
                <input type="text" value={pkg.description} onChange={e=>uPkg(i,{description:e.target.value})} placeholder="Description (optional)" spellCheck={false} className={`w-full px-3 py-2 border ${dm?'border-gray-600 bg-gray-600 text-white placeholder-gray-400':'border-gray-300 bg-white'} rounded-lg mb-2`}/>
                <div className="flex gap-4"><label className={`flex items-center gap-2 text-sm ${dm?'text-gray-300':'text-gray-700'}`}><input type="checkbox" checked={pkg.fragile} onChange={e=>uPkg(i,{fragile:e.target.checked})} className="rounded"/>Fragile</label>
                  <label className={`flex items-center gap-2 text-sm ${dm?'text-gray-300':'text-gray-700'}`}><input type="checkbox" checked={pkg.requires_signature} onChange={e=>uPkg(i,{requires_signature:e.target.checked})} className="rounded"/>Signature Required</label></div></div>)}
              <button onClick={()=>setForm({...form,packages:[...form.packages,{size:PkgSize.SMALL,description:'',fragile:false,requires_signature:false}]})} className="text-orange-600 hover:text-orange-700 font-medium text-sm">+ Add Another Package</button></div>}
            {isPerson&&<div><label className={`block text-sm font-medium ${dm?'text-gray-300':'text-gray-700'} mb-2`}>Persons</label><div className={`${sec} rounded-lg p-4 space-y-4`}>
              <div className="grid grid-cols-2 gap-4"><div><label className={`block text-sm ${dm?'text-gray-300':'text-gray-700'} mb-1`}>Adults</label><input type="number" min="0" value={form.persons.adults} onChange={e=>setForm({...form,persons:{...form.persons,adults:parseInt(e.target.value)||0}})} className={`w-full px-3 py-2 border ${dm?'border-gray-600 bg-gray-600 text-white':'border-gray-300 bg-white'} rounded-lg`}/></div>
                <div><label className={`block text-sm ${dm?'text-gray-300':'text-gray-700'} mb-1`}>Children</label><input type="number" min="0" value={form.persons.children} onChange={e=>setForm({...form,persons:{...form.persons,children:parseInt(e.target.value)||0}})} className={`w-full px-3 py-2 border ${dm?'border-gray-600 bg-gray-600 text-white':'border-gray-300 bg-white'} rounded-lg`}/></div></div>
              <label className={`flex items-center gap-2 text-sm ${dm?'text-gray-300':'text-gray-700'}`}><input type="checkbox" checked={form.persons.carSeatRequested} onChange={e=>setForm({...form,persons:{...form.persons,carSeatRequested:e.target.checked}})} className="rounded"/>Car seat requested</label>
              <div><label className={`flex items-center gap-2 text-sm ${dm?'text-gray-300':'text-gray-700'} mb-2`}><input type="checkbox" checked={form.persons.luggage.hasLuggage} onChange={e=>setForm({...form,persons:{...form.persons,luggage:{...form.persons.luggage,hasLuggage:e.target.checked}}})} className="rounded"/>Luggage</label>
                {form.persons.luggage.hasLuggage&&<div className="ml-6 space-y-2"><input type="text" value={form.persons.luggage.dimensions} onChange={e=>setForm({...form,persons:{...form.persons,luggage:{...form.persons.luggage,dimensions:e.target.value}}})} placeholder="Dimensions (e.g., 24x16x10 in)" spellCheck={false} className={`w-full px-3 py-2 border ${dm?'border-gray-600 bg-gray-600 text-white placeholder-gray-400':'border-gray-300 bg-white'} rounded-lg`}/>
                  <input type="text" value={form.persons.luggage.weight} onChange={e=>setForm({...form,persons:{...form.persons,luggage:{...form.persons.luggage,weight:e.target.value}}})} placeholder="Weight (e.g., 50 lbs)" spellCheck={false} className={`w-full px-3 py-2 border ${dm?'border-gray-600 bg-gray-600 text-white placeholder-gray-400':'border-gray-300 bg-white'} rounded-lg`}/></div>}</div></div></div>}
            <div><label className={`block text-sm font-medium ${dm?'text-gray-300':'text-gray-700'} mb-2`}>Time Window</label><select value={form.timeWindow} onChange={e=>setForm({...form,timeWindow:e.target.value})} className={inp}><option value="asap">ASAP (within 2 hours)</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="custom">Custom Date</option></select>
              {form.timeWindow==='custom'&&<input type="date" value={form.customDate} onChange={e=>setForm({...form,customDate:e.target.value})} className={`${inp} mt-2`}/>}</div>
            <div><label className={`block text-sm font-medium ${dm?'text-gray-300':'text-gray-700'} mb-2`}>Offer Amount (sats) *</label><div className="relative"><Bitcoin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-orange-500"/>
              <input type="number" value={form.offer} onChange={e=>setForm({...form,offer:e.target.value})} placeholder="25000" className={`w-full pl-12 pr-4 py-3 border ${dm?'border-gray-600 bg-gray-700 text-white placeholder-gray-400':'border-gray-300 bg-white'} rounded-lg focus:ring-2 focus:ring-orange-500`}/></div></div>
            <button onClick={editing?updateDel:createDel} disabled={loading} className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-medium py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2">
              {loading?'Processing...':<><Package className="w-5 h-5"/>{editing?'Update Request':'Create Request'}</>}</button>
          </div>
        </div>}

        {/* BROWSE */}
        {view==='browse'&&mode===Mode.COURIER&&<div className="space-y-4"><h2 className={`text-2xl font-bold mb-4 ${txt}`}>Available Transport Jobs</h2>
          {loading?<div className={`${card} text-center`}><p className={sub}>Loading...</p></div>
          :deliveries.filter(r=>r.status==='open').length===0?<div className={`${card} text-center`}><Package className={`w-16 h-16 ${dm?'text-gray-600':'text-gray-300'} mx-auto mb-4`}/><p className={sub}>No requests available.</p></div>
          :deliveries.filter(r=>r.status==='open').map(req=><div key={req.id} className={card}>
            <div className="flex items-start justify-between mb-4"><div className={`flex items-center gap-4 text-sm ${sub}`}><span className="flex items-center gap-1"><Clock className="w-4 h-4"/>{req.time_window}</span></div>
              <div className="text-right"><div className={`text-3xl font-bold ${dm?'text-orange-400':'text-orange-600'}`}>{req.offer_amount.toLocaleString()}</div><div className={`text-sm ${sub}`}>sats</div></div></div>
            <LocBlock label="Pickup Location" loc={req.pickup}/><LocBlock label="Dropoff Location" loc={req.dropoff}/><PkgBlock pkgs={req.packages||[]}/><PersonBlock p={req.persons}/>
            <div className="flex gap-2">{(()=>{const ex=req.bids.find(b=>b.courier===profile.npub);return<><button onClick={()=>!ex&&placeBid(req.id,req.offer_amount)} disabled={loading||!!ex} className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg">{ex?`Bid Sent (${ex.amount.toLocaleString()} sats)`:`Accept ${req.offer_amount.toLocaleString()} sats`}</button>
              <button onClick={()=>{const c=prompt('Counter-offer (sats):');if(c)placeBid(req.id,parseInt(c));}} disabled={loading} className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-medium py-3 rounded-lg">Counter Offer</button></>;})()}</div>
          </div>)}</div>}

        {/* ACTIVE */}
        {view==='active'&&<div><h2 className={`text-2xl font-bold mb-4 ${txt}`}>{mode===Mode.SENDER?'My Requests':'Active Transports'}</h2>
          {loading?<div className={`${card} text-center`}><p className={sub}>Loading...</p></div>
          :mode===Mode.SENDER?(
            deliveries.filter(r=>r.sender===profile.npub&&r.status!=='confirmed'&&r.status!=='expired'&&r.status!=='cancelled').length===0
            ?<div className={`${card} text-center`}><AlertCircle className={`w-16 h-16 ${dm?'text-gray-600':'text-gray-300'} mx-auto mb-4`}/><p className={sub}>No requests yet.</p></div>
            :<div className="space-y-4">{deliveries.filter(r=>r.sender===profile.npub&&r.status!=='confirmed'&&r.status!=='expired'&&r.status!=='cancelled').map(req=><div key={req.id} className={card}>
              <div className="flex items-center justify-between mb-4"><h3 className={`text-xl font-bold ${txt}`}>Request{req.bids.length>0&&req.status==='open'&&!seenBids[req.id]&&<span className="text-red-500 ml-1">*</span>}</h3>
                <div className="flex items-center gap-2">{req.bids.length>0&&req.status==='open'&&!seenBids[req.id]&&<button onClick={()=>setSeenBids(p=>({...p,[req.id]:true}))} className={`px-3 py-1 text-sm font-medium rounded-lg ${dm?'bg-blue-700 text-white':'bg-blue-100 text-blue-700'}`}>Mark Seen</button>}
                  <span className={`px-4 py-2 rounded-full font-medium text-sm ${req.status==='open'?'bg-blue-100 text-blue-700':req.status==='accepted'?'bg-green-100 text-green-700':req.status==='completed'?'bg-purple-100 text-purple-700':'bg-gray-100 text-gray-700'}`}>{req.status}</span></div></div>
              <LocBlock label="Pickup Location" loc={req.pickup}/><LocBlock label="Dropoff Location" loc={req.dropoff}/><PkgBlock pkgs={req.packages||[]}/><PersonBlock p={req.persons}/>
              {req.status==='open'&&<div className="flex gap-2 mb-4"><button onClick={()=>startEdit(req)} disabled={loading} className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-medium py-2 rounded-lg">Edit</button><button onClick={()=>deleteDel(req.id)} disabled={loading} className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-medium py-2 rounded-lg">Delete</button></div>}
              {req.status==='accepted'&&<button onClick={()=>cancelJob(req.id)} disabled={loading} className="w-full mb-4 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-medium py-2 rounded-lg">Cancel Job and Forfeit Sats</button>}
              {req.bids.length>0&&req.status==='open'&&<div className="mt-4"><h4 className="font-bold mb-2">Bids ({req.bids.length})</h4><div className="space-y-2">{req.bids.map((bid,i)=><div key={bid.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><div><p className="font-medium">{bid.amount.toLocaleString()} sats</p><p className="text-sm text-gray-500">{bid.reputation.toFixed(1)}⭐ {bid.completed_deliveries} deliveries</p></div>
                <button onClick={()=>acceptBid(req,i)} disabled={loading} className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium">Accept</button></div>)}</div></div>}
              {req.status==='completed'&&<div className={`mt-4 p-4 ${sec} rounded-lg`}><h4 className={`font-semibold mb-3 ${txt}`}>Review & Confirm</h4>
                <ProofBlock pod={req.proof_of_delivery}/>
                {req.proof_of_delivery?.signature_name&&<p className={`mb-4 ${txt}`}><strong>Received By:</strong> {req.proof_of_delivery.signature_name}</p>}
                <div className="mb-4"><label className={`block text-sm font-medium ${dm?'text-gray-300':'text-gray-700'} mb-2`}>Rate the Courier</label><div className="flex gap-2">{[1,2,3,4,5].map(s=><button key={s} onClick={()=>setRating(s)} className={`text-3xl ${rating>=s?'text-yellow-400 scale-110':dm?'text-gray-600':'text-gray-300'}`}>★</button>)}{rating>0&&<span className={`ml-2 self-center ${dm?'text-gray-300':'text-gray-700'}`}>{rating} star{rating!==1?'s':''}</span>}</div></div>
                <div className="mb-4"><label className={`block text-sm font-medium ${dm?'text-gray-300':'text-gray-700'} mb-2`}>Feedback (Optional)</label><textarea value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="Share your experience..." rows={3} spellCheck={false} className={inp}/></div>
                <button onClick={()=>confirmDel(req)} disabled={loading} className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2"><CheckCircle className="w-5 h-5"/>Confirm Delivery & Release Payment</button></div>}
            </div>)}</div>
          ):activeDelivery?(
            <div className={card}><div className="flex items-center justify-between mb-6"><h3 className={`text-xl font-bold ${txt}`}>Active Transport{activeDelivery.status==='accepted'&&!seenActive[activeDelivery.id]&&<span className="text-red-500 ml-1">*</span>}</h3>
              <div className="flex items-center gap-2">{activeDelivery.status==='accepted'&&!seenActive[activeDelivery.id]&&<button onClick={()=>setSeenActive(p=>({...p,[activeDelivery.id]:true}))} className={`px-3 py-1 text-sm font-medium rounded-lg ${dm?'bg-blue-700 text-white':'bg-blue-100 text-blue-700'}`}>Mark Seen</button>}
                <span className={`px-4 py-2 ${dm?'bg-green-900 text-green-300':'bg-green-100 text-green-700'} rounded-full font-medium`}>{activeDelivery.status==='completed'?'(pending)':activeDelivery.status==='accepted'?'in progress':activeDelivery.status}</span></div></div>
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className={`p-4 ${dm?'bg-orange-900':'bg-orange-50'} rounded-lg`}><p className={`text-sm ${dm?'text-gray-300':'text-gray-600'} mb-2 font-semibold`}>Pickup</p><p className={`font-medium ${txt}`}>{activeDelivery.pickup.address}</p>{activeDelivery.pickup.instructions&&<p className={`text-sm ${dm?'text-gray-300':'text-gray-600'} mt-2`}><strong>Instructions:</strong> {activeDelivery.pickup.instructions}</p>}</div>
                  <div className={`p-4 ${dm?'bg-purple-900':'bg-purple-50'} rounded-lg`}><p className={`text-sm ${dm?'text-gray-300':'text-gray-600'} mb-2 font-semibold`}>Dropoff</p><p className={`font-medium ${txt}`}>{activeDelivery.dropoff.address}</p>{activeDelivery.dropoff.instructions&&<p className={`text-sm ${dm?'text-gray-300':'text-gray-600'} mt-2`}><strong>Instructions:</strong> {activeDelivery.dropoff.instructions}</p>}</div>
                </div>
                <PkgBlock pkgs={activeDelivery.packages}/>
                <div className={`grid md:grid-cols-2 gap-4 border-t ${dm?'border-gray-700':'border-gray-200'} pt-4`}>
                  <div className={`p-3 ${dm?'bg-green-900':'bg-green-50'} rounded-lg`}><p className={`text-sm ${dm?'text-gray-300':'text-gray-600'} mb-1`}>Payment</p><p className={`text-2xl font-bold ${dm?'text-green-400':'text-green-600'}`}>{activeDelivery.offer_amount.toLocaleString()} sats</p></div>
                  <div className={`p-3 ${dm?'bg-blue-900':'bg-blue-50'} rounded-lg`}><p className={`text-sm ${dm?'text-gray-300':'text-gray-600'} mb-1`}>Time Window</p><p className={`font-medium capitalize ${txt}`}>{activeDelivery.time_window}</p></div>
                </div>
                {(activeDelivery.status==='accepted'||activeDelivery.status==='intransit')&&!showCompForm&&<div className={`border-t ${dm?'border-gray-700':'border-gray-200'} pt-4 mt-4`}><button onClick={()=>setShowCompForm(true)} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-4 rounded-lg flex items-center justify-center gap-2"><CheckCircle className="w-5 h-5"/>Mark as Delivered</button></div>}
                {showCompForm&&<div className={`border-t ${dm?'border-gray-700':'border-gray-200'} pt-4 mt-4 space-y-4`}><h4 className={`font-semibold ${txt}`}>Proof of Delivery</h4>
                  <div><label className={`block text-sm font-medium ${dm?'text-gray-300':'text-gray-700'} mb-2`}>Upload Proof Images</label><input type="file" accept="image/*" multiple onChange={handleImg} className={inp}/>{proofImages.length>0&&<p className={`mt-2 text-sm ${sub}`}>{proofImages.length} image(s)</p>}
                    <div className="mt-3 grid grid-cols-3 gap-2">{proofImages.map((img,i)=><div key={i} className="relative"><img src={img} alt="" className="w-full h-24 object-cover rounded-lg"/><button onClick={()=>setProofImages(p=>p.filter((_,j)=>j!==i))} className={`absolute top-1 right-1 ${dm?'bg-red-900 text-red-200':'bg-red-500 text-white'} rounded-full w-6 h-6 flex items-center justify-center text-xs`}>✕</button></div>)}</div></div>
                  {activeDelivery.packages.some(p=>p.requires_signature)&&<div><label className={`block text-sm font-medium ${dm?'text-gray-300':'text-gray-700'} mb-2`}>Signature Name *</label><input type="text" value={sigName} onChange={e=>setSigName(e.target.value)} placeholder="Name of signer" spellCheck={false} className={inp}/></div>}
                  <div><label className={`block text-sm font-medium ${dm?'text-gray-300':'text-gray-700'} mb-2`}>Comments</label><textarea value={delComments} onChange={e=>setDelComments(e.target.value)} placeholder="Notes..." rows={3} spellCheck={false} className={inp}/></div>
                  <div className="flex gap-3"><button onClick={()=>{setShowCompForm(false);setProofImages([]);setSigName('');setDelComments('');}} className={`flex-1 ${dm?'bg-gray-700 hover:bg-gray-600 text-white':'bg-gray-200 hover:bg-gray-300 text-gray-900'} font-medium py-3 rounded-lg`}>Cancel</button>
                    <button onClick={completeDel} disabled={loading} className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-medium py-3 rounded-lg">{loading?'Submitting...':'Submit & Complete'}</button></div></div>}
              </div></div>
          ):<div className={`${card} text-center`}><AlertCircle className={`w-16 h-16 ${dm?'text-gray-600':'text-gray-300'} mx-auto mb-4`}/><p className={sub}>No active transports. Browse jobs to start!</p></div>}</div>}

        {/* CONFIRMED (SENDER) */}
        {view==='confirmed'&&mode===Mode.SENDER&&<div><h2 className={`text-2xl font-bold mb-4 ${txt}`}>Completed Requests</h2>
          {deliveries.filter(r=>r.sender===profile.npub&&r.status==='confirmed').length===0?<div className={`${card} text-center`}><CheckCircle className={`w-16 h-16 ${dm?'text-gray-600':'text-gray-300'} mx-auto mb-4`}/><p className={sub}>No completed deliveries yet.</p></div>
          :<div className="space-y-4">{deliveries.filter(r=>r.sender===profile.npub&&r.status==='confirmed').map(d=>{const cb=d.bids.find(b=>b.id===d.accepted_bid);const isC=collapsed[d.id]!==false;const cd=d.completed_at?new Date(d.completed_at*1000):null;
            return <div key={d.id} className={card}><div className="flex items-center justify-between mb-4 cursor-pointer" onClick={()=>setCollapsed(p=>({...p,[d.id]:!isC}))}><h3 className={`text-xl font-bold ${txt}`}>Completed Delivery</h3>{isC?<ChevronDown className="w-5 h-5"/>:<ChevronUp className="w-5 h-5"/>}</div>
              {isC?<div className="grid md:grid-cols-2 gap-4"><div><p className={`text-sm ${sub} mb-1`}>Pickup</p><p className={`font-medium ${txt}`}>{d.pickup.address}</p></div><div><p className={`text-sm ${sub} mb-1`}>Dropoff</p><p className={`font-medium ${txt}`}>{d.dropoff.address}</p></div>{cd&&<><div><p className={`text-sm ${sub} mb-1`}>Date</p><p className={`font-medium ${txt}`}>{fmtDate(cd)}</p></div><div><p className={`text-sm ${sub} mb-1`}>Time</p><p className={`font-medium ${txt}`}>{fmtTime(cd)}</p></div></>}</div>
              :<><div className="grid md:grid-cols-2 gap-4 mb-4"><div><p className={`text-sm ${sub} mb-1`}>Pickup</p><p className={`font-medium ${txt}`}>{d.pickup.address}</p></div><div><p className={`text-sm ${sub} mb-1`}>Dropoff</p><p className={`font-medium ${txt}`}>{d.dropoff.address}</p></div>{cd&&<><div><p className={`text-sm ${sub} mb-1`}>Date</p><p className={`font-medium ${txt}`}>{fmtDate(cd)}</p></div><div><p className={`text-sm ${sub} mb-1`}>Time</p><p className={`font-medium ${txt}`}>{fmtTime(cd)}</p></div></>}</div>
                {cb&&<div className={`mb-4 p-3 ${sec} rounded-lg`}><p className={`text-sm ${sub} mb-1`}>Delivered By</p><p className={`font-medium ${txt}`}>{cb.courier}</p><p className={`text-sm ${sub}`}>{courierProfiles[cb.courier]?`${courierProfiles[cb.courier].reputation.toFixed(1)}⭐ • ${courierProfiles[cb.courier].completed_deliveries} deliveries`:`${cb.reputation.toFixed(1)}⭐`}</p></div>}
                <ProofBlock pod={d.proof_of_delivery}/>{d.sender_feedback&&<div className={`mb-4 p-3 ${dm?'bg-blue-900':'bg-blue-50'} rounded-lg`}><h4 className={`font-semibold mb-2 ${txt}`}>Your Feedback</h4><p className={`text-sm ${dm?'text-gray-300':'text-gray-700'}`}>{d.sender_feedback}</p></div>}</>}
            </div>;})}</div>}</div>}

        {/* COMPLETED (COURIER) */}
        {view==='completed'&&mode===Mode.COURIER&&<div><h2 className={`text-2xl font-bold mb-4 ${txt}`}>Completed Transports</h2>
          {deliveries.filter(r=>r.status==='confirmed'&&r.bids.some(b=>b.courier===profile.npub&&r.accepted_bid===b.id)).length===0?<div className={`${card} text-center`}><CheckCircle className={`w-16 h-16 ${dm?'text-gray-600':'text-gray-300'} mx-auto mb-4`}/><p className={sub}>No completed transports yet.</p></div>
          :<div className="space-y-4">{deliveries.filter(r=>r.status==='confirmed'&&r.bids.some(b=>b.courier===profile.npub&&r.accepted_bid===b.id)).map(d=>{const isC=collapsed[d.id]!==false;const cd=d.completed_at?new Date(d.completed_at*1000):null;const cb=d.bids.find(b=>b.id===d.accepted_bid);
            return <div key={d.id} className={card}><div className="flex items-center justify-between mb-4 cursor-pointer" onClick={()=>setCollapsed(p=>({...p,[d.id]:!isC}))}><h3 className={`text-xl font-bold ${txt}`}>Completed Transport</h3>{isC?<ChevronDown className="w-5 h-5"/>:<ChevronUp className="w-5 h-5"/>}</div>
              {isC?<div className="grid md:grid-cols-2 gap-4"><div><p className={`text-sm ${sub} mb-1`}>Pickup</p><p className={`font-medium ${txt}`}>{d.pickup.address}</p></div><div><p className={`text-sm ${sub} mb-1`}>Dropoff</p><p className={`font-medium ${txt}`}>{d.dropoff.address}</p></div>{cd&&<><div><p className={`text-sm ${sub} mb-1`}>Date</p><p className={`font-medium ${txt}`}>{fmtDate(cd)}</p></div><div><p className={`text-sm ${sub} mb-1`}>Time</p><p className={`font-medium ${txt}`}>{fmtTime(cd)}</p></div></>}{d.sender_rating&&<div><p className={`text-sm ${sub} mb-1`}>Rating</p><p className="font-medium text-yellow-500 text-lg">{'⭐'.repeat(Math.round(d.sender_rating))} ({d.sender_rating.toFixed(1)})</p></div>}</div>
              :<><div className="grid md:grid-cols-2 gap-4 mb-4"><div><p className={`text-sm ${sub} mb-1`}>Pickup</p><p className={`font-medium ${txt}`}>{d.pickup.address}</p></div><div><p className={`text-sm ${sub} mb-1`}>Dropoff</p><p className={`font-medium ${txt}`}>{d.dropoff.address}</p></div>{cd&&<><div><p className={`text-sm ${sub} mb-1`}>Date</p><p className={`font-medium ${txt}`}>{fmtDate(cd)}</p></div><div><p className={`text-sm ${sub} mb-1`}>Time</p><p className={`font-medium ${txt}`}>{fmtTime(cd)}</p></div></>}</div>
                <div className="grid md:grid-cols-2 gap-4 mb-4"><div><p className={`text-sm ${sub} mb-2`}>Earnings</p><p className={`text-2xl font-bold ${dm?'text-green-400':'text-green-600'}`}>{d.offer_amount.toLocaleString()} sats</p></div>{d.sender_rating&&<div><p className={`text-sm ${sub} mb-2`}>Rating</p><p className="text-yellow-500 text-2xl">{'⭐'.repeat(Math.round(d.sender_rating))} <span className={`text-lg ${dm?'text-gray-300':'text-gray-700'}`}>({d.sender_rating.toFixed(1)})</span></p></div>}</div>
                <ProofBlock pod={d.proof_of_delivery}/>{d.sender_feedback&&<div className={`mb-4 p-3 ${dm?'bg-blue-900':'bg-blue-50'} rounded-lg`}><h4 className={`font-semibold mb-2 ${txt}`}>Sender Feedback</h4><p className={`text-sm ${dm?'text-gray-300':'text-gray-700'}`}>{d.sender_feedback}</p></div>}</>}
            </div>;})}</div>}</div>}
      </div>
    </div>
  );
}
