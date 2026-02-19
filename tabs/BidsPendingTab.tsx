import React from 'react';
import { AlertCircle, Clock } from 'lucide-react';
import type { DeliveryRequest } from '../types';
import { getStyles } from '../types';
import { LocBlock, PkgBlock, PersonBlock } from '../helpers';

interface Props {
  darkMode: boolean;
  deliveries: DeliveryRequest[];
  loading: boolean;
  seenBids: Record<string, boolean>;
  setSeenBids: (fn: (p: Record<string, boolean>) => Record<string, boolean>) => void;
  onAcceptBid: (req: DeliveryRequest, bidIndex: number) => void;
  onDeclineBid: (deliveryId: string, bidId: string) => void;
  onEdit: (d: DeliveryRequest) => void;
  onDelete: (id: string) => void;
}

export default function BidsPendingTab({ darkMode, deliveries, loading, seenBids, setSeenBids, onAcceptBid, onDeclineBid, onEdit, onDelete }: Props) {
  const { dm, card, sub, txt, sec } = getStyles(darkMode);
  const s = { dm, sub, txt, sec };

  return (
    <div>
      <h2 className={`text-2xl font-bold mb-4 ${txt}`}>Accept/Decline Bids</h2>
      {loading ? <div className={`${card} text-center`}><p className={sub}>Loading...</p></div>
      : deliveries.length === 0
        ? <div className={`${card} text-center`}><AlertCircle className={`w-16 h-16 ${dm ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} /><p className={sub}>No bids to review.</p></div>
        : <div className="space-y-4">{deliveries.map(req => (
          <div key={req.id} className={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${txt}`}>Request{!seenBids[req.id] && <span className="text-red-500 ml-1">*</span>}</h3>
              <div className="flex items-center gap-2">
                {!seenBids[req.id] && <button onClick={() => setSeenBids(p => ({ ...p, [req.id]: true }))} className={`px-3 py-1 text-sm font-medium rounded-lg ${dm ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-700'}`}>Mark Seen</button>}
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
            <div className="flex gap-2 mb-4">
              <button onClick={() => onEdit(req)} disabled={loading} className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-medium py-2 rounded-lg">Edit</button>
              <button onClick={() => onDelete(req.id)} disabled={loading} className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-medium py-2 rounded-lg">Delete</button>
            </div>
            <div className="mt-4">
              <h4 className="font-bold mb-2">Bids ({req.bids.length})</h4>
              <div className="space-y-2">{req.bids.map((bid, i) => {
                const isCounterOffer = bid.amount !== req.offer_amount;
                return (
                <div key={bid.id} className={`flex items-center justify-between p-3 rounded-lg ${isCounterOffer ? (dm ? 'bg-yellow-900 border border-yellow-700' : 'bg-yellow-50 border border-yellow-300') : (dm ? 'bg-gray-700' : 'bg-gray-50')}`}>
                  <div>
                    <p className={`font-medium ${isCounterOffer ? (dm ? 'text-yellow-300' : 'text-yellow-800') : ''}`}>{bid.amount.toLocaleString()} sats{isCounterOffer && <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${dm ? 'bg-yellow-800 text-yellow-200' : 'bg-yellow-200 text-yellow-800'}`}>Counter Offer</span>}</p>
                    <p className={`text-sm ${sub}`}>{bid.completed_deliveries} completed deliveries | Rating: {bid.completed_deliveries === 0 ? 'N/A' : `${bid.reputation.toFixed(1)} / 5`}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => onAcceptBid(req, i)} disabled={loading} className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium">Accept</button>
                    <button onClick={() => onDeclineBid(req.id, bid.id)} disabled={loading} className="bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium">Decline</button>
                  </div>
                </div>
                );
              })}</div>
            </div>
          </div>
        ))}</div>}
    </div>
  );
}
