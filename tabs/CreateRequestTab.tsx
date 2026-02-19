import React from 'react';
import { Package, Bitcoin } from 'lucide-react';
import type { DeliveryRequest, FormState, PackageInfo, PkgSize } from '../types';
import { PkgSize as PS, getStyles } from '../types';

interface Props {
  darkMode: boolean;
  editing: DeliveryRequest | null;
  setEditing: (d: DeliveryRequest | null) => void;
  form: FormState;
  setForm: (f: FormState) => void;
  isPkg: boolean;
  setIsPkg: (v: boolean) => void;
  isPerson: boolean;
  setIsPerson: (v: boolean) => void;
  autoApprove: boolean;
  setAutoApprove: (v: boolean) => void;
  loading: boolean;
  resetForm: () => void;
  onCreate: () => void;
  onUpdate: () => void;
}

export default function CreateRequestTab({ darkMode, editing, setEditing, form, setForm, isPkg, setIsPkg, isPerson, setIsPerson, autoApprove, setAutoApprove, loading, resetForm, onCreate, onUpdate }: Props) {
  const { dm, inp, card, txt, sec } = getStyles(darkMode);
  const uPkg = (i: number, u: Partial<PackageInfo>) => { const p = [...form.packages]; p[i] = { ...p[i], ...u }; setForm({ ...form, packages: p }); };

  return (
    <div className={card}>
      <h2 className={`text-2xl font-bold mb-6 ${txt}`}>{editing ? 'Edit Request' : 'Create Request'}</h2>
      {editing && <div className={`mb-4 p-3 ${dm ? 'bg-blue-900 border-blue-700' : 'bg-blue-50 border-blue-200'} border rounded-lg flex items-center justify-between`}><span className={`${dm ? 'text-blue-200' : 'text-blue-700'} text-sm`}><strong>Editing:</strong> Modify until accepted.</span><button onClick={() => { setEditing(null); resetForm(); }} className={`${dm ? 'text-blue-200' : 'text-blue-700'} text-sm font-medium`}>Cancel Edit</button></div>}
      <div className="space-y-6">
        <div><label className={`block text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Pickup Location *</label><input type="text" value={form.pickupAddr} onChange={e => setForm({ ...form, pickupAddr: e.target.value })} placeholder="123 Main St, City, State ZIP" spellCheck={false} className={inp} />
          <input type="text" value={form.pickupInst} onChange={e => setForm({ ...form, pickupInst: e.target.value })} placeholder="Special instructions (optional)" spellCheck={false} className={`${inp} mt-2`} /></div>
        <div><label className={`block text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Dropoff Location *</label><input type="text" value={form.dropoffAddr} onChange={e => setForm({ ...form, dropoffAddr: e.target.value })} placeholder="456 Oak Ave, City, State ZIP" spellCheck={false} className={inp} />
          <input type="text" value={form.dropoffInst} onChange={e => setForm({ ...form, dropoffInst: e.target.value })} placeholder="Dropoff instructions (optional)" spellCheck={false} className={`${inp} mt-2`} /></div>
        <div><label className={`block text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Request Type *</label>
          <div className="flex gap-6"><label className={`flex items-center gap-2 ${dm ? 'text-gray-300' : 'text-gray-700'}`}><input type="checkbox" checked={isPkg} onChange={e => setIsPkg(e.target.checked)} className="rounded" />Packages</label>
            <label className={`flex items-center gap-2 ${dm ? 'text-gray-300' : 'text-gray-700'}`}><input type="checkbox" checked={isPerson} onChange={e => setIsPerson(e.target.checked)} className="rounded" />Persons</label></div></div>
        {isPkg && <div><label className={`block text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Packages</label>
          {form.packages.map((pkg, i) => <div key={i} className={`${sec} rounded-lg p-4 mb-3`}><div className="flex items-center justify-between mb-3"><span className={`font-medium ${txt}`}>Package {i + 1}</span>{form.packages.length > 1 && <button onClick={() => setForm({ ...form, packages: form.packages.filter((_, j) => j !== i) })} className={`${dm ? 'text-red-400' : 'text-red-600'} text-sm`}>Remove</button>}</div>
            <select value={pkg.size} onChange={e => uPkg(i, { size: e.target.value as PkgSize })} className={`w-full px-3 py-2 border ${dm ? 'border-gray-600 bg-gray-600 text-white' : 'border-gray-300 bg-white'} rounded-lg mb-2`}><option value={PS.ENVELOPE}>Envelope</option><option value={PS.SMALL}>Small (1-5 lbs)</option><option value={PS.MEDIUM}>Medium (5-20 lbs)</option><option value={PS.LARGE}>Large (20-50 lbs)</option><option value={PS.EXTRA_LARGE}>Extra Large (50+ lbs)</option></select>
            <input type="text" value={pkg.description} onChange={e => uPkg(i, { description: e.target.value })} placeholder="Description (optional)" spellCheck={false} className={`w-full px-3 py-2 border ${dm ? 'border-gray-600 bg-gray-600 text-white placeholder-gray-400' : 'border-gray-300 bg-white'} rounded-lg mb-2`} />
            <div className="flex gap-4"><label className={`flex items-center gap-2 text-sm ${dm ? 'text-gray-300' : 'text-gray-700'}`}><input type="checkbox" checked={pkg.fragile} onChange={e => uPkg(i, { fragile: e.target.checked })} className="rounded" />Fragile</label>
              <label className={`flex items-center gap-2 text-sm ${dm ? 'text-gray-300' : 'text-gray-700'}`}><input type="checkbox" checked={pkg.requires_signature} onChange={e => uPkg(i, { requires_signature: e.target.checked })} className="rounded" />Signature Required</label></div></div>)}
          <button onClick={() => setForm({ ...form, packages: [...form.packages, { size: PS.SMALL, description: '', fragile: false, requires_signature: false }] })} className="text-orange-600 hover:text-orange-700 font-medium text-sm">+ Add Another Package</button></div>}
        {isPerson && <div><label className={`block text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Persons</label><div className={`${sec} rounded-lg p-4 space-y-4`}>
          <div className="grid grid-cols-2 gap-4"><div><label className={`block text-sm ${dm ? 'text-gray-300' : 'text-gray-700'} mb-1`}>Adults</label><input type="number" min="0" value={form.persons.adults} onChange={e => setForm({ ...form, persons: { ...form.persons, adults: parseInt(e.target.value) || 0 } })} className={`w-full px-3 py-2 border ${dm ? 'border-gray-600 bg-gray-600 text-white' : 'border-gray-300 bg-white'} rounded-lg`} /></div>
            <div><label className={`block text-sm ${dm ? 'text-gray-300' : 'text-gray-700'} mb-1`}>Children</label><input type="number" min="0" value={form.persons.children} onChange={e => setForm({ ...form, persons: { ...form.persons, children: parseInt(e.target.value) || 0 } })} className={`w-full px-3 py-2 border ${dm ? 'border-gray-600 bg-gray-600 text-white' : 'border-gray-300 bg-white'} rounded-lg`} /></div></div>
          <label className={`flex items-center gap-2 text-sm ${dm ? 'text-gray-300' : 'text-gray-700'}`}><input type="checkbox" checked={form.persons.carSeatRequested} onChange={e => setForm({ ...form, persons: { ...form.persons, carSeatRequested: e.target.checked } })} className="rounded" />Car seat requested</label>
          <div><label className={`flex items-center gap-2 text-sm ${dm ? 'text-gray-300' : 'text-gray-700'} mb-2`}><input type="checkbox" checked={form.persons.luggage.hasLuggage} onChange={e => setForm({ ...form, persons: { ...form.persons, luggage: { ...form.persons.luggage, hasLuggage: e.target.checked } } })} className="rounded" />Luggage</label>
            {form.persons.luggage.hasLuggage && <div className="ml-6 space-y-2"><input type="text" value={form.persons.luggage.dimensions} onChange={e => setForm({ ...form, persons: { ...form.persons, luggage: { ...form.persons.luggage, dimensions: e.target.value } } })} placeholder="Dimensions (e.g., 24x16x10 in)" spellCheck={false} className={`w-full px-3 py-2 border ${dm ? 'border-gray-600 bg-gray-600 text-white placeholder-gray-400' : 'border-gray-300 bg-white'} rounded-lg`} />
              <input type="text" value={form.persons.luggage.weight} onChange={e => setForm({ ...form, persons: { ...form.persons, luggage: { ...form.persons.luggage, weight: e.target.value } } })} placeholder="Weight (e.g., 50 lbs)" spellCheck={false} className={`w-full px-3 py-2 border ${dm ? 'border-gray-600 bg-gray-600 text-white placeholder-gray-400' : 'border-gray-300 bg-white'} rounded-lg`} /></div>}</div></div></div>}
        <div><label className={`block text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Time Window</label><select value={form.timeWindow} onChange={e => setForm({ ...form, timeWindow: e.target.value })} className={inp}><option value="asap">ASAP (within 2 hours)</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="custom">Custom Date</option></select>
          {form.timeWindow === 'custom' && <input type="date" value={form.customDate} onChange={e => setForm({ ...form, customDate: e.target.value })} className={`${inp} mt-2`} />}</div>
        <div><label className={`block text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Offer Amount (sats) *</label><div className="relative"><Bitcoin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-orange-500" />
          <input type="number" value={form.offer} onChange={e => setForm({ ...form, offer: e.target.value })} placeholder="25000" className={`w-full pl-12 pr-4 py-3 border ${dm ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400' : 'border-gray-300 bg-white'} rounded-lg focus:ring-2 focus:ring-orange-500`} /></div></div>
        <div className={`p-4 ${sec} rounded-lg`}>
          <label className={`flex items-center gap-3 ${dm ? 'text-gray-300' : 'text-gray-700'} cursor-pointer`}>
            <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} className="rounded w-5 h-5" />
            <div><span className="font-medium">Auto-approve matching bids</span><p className={`text-sm ${dm ? 'text-gray-400' : 'text-gray-500'} mt-1`}>Automatically approve bids that match your offer amount (non-counteroffers). The job will skip "Accept/Decline Bids" and move directly to "In Transport".</p></div>
          </label>
        </div>
        <button onClick={editing ? onUpdate : onCreate} disabled={loading} className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-medium py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2">
          {loading ? 'Processing...' : <><Package className="w-5 h-5" />{editing ? 'Update Request' : 'Create Request'}</>}</button>
      </div>
    </div>
  );
}
