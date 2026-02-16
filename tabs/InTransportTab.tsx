import React from 'react';
import { AlertCircle, Clock } from 'lucide-react';
import type { DeliveryRequest } from '../types';
import { getStyles } from '../types';
import { LocBlock, PkgBlock, PersonBlock } from '../helpers';

interface Props {
  darkMode: boolean;
  deliveries: DeliveryRequest[];
  loading: boolean;
  onCancel: (id: string) => void;
}

export default function InTransportTab({ darkMode, deliveries, loading, onCancel }: Props) {
  const { dm, card, sub, txt, sec } = getStyles(darkMode);
  const s = { dm, sub, txt, sec };

  return (
    <div>
      <h2 className={`text-2xl font-bold mb-4 ${txt}`}>In Transport</h2>
      {loading ? <div className={`${card} text-center`}><p className={sub}>Loading...</p></div>
      : deliveries.length === 0
        ? <div className={`${card} text-center`}><AlertCircle className={`w-16 h-16 ${dm ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} /><p className={sub}>No deliveries in transport.</p></div>
        : <div className="space-y-4">{deliveries.map(req => {
          const acceptedBid = req.bids.find(b => b.id === req.accepted_bid);
          return (
            <div key={req.id} className={card}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-xl font-bold ${txt}`}>In Transport</h3>
                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1 text-sm ${sub}`}><Clock className="w-4 h-4" />{req.time_window}</span>
                  <span className={`px-4 py-2 rounded-full font-medium text-sm ${req.status === 'intransit' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{req.status === 'intransit' ? 'in transit' : 'accepted'}</span>
                </div>
              </div>
              <LocBlock label="Pickup Location" loc={req.pickup} s={s} />
              <LocBlock label="Dropoff Location" loc={req.dropoff} s={s} />
              <PkgBlock pkgs={req.packages || []} s={s} />
              <PersonBlock p={req.persons} s={s} />
              {acceptedBid && <div className={`mb-4 p-3 ${sec} rounded-lg`}>
                <p className={`text-sm font-bold ${sub} mb-2`}>Accepted Bid</p>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className={`text-sm ${sub}`}>Courier</p><p className={`font-medium ${txt} text-sm font-mono truncate`}>{acceptedBid.courier}</p></div>
                  <div><p className={`text-sm ${sub}`}>Amount</p><p className={`text-xl font-bold ${dm ? 'text-green-400' : 'text-green-600'}`}>{acceptedBid.amount.toLocaleString()} sats</p></div>
                </div>
                <div className="mt-2"><p className={`text-sm ${sub}`}>{acceptedBid.reputation.toFixed(1)} {acceptedBid.completed_deliveries} deliveries</p></div>
              </div>}
              <button onClick={() => onCancel(req.id)} disabled={loading} className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-medium py-2 rounded-lg">Cancel Job and Forfeit Sats</button>
            </div>
          );
        })}</div>}
    </div>
  );
}
