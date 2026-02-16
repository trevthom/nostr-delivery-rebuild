import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import type { DeliveryRequest } from '../types';
import { getStyles } from '../types';
import { PkgBlock } from '../helpers';

interface Props {
  darkMode: boolean;
  activeDelivery: DeliveryRequest | null;
  loading: boolean;
  seenActive: Record<string, boolean>;
  setSeenActive: (fn: (p: Record<string, boolean>) => Record<string, boolean>) => void;
  showCompForm: boolean;
  setShowCompForm: (v: boolean) => void;
  proofImages: string[];
  setProofImages: (fn: (p: string[]) => string[]) => void;
  sigName: string;
  setSigName: (v: string) => void;
  delComments: string;
  setDelComments: (v: string) => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onComplete: () => void;
}

export default function ActiveTransportsTab({ darkMode, activeDelivery, loading, seenActive, setSeenActive, showCompForm, setShowCompForm, proofImages, setProofImages, sigName, setSigName, delComments, setDelComments, onImageUpload, onComplete }: Props) {
  const { dm, inp, card, sub, txt, sec } = getStyles(darkMode);

  if (!activeDelivery) {
    return <div className={`${card} text-center`}><AlertCircle className={`w-16 h-16 ${dm ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} /><p className={sub}>No active transports. Browse jobs to start!</p></div>;
  }

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-6">
        <h3 className={`text-xl font-bold ${txt}`}>Active Transport{activeDelivery.status === 'accepted' && !seenActive[activeDelivery.id] && <span className="text-red-500 ml-1">*</span>}</h3>
        <div className="flex items-center gap-2">
          {activeDelivery.status === 'accepted' && !seenActive[activeDelivery.id] && <button onClick={() => setSeenActive(p => ({ ...p, [activeDelivery.id]: true }))} className={`px-3 py-1 text-sm font-medium rounded-lg ${dm ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-700'}`}>Mark Seen</button>}
          <span className={`px-4 py-2 ${dm ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-700'} rounded-full font-medium`}>{activeDelivery.status === 'completed' ? '(pending)' : activeDelivery.status === 'accepted' ? 'in progress' : activeDelivery.status}</span>
        </div>
      </div>
      <div className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div className={`p-4 ${dm ? 'bg-orange-900' : 'bg-orange-50'} rounded-lg`}><p className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-600'} mb-2 font-semibold`}>Pickup</p><p className={`font-medium ${txt}`}>{activeDelivery.pickup.address}</p>{activeDelivery.pickup.instructions && <p className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-600'} mt-2`}><strong>Instructions:</strong> {activeDelivery.pickup.instructions}</p>}</div>
          <div className={`p-4 ${dm ? 'bg-purple-900' : 'bg-purple-50'} rounded-lg`}><p className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-600'} mb-2 font-semibold`}>Dropoff</p><p className={`font-medium ${txt}`}>{activeDelivery.dropoff.address}</p>{activeDelivery.dropoff.instructions && <p className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-600'} mt-2`}><strong>Instructions:</strong> {activeDelivery.dropoff.instructions}</p>}</div>
        </div>
        <PkgBlock pkgs={activeDelivery.packages} s={{ dm, sub, txt, sec }} />
        <div className={`grid md:grid-cols-2 gap-4 border-t ${dm ? 'border-gray-700' : 'border-gray-200'} pt-4`}>
          <div className={`p-3 ${dm ? 'bg-green-900' : 'bg-green-50'} rounded-lg`}><p className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-600'} mb-1`}>Payment</p><p className={`text-2xl font-bold ${dm ? 'text-green-400' : 'text-green-600'}`}>{activeDelivery.offer_amount.toLocaleString()} sats</p></div>
          <div className={`p-3 ${dm ? 'bg-blue-900' : 'bg-blue-50'} rounded-lg`}><p className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-600'} mb-1`}>Time Window</p><p className={`font-medium capitalize ${txt}`}>{activeDelivery.time_window}</p></div>
        </div>
        {(activeDelivery.status === 'accepted' || activeDelivery.status === 'intransit') && !showCompForm && <div className={`border-t ${dm ? 'border-gray-700' : 'border-gray-200'} pt-4 mt-4`}><button onClick={() => setShowCompForm(true)} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-4 rounded-lg flex items-center justify-center gap-2"><CheckCircle className="w-5 h-5" />Mark as Delivered</button></div>}
        {showCompForm && <div className={`border-t ${dm ? 'border-gray-700' : 'border-gray-200'} pt-4 mt-4 space-y-4`}><h4 className={`font-semibold ${txt}`}>Proof of Delivery</h4>
          <div><label className={`block text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Upload Proof Images</label><input type="file" accept="image/*" multiple onChange={onImageUpload} className={inp} />{proofImages.length > 0 && <p className={`mt-2 text-sm ${sub}`}>{proofImages.length} image(s)</p>}
            <div className="mt-3 grid grid-cols-3 gap-2">{proofImages.map((img, i) => <div key={i} className="relative"><img src={img} alt="" className="w-full h-24 object-cover rounded-lg" /><button onClick={() => setProofImages(p => p.filter((_, j) => j !== i))} className={`absolute top-1 right-1 ${dm ? 'bg-red-900 text-red-200' : 'bg-red-500 text-white'} rounded-full w-6 h-6 flex items-center justify-center text-xs`}>&#10005;</button></div>)}</div></div>
          {activeDelivery.packages.some(p => p.requires_signature) && <div><label className={`block text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Signature Name *</label><input type="text" value={sigName} onChange={e => setSigName(e.target.value)} placeholder="Name of signer" spellCheck={false} className={inp} /></div>}
          <div><label className={`block text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Comments</label><textarea value={delComments} onChange={e => setDelComments(e.target.value)} placeholder="Notes..." rows={3} spellCheck={false} className={inp} /></div>
          <div className="flex gap-3"><button onClick={() => { setShowCompForm(false); setProofImages(() => []); setSigName(''); setDelComments(''); }} className={`flex-1 ${dm ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-900'} font-medium py-3 rounded-lg`}>Cancel</button>
            <button onClick={onComplete} disabled={loading} className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-medium py-3 rounded-lg">{loading ? 'Submitting...' : 'Submit & Complete'}</button></div></div>}
      </div>
    </div>
  );
}
