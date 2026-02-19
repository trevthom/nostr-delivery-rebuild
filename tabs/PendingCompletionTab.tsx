import React from 'react';
import { CheckCircle } from 'lucide-react';
import type { DeliveryRequest } from '../types';
import { getStyles } from '../types';
import { LocBlock, PkgBlock, PersonBlock, ProofBlock } from '../helpers';

interface Props {
  darkMode: boolean;
  deliveries: DeliveryRequest[];
  loading: boolean;
  rating: number;
  setRating: (v: number) => void;
  feedback: string;
  setFeedback: (v: string) => void;
  onConfirm: (d: DeliveryRequest) => void;
}

export default function PendingCompletionTab({ darkMode, deliveries, loading, rating, setRating, feedback, setFeedback, onConfirm }: Props) {
  const { dm, inp, card, sub, txt, sec } = getStyles(darkMode);
  const s = { dm, sub, txt, sec };

  return (
    <div>
      <h2 className={`text-2xl font-bold mb-4 ${txt}`}>Pending Completion</h2>
      {loading ? <div className={`${card} text-center`}><p className={sub}>Loading...</p></div>
      : deliveries.length === 0
        ? <div className={`${card} text-center`}><CheckCircle className={`w-16 h-16 ${dm ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} /><p className={sub}>No deliveries pending completion.</p></div>
        : <div className="space-y-4">
          {deliveries.map(req => (
            <div key={req.id} className={card}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-xl font-bold ${txt}`}>Awaiting Your Confirmation</h3>
                <span className="px-4 py-2 rounded-full font-medium text-sm bg-purple-100 text-purple-700">completed</span>
              </div>
              <LocBlock label="Pickup Location" loc={req.pickup} s={s} />
              <LocBlock label="Dropoff Location" loc={req.dropoff} s={s} />
              <PkgBlock pkgs={req.packages || []} s={s} />
              <PersonBlock p={req.persons} s={s} />
              <div className={`mt-4 p-4 ${sec} rounded-lg`}>
                <h4 className={`font-semibold mb-3 ${txt}`}>Review & Confirm</h4>
                <ProofBlock pod={req.proof_of_delivery} s={s} />
                {req.proof_of_delivery?.signature_name && <p className={`mb-4 ${txt}`}><strong>Received By:</strong> {req.proof_of_delivery.signature_name}</p>}
                <div className="mb-4"><label className={`block text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Rate the Courier</label><div className="flex gap-2">{[1, 2, 3, 4, 5].map(st => <button key={st} onClick={() => setRating(st)} className={`text-3xl ${rating >= st ? 'text-yellow-400 scale-110' : dm ? 'text-gray-600' : 'text-gray-300'}`}>&#9733;</button>)}{rating > 0 && <span className={`ml-2 self-center ${dm ? 'text-gray-300' : 'text-gray-700'}`}>{rating} star{rating !== 1 ? 's' : ''}</span>}</div></div>
                <div className="mb-4"><label className={`block text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Feedback (Optional)</label><textarea value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Share your experience..." rows={3} spellCheck={false} className={inp} /></div>
                <button onClick={() => onConfirm(req)} disabled={loading} className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2"><CheckCircle className="w-5 h-5" />Confirm Delivery & Release Payment</button>
              </div>
            </div>
          ))}
        </div>}
    </div>
  );
}
