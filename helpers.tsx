import React from 'react';
import type { Location, PackageInfo, PersonsInfo, ProofOfDelivery } from './types';

interface StyleProps { dm: boolean; sub: string; txt: string; sec: string; }

export const LocBlock = ({ label, loc, s }: { label: string; loc: Location; s: StyleProps }) => (
  <div className={`mb-4 p-3 ${s.sec} rounded-lg`}>
    <p className={`text-sm font-bold ${s.sub} mb-1`}>{label}</p><p className={`${s.txt} mb-2`}>{loc.address}</p>
    {loc.instructions && <><p className={`text-sm font-bold ${s.sub} mb-1 mt-3`}>Special Instructions:</p><p className={`text-sm ${s.dm?'text-gray-300':'text-gray-700'}`}>{loc.instructions}</p></>}
  </div>
);

export const PkgBlock = ({ pkgs, s }: { pkgs: PackageInfo[]; s: StyleProps }) => pkgs.length > 0 ? <div className="mb-4">{pkgs.map((pkg, i) => (
  <div key={i} className={`mb-3 p-3 ${s.sec} rounded-lg`}><p className={`text-sm mb-2 ${s.dm?'text-gray-300':'text-gray-700'}`}><strong>Package Size:</strong> {pkg.size}</p>
    {pkg.description && <p className={`text-sm mb-2 ${s.dm?'text-gray-300':'text-gray-700'}`}><strong>Description:</strong> {pkg.description}</p>}
    <div className="flex flex-wrap gap-2">{pkg.fragile && <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">Fragile</span>}{pkg.requires_signature && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Signature Required</span>}</div>
  </div>))}</div> : null;

export const PersonBlock = ({ p, s }: { p?: PersonsInfo; s: StyleProps }) => p && (p.adults > 0 || p.children > 0) ? (
  <div className={`mb-4 p-3 ${s.sec} rounded-lg`}><p className={`text-sm mb-2 ${s.dm?'text-gray-300':'text-gray-700'}`}><strong>Adults:</strong> {p.adults}, <strong>Children:</strong> {p.children}</p>
    <div className="flex flex-wrap gap-2">{p.carSeatRequested && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">Car Seat Needed</span>}</div>
    {p.luggage?.hasLuggage && <div className={`text-sm mt-2 ${s.dm?'text-gray-300':'text-gray-700'}`}><strong>Luggage:</strong>{p.luggage.dimensions && ` ${p.luggage.dimensions}`}{p.luggage.weight && `, ${p.luggage.weight}`}</div>}
  </div>) : null;

export const ProofBlock = ({ pod, s }: { pod?: ProofOfDelivery; s: StyleProps }) => pod ? (
  <div className={`mb-4 p-3 ${s.sec} rounded-lg`}><h4 className={`font-semibold mb-2 ${s.txt}`}>Proof of Delivery</h4>
    {pod.signature_name && <p className={`text-sm mb-2 ${s.dm?'text-gray-300':'text-gray-700'}`}><strong>Received by:</strong> {pod.signature_name}</p>}
    {pod.comments && <p className={`text-sm mb-2 ${s.dm?'text-gray-300':'text-gray-700'}`}><strong>Comments:</strong> {pod.comments}</p>}
    {pod.images.length > 0 && <div className="grid grid-cols-4 gap-2 mt-2">{pod.images.map((img, i) => <img key={i} src={img} alt={`Proof ${i+1}`} className="w-full h-24 object-cover rounded-lg cursor-pointer hover:opacity-80" onClick={() => window.open(img, '_blank')} />)}</div>}
  </div>) : null;
