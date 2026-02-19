import React from 'react';
import { CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { DeliveryRequest, UserProfile } from '../types';
import { getStyles, fmtDate, fmtTime } from '../types';
import { ProofBlock } from '../helpers';

interface Props {
  darkMode: boolean;
  deliveries: DeliveryRequest[];
  loading: boolean;
  collapsed: Record<string, boolean>;
  setCollapsed: (fn: (p: Record<string, boolean>) => Record<string, boolean>) => void;
  courierProfiles: Record<string, UserProfile>;
}

export default function CompletedRequestsTab({ darkMode, deliveries, loading, collapsed, setCollapsed, courierProfiles }: Props) {
  const { dm, card, sub, txt, sec } = getStyles(darkMode);
  const s = { dm, sub, txt, sec };

  return (
    <div>
      <h2 className={`text-2xl font-bold mb-4 ${txt}`}>Completed</h2>
      {loading ? <div className={`${card} text-center`}><p className={sub}>Loading...</p></div>
      : deliveries.length === 0
        ? <div className={`${card} text-center`}><CheckCircle className={`w-16 h-16 ${dm ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} /><p className={sub}>No completed deliveries yet.</p></div>
        : <div className="space-y-4">
          {deliveries.map(d => {
            const cb = d.bids.find(b => b.id === d.accepted_bid);
            const isC = collapsed[d.id] !== false;
            const cd = d.completed_at ? new Date(d.completed_at * 1000) : null;
            return (
              <div key={d.id} className={card}>
                <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={() => setCollapsed(p => ({ ...p, [d.id]: !isC }))}>
                  <h3 className={`text-xl font-bold ${txt}`}>Completed Delivery</h3>{isC ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </div>
                {isC
                  ? <div className="grid md:grid-cols-2 gap-4"><div><p className={`text-sm ${sub} mb-1`}>Pickup</p><p className={`font-medium ${txt}`}>{d.pickup.address}</p></div><div><p className={`text-sm ${sub} mb-1`}>Dropoff</p><p className={`font-medium ${txt}`}>{d.dropoff.address}</p></div>{cd && <><div><p className={`text-sm ${sub} mb-1`}>Date</p><p className={`font-medium ${txt}`}>{fmtDate(cd)}</p></div><div><p className={`text-sm ${sub} mb-1`}>Time</p><p className={`font-medium ${txt}`}>{fmtTime(cd)}</p></div></>}</div>
                  : <>
                    <div className="grid md:grid-cols-2 gap-4 mb-4"><div><p className={`text-sm ${sub} mb-1`}>Pickup</p><p className={`font-medium ${txt}`}>{d.pickup.address}</p></div><div><p className={`text-sm ${sub} mb-1`}>Dropoff</p><p className={`font-medium ${txt}`}>{d.dropoff.address}</p></div>{cd && <><div><p className={`text-sm ${sub} mb-1`}>Date</p><p className={`font-medium ${txt}`}>{fmtDate(cd)}</p></div><div><p className={`text-sm ${sub} mb-1`}>Time</p><p className={`font-medium ${txt}`}>{fmtTime(cd)}</p></div></>}</div>
                    {cb && <div className={`mb-4 p-3 ${sec} rounded-lg`}><p className={`text-sm ${sub} mb-1`}>Delivered By</p><p className={`font-medium ${txt}`}>{cb.courier}</p><p className={`text-sm ${sub}`}>{courierProfiles[cb.courier] ? `${courierProfiles[cb.courier].reputation.toFixed(1)} * ${courierProfiles[cb.courier].completed_deliveries} deliveries` : `${cb.reputation.toFixed(1)}`}</p></div>}
                    <ProofBlock pod={d.proof_of_delivery} s={s} />
                    {d.sender_feedback && <div className={`mb-4 p-3 ${dm ? 'bg-blue-900' : 'bg-blue-50'} rounded-lg`}><h4 className={`font-semibold mb-2 ${txt}`}>Your Feedback</h4><p className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-700'}`}>{d.sender_feedback}</p></div>}
                  </>}
              </div>
            );
          })}
        </div>}
    </div>
  );
}
