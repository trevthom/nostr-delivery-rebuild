import React from 'react';
import { Clock, CheckCircle, Timer } from 'lucide-react';
import type { DeliveryRequest, UserProfile } from '../types';
import { getStyles, fmtDate, fmtTime } from '../types';
import { LocBlock, PkgBlock, PersonBlock } from '../helpers';
import { formatTimeRemaining } from '../utils';

interface Props {
  darkMode: boolean;
  deliveries: DeliveryRequest[];
  loading: boolean;
  profile: UserProfile;
}

export default function AwaitingBidApprovalTab({ darkMode, deliveries, loading, profile }: Props) {
  const { dm, card, sub, txt, sec } = getStyles(darkMode);
  const s = { dm, sub, txt, sec };

  return (
    <div className="space-y-4">
      <h2 className={`text-2xl font-bold mb-4 ${txt}`}>Awaiting Bid Approval</h2>
      {loading ? <div className={`${card} text-center`}><p className={sub}>Loading...</p></div>
      : deliveries.length === 0
        ? <div className={`${card} text-center`}><CheckCircle className={`w-16 h-16 ${dm ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} /><p className={sub}>No bids awaiting approval.</p></div>
        : deliveries.map(req => {
          const myBid = req.bids.find(b => b.courier === profile.npub);
          const remaining = req.expires_at ? formatTimeRemaining(req.expires_at) : null;
          return (
          <div key={req.id} className={`${card} ${dm ? 'ring-2 ring-green-600' : 'ring-2 ring-green-400'}`}>
            {myBid && <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${dm ? 'bg-green-900 border border-green-700' : 'bg-green-50 border border-green-200'}`}>
              <CheckCircle className={`w-5 h-5 ${dm ? 'text-green-400' : 'text-green-600'}`} />
              <div>
                <span className={`text-sm font-bold ${dm ? 'text-green-200' : 'text-green-700'}`}>Your Bid: {myBid.amount.toLocaleString()} sats</span>
                <span className={`text-xs ml-2 ${dm ? 'text-green-300' : 'text-green-600'}`}>Placed {fmtDate(new Date(myBid.created_at * 1000))} at {fmtTime(new Date(myBid.created_at * 1000))}</span>
              </div>
            </div>}
            <div className="flex items-start justify-between mb-4">
              <div className={`flex items-center gap-4 text-sm ${sub}`}>
                <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{req.time_window}</span>
                {remaining && <span className="flex items-center gap-1"><Timer className="w-4 h-4" />Expires in {remaining}</span>}
              </div>
              <div className="text-right"><div className={`text-3xl font-bold ${dm ? 'text-orange-400' : 'text-orange-600'}`}>{req.offer_amount.toLocaleString()}</div><div className={`text-sm ${sub}`}>sats offered</div></div>
            </div>
            <LocBlock label="Pickup Location" loc={req.pickup} s={s} />
            <LocBlock label="Dropoff Location" loc={req.dropoff} s={s} />
            <PkgBlock pkgs={req.packages || []} s={s} />
            <PersonBlock p={req.persons} s={s} />
            {req.insurance_amount && <div className={`mb-4 p-3 ${sec} rounded-lg`}>
              <p className={`text-sm ${sub} mb-1`}>Insurance</p>
              <p className={`text-lg font-bold ${dm ? 'text-blue-400' : 'text-blue-600'}`}>{req.insurance_amount.toLocaleString()} sats</p>
            </div>}
            <div className={`text-center py-3 rounded-lg font-medium text-sm ${dm ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'}`}>Bid submitted — awaiting sender response</div>
          </div>
          );
        })}
    </div>
  );
}
