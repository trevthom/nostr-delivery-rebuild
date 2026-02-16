import React from 'react';
import { AlertCircle, Clock } from 'lucide-react';
import type { DeliveryRequest } from '../types';
import { getStyles } from '../types';
import { LocBlock, PkgBlock, PersonBlock } from '../helpers';

interface Props {
  darkMode: boolean;
  deliveries: DeliveryRequest[];
  loading: boolean;
  onEdit: (d: DeliveryRequest) => void;
  onDelete: (id: string) => void;
}

export default function AwaitingBidsTab({ darkMode, deliveries, loading, onEdit, onDelete }: Props) {
  const { dm, card, sub, txt, sec } = getStyles(darkMode);
  const s = { dm, sub, txt, sec };

  return (
    <div>
      <h2 className={`text-2xl font-bold mb-4 ${txt}`}>Awaiting Bids</h2>
      {loading ? <div className={`${card} text-center`}><p className={sub}>Loading...</p></div>
      : deliveries.length === 0
        ? <div className={`${card} text-center`}><AlertCircle className={`w-16 h-16 ${dm ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} /><p className={sub}>No requests awaiting bids.</p></div>
        : <div className="space-y-4">{deliveries.map(req => (
          <div key={req.id} className={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${txt}`}>Request</h3>
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1 text-sm ${sub}`}><Clock className="w-4 h-4" />{req.time_window}</span>
                <span className="px-4 py-2 rounded-full font-medium text-sm bg-blue-100 text-blue-700">open</span>
              </div>
            </div>
            <LocBlock label="Pickup Location" loc={req.pickup} s={s} />
            <LocBlock label="Dropoff Location" loc={req.dropoff} s={s} />
            <PkgBlock pkgs={req.packages || []} s={s} />
            <PersonBlock p={req.persons} s={s} />
            <div className={`mb-4 p-3 ${sec} rounded-lg`}>
              <p className={`text-sm ${sub} mb-1`}>Offer Amount</p>
              <p className={`text-xl font-bold ${dm ? 'text-orange-400' : 'text-orange-600'}`}>{req.offer_amount.toLocaleString()} sats</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onEdit(req)} disabled={loading} className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-medium py-2 rounded-lg">Edit</button>
              <button onClick={() => onDelete(req.id)} disabled={loading} className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-medium py-2 rounded-lg">Delete</button>
            </div>
          </div>
        ))}</div>}
    </div>
  );
}
