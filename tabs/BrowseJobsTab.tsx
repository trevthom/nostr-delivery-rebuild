import React from 'react';
import { Package, Clock } from 'lucide-react';
import type { DeliveryRequest, UserProfile } from '../types';
import { getStyles } from '../types';
import { LocBlock, PkgBlock, PersonBlock } from '../helpers';

interface Props {
  darkMode: boolean;
  deliveries: DeliveryRequest[];
  loading: boolean;
  profile: UserProfile;
  onPlaceBid: (requestId: string, amount: number) => void;
}

export default function BrowseJobsTab({ darkMode, deliveries, loading, profile, onPlaceBid }: Props) {
  const { dm, card, sub, txt, sec } = getStyles(darkMode);
  const s = { dm, sub, txt, sec };

  return (
    <div className="space-y-4">
      <h2 className={`text-2xl font-bold mb-4 ${txt}`}>Available Transport Jobs</h2>
      {loading ? <div className={`${card} text-center`}><p className={sub}>Loading...</p></div>
      : deliveries.length === 0
        ? <div className={`${card} text-center`}><Package className={`w-16 h-16 ${dm ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} /><p className={sub}>No requests available.</p></div>
        : deliveries.map(req => (
          <div key={req.id} className={card}>
            <div className="flex items-start justify-between mb-4">
              <div className={`flex items-center gap-4 text-sm ${sub}`}><span className="flex items-center gap-1"><Clock className="w-4 h-4" />{req.time_window}</span></div>
              <div className="text-right"><div className={`text-3xl font-bold ${dm ? 'text-orange-400' : 'text-orange-600'}`}>{req.offer_amount.toLocaleString()}</div><div className={`text-sm ${sub}`}>sats</div></div>
            </div>
            <LocBlock label="Pickup Location" loc={req.pickup} s={s} />
            <LocBlock label="Dropoff Location" loc={req.dropoff} s={s} />
            <PkgBlock pkgs={req.packages || []} s={s} />
            <PersonBlock p={req.persons} s={s} />
            <div className="flex gap-2">{(() => {
              const ex = req.bids.find(b => b.courier === profile.npub);
              return <>
                <button onClick={() => !ex && onPlaceBid(req.id, req.offer_amount)} disabled={loading || !!ex} className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg">{ex ? `Bid Sent (${ex.amount.toLocaleString()} sats)` : `Accept ${req.offer_amount.toLocaleString()} sats`}</button>
                <button onClick={() => { const c = prompt('Counter-offer (sats):'); if (c) onPlaceBid(req.id, parseInt(c)); }} disabled={loading} className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-medium py-3 rounded-lg">Counter Offer</button>
              </>;
            })()}</div>
          </div>
        ))}
    </div>
  );
}
