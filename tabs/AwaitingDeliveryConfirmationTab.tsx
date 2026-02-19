import React from 'react';
import { Clock, CheckCircle } from 'lucide-react';
import type { DeliveryRequest } from '../types';
import { getStyles, fmtDate, fmtTime } from '../types';
import { LocBlock, PkgBlock, PersonBlock, ProofBlock } from '../helpers';

interface Props {
  darkMode: boolean;
  deliveries: DeliveryRequest[];
  loading: boolean;
}

export default function AwaitingDeliveryConfirmationTab({ darkMode, deliveries, loading }: Props) {
  const { dm, card, sub, txt, sec } = getStyles(darkMode);
  const s = { dm, sub, txt, sec };

  return (
    <div className="space-y-4">
      <h2 className={`text-2xl font-bold mb-4 ${txt}`}>Awaiting Delivery Confirmation</h2>
      {loading ? <div className={`${card} text-center`}><p className={sub}>Loading...</p></div>
      : deliveries.length === 0
        ? <div className={`${card} text-center`}><CheckCircle className={`w-16 h-16 ${dm ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} /><p className={sub}>No deliveries awaiting confirmation.</p></div>
        : deliveries.map(req => {
          const cd = req.completed_at ? new Date(req.completed_at * 1000) : null;
          return (
          <div key={req.id} className={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${txt}`}>Awaiting Sender Confirmation</h3>
              <span className={`px-4 py-2 ${dm ? 'bg-purple-900 text-purple-300' : 'bg-purple-100 text-purple-700'} rounded-full font-medium text-sm`}>completed</span>
            </div>
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-6">
                <div className={`p-4 ${dm ? 'bg-orange-900' : 'bg-orange-50'} rounded-lg`}><p className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-600'} mb-2 font-semibold`}>Pickup</p><p className={`font-medium ${txt}`}>{req.pickup.address}</p>{req.pickup.instructions && <p className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-600'} mt-2`}><strong>Instructions:</strong> {req.pickup.instructions}</p>}</div>
                <div className={`p-4 ${dm ? 'bg-purple-900' : 'bg-purple-50'} rounded-lg`}><p className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-600'} mb-2 font-semibold`}>Dropoff</p><p className={`font-medium ${txt}`}>{req.dropoff.address}</p>{req.dropoff.instructions && <p className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-600'} mt-2`}><strong>Instructions:</strong> {req.dropoff.instructions}</p>}</div>
              </div>
              <PkgBlock pkgs={req.packages || []} s={s} />
              <PersonBlock p={req.persons} s={s} />
              <div className={`grid md:grid-cols-2 gap-4 border-t ${dm ? 'border-gray-700' : 'border-gray-200'} pt-4`}>
                <div className={`p-3 ${dm ? 'bg-green-900' : 'bg-green-50'} rounded-lg`}><p className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-600'} mb-1`}>Payment</p><p className={`text-2xl font-bold ${dm ? 'text-green-400' : 'text-green-600'}`}>{req.offer_amount.toLocaleString()} sats</p></div>
                {cd && <div className={`p-3 ${dm ? 'bg-blue-900' : 'bg-blue-50'} rounded-lg`}><p className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-600'} mb-1`}>Completed</p><p className={`font-medium ${txt}`}>{fmtDate(cd)} at {fmtTime(cd)}</p></div>}
              </div>
              <ProofBlock pod={req.proof_of_delivery} s={s} />
              <div className={`text-center py-3 rounded-lg font-medium text-sm ${dm ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-50 text-yellow-700'}`}>Waiting for sender to confirm delivery and release payment</div>
            </div>
          </div>
          );
        })}
    </div>
  );
}
