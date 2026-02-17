import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Wallet, Zap, ArrowDownLeft, ArrowUpRight, RefreshCw, Unplug, Copy, Check, X } from 'lucide-react';
import { getStyles } from './types';

interface NWCWalletProps {
  darkMode: boolean;
  savedNwcUrl?: string;
  onNwcUrlChange?: (url: string) => void;
}

interface Transaction {
  type: string;
  invoice: string;
  description: string;
  description_hash: string;
  preimage: string;
  payment_hash: string;
  amount: number; // millisats
  fees_paid: number;
  created_at: number;
  settled_at?: number;
  metadata?: Record<string, unknown>;
}

export default function NWCWallet({ darkMode, savedNwcUrl, onNwcUrlChange }: NWCWalletProps) {
  const { dm, inp, txt, sec } = getStyles(darkMode);

  const [nwcUrl, setNwcUrl] = useState('');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPayForm, setShowPayForm] = useState(false);
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [payInvoice, setPayInvoice] = useState('');
  const [paying, setPaying] = useState(false);
  const [receiveAmount, setReceiveAmount] = useState('');
  const [receiveMemo, setReceiveMemo] = useState('');
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] = useState('');
  const [payResult, setPayResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showTxns, setShowTxns] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const clientRef = useRef<any>(null);

  // Auto-connect from relay-backed saved URL
  useEffect(() => {
    if (savedNwcUrl && !connected && !connecting) {
      setNwcUrl(savedNwcUrl);
      connectWallet(savedNwcUrl);
    }
    return () => { if (clientRef.current) { try { clientRef.current.close(); } catch {} } };
  }, [savedNwcUrl]);

  const connectWallet = useCallback(async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed.startsWith('nostr+walletconnect://')) {
      setError('Invalid NWC URL. Must start with nostr+walletconnect://');
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const { NWCClient } = await import('@getalby/sdk/nwc');
      if (clientRef.current) { try { clientRef.current.close(); } catch {} }
      const client = new NWCClient({ nostrWalletConnectUrl: trimmed });
      clientRef.current = client;
      // Test connection by fetching balance
      const balRes = await client.getBalance();
      setBalance(balRes.balance);
      setConnected(true);
      if (onNwcUrlChange) onNwcUrlChange(trimmed);
    } catch (e: any) {
      setError(e?.message || 'Failed to connect wallet');
      setConnected(false);
      clientRef.current = null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setDisconnecting(true);
    try {
      if (clientRef.current) { try { clientRef.current.close(); } catch {} }
      clientRef.current = null;
      setConnected(false);
      setBalance(null);
      setTransactions([]);
      setShowPayForm(false);
      setShowReceiveForm(false);
      setShowTxns(false);
      setGeneratedInvoice('');
      setPayResult(null);
      if (onNwcUrlChange) onNwcUrlChange('');
    } finally {
      setDisconnecting(false);
    }
  }, []);

  const fetchBalance = useCallback(async () => {
    if (!clientRef.current) return;
    setLoadingBalance(true);
    try {
      const res = await clientRef.current.getBalance();
      setBalance(res.balance);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch balance');
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    if (!clientRef.current) return;
    setLoadingTxns(true);
    try {
      const res = await clientRef.current.listTransactions({ limit: 20 });
      setTransactions(res.transactions || []);
      setShowTxns(true);
      setError(null);
    } catch (e: any) {
      // Some wallets don't support list_transactions
      if (e?.message?.includes('NOT_IMPLEMENTED') || e?.message?.includes('not supported')) {
        setError('This wallet does not support transaction history');
      } else {
        setError(e?.message || 'Failed to fetch transactions');
      }
    } finally {
      setLoadingTxns(false);
    }
  }, []);

  const handlePay = useCallback(async () => {
    if (!clientRef.current || !payInvoice.trim()) return;
    setPaying(true);
    setError(null);
    setPayResult(null);
    try {
      const res = await clientRef.current.payInvoice({ invoice: payInvoice.trim() });
      setPayResult(`Paid! Preimage: ${res.preimage.substring(0, 16)}...`);
      setPayInvoice('');
      fetchBalance();
    } catch (e: any) {
      setError(e?.message || 'Payment failed');
    } finally {
      setPaying(false);
    }
  }, [payInvoice, fetchBalance]);

  const handleMakeInvoice = useCallback(async () => {
    if (!clientRef.current || !receiveAmount.trim()) return;
    const amtSats = parseInt(receiveAmount);
    if (isNaN(amtSats) || amtSats <= 0) { setError('Enter a valid amount in sats'); return; }
    setCreatingInvoice(true);
    setError(null);
    setGeneratedInvoice('');
    try {
      const res = await clientRef.current.makeInvoice({
        amount: amtSats * 1000, // convert sats to millisats
        description: receiveMemo.trim() || 'Nostr Delivery payment',
      });
      setGeneratedInvoice(res.invoice);
      setReceiveAmount('');
      setReceiveMemo('');
    } catch (e: any) {
      setError(e?.message || 'Failed to create invoice');
    } finally {
      setCreatingInvoice(false);
    }
  }, [receiveAmount, receiveMemo]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setError('Failed to copy'); }
  }, []);

  const formatSats = (millisats: number) => {
    const sats = Math.floor(millisats / 1000);
    return sats.toLocaleString();
  };

  const formatDate = (ts: number) => {
    return new Date(ts * 1000).toLocaleString();
  };

  // --- Not connected: show connection form ---
  if (!connected) {
    return (
      <div className={`p-4 ${sec} rounded-lg`}>
        <div className="flex items-center gap-2 mb-3">
          <Wallet className={`w-5 h-5 ${dm ? 'text-orange-400' : 'text-orange-600'}`} />
          <h3 className={`font-semibold ${txt}`}>Bitcoin Wallet (NWC)</h3>
        </div>
        {error && (
          <div className={`mb-3 p-2 text-sm rounded ${dm ? 'bg-red-900 text-red-200' : 'bg-red-50 text-red-700'}`}>
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-bold">&times;</button>
          </div>
        )}
        <div className="space-y-3">
          <input
            type="password"
            value={nwcUrl}
            onChange={e => setNwcUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !connecting) connectWallet(nwcUrl); }}
            placeholder="nostr+walletconnect://..."
            spellCheck={false}
            className={`${inp} text-sm font-mono`}
          />
          <button
            onClick={() => connectWallet(nwcUrl)}
            disabled={connecting || !nwcUrl.trim()}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
          >
            {connecting ? (
              <><RefreshCw className="w-4 h-4 animate-spin" />Connecting...</>
            ) : (
              <><Zap className="w-4 h-4" />Connect Wallet</>
            )}
          </button>
          <p className={`text-xs ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
            Paste your NWC connection string from Alby Hub, Mutiny, Primal, or any NWC-compatible wallet.
          </p>
        </div>
      </div>
    );
  }

  // --- Connected: show wallet dashboard ---
  return (
    <div className={`p-4 ${sec} rounded-lg`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wallet className={`w-5 h-5 text-green-500`} />
          <h3 className={`font-semibold ${txt}`}>Bitcoin Wallet (NWC)</h3>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Connected
          </span>
        </div>
        <button
          onClick={disconnectWallet}
          disabled={disconnecting}
          className={`p-1.5 rounded-lg transition-colors ${dm ? 'hover:bg-gray-600 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
          title="Disconnect wallet"
        >
          <Unplug className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className={`mb-3 p-2 text-sm rounded ${dm ? 'bg-red-900 text-red-200' : 'bg-red-50 text-red-700'}`}>
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-bold">&times;</button>
        </div>
      )}

      {payResult && (
        <div className={`mb-3 p-2 text-sm rounded ${dm ? 'bg-green-900 text-green-200' : 'bg-green-50 text-green-700'}`}>
          {payResult}
          <button onClick={() => setPayResult(null)} className="ml-2 font-bold">&times;</button>
        </div>
      )}

      {/* Balance */}
      <div className={`mb-3 p-3 rounded-lg ${dm ? 'bg-gray-800' : 'bg-white'} border ${dm ? 'border-gray-600' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-xs ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Balance</p>
            <p className={`text-2xl font-bold ${dm ? 'text-orange-400' : 'text-orange-600'}`}>
              {balance !== null ? `${formatSats(balance)} sats` : '---'}
            </p>
          </div>
          <button
            onClick={fetchBalance}
            disabled={loadingBalance}
            className={`p-2 rounded-lg transition-colors ${dm ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
            title="Refresh balance"
          >
            <RefreshCw className={`w-4 h-4 ${loadingBalance ? 'animate-spin' : ''} ${dm ? 'text-gray-400' : 'text-gray-500'}`} />
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => { setShowPayForm(!showPayForm); setShowReceiveForm(false); setGeneratedInvoice(''); }}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            showPayForm
              ? 'bg-orange-500 text-white'
              : dm ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5" />Send
        </button>
        <button
          onClick={() => { setShowReceiveForm(!showReceiveForm); setShowPayForm(false); setPayResult(null); }}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            showReceiveForm
              ? 'bg-orange-500 text-white'
              : dm ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5" />Receive
        </button>
        <button
          onClick={() => { if (showTxns) { setShowTxns(false); } else { fetchTransactions(); } }}
          disabled={loadingTxns}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            showTxns
              ? 'bg-orange-500 text-white'
              : dm ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {loadingTxns ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          History
        </button>
      </div>

      {/* Pay invoice form */}
      {showPayForm && (
        <div className={`mb-3 p-3 rounded-lg border ${dm ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
          <p className={`text-sm font-medium ${txt} mb-2`}>Pay Lightning Invoice</p>
          <textarea
            value={payInvoice}
            onChange={e => setPayInvoice(e.target.value)}
            placeholder="lnbc..."
            rows={3}
            spellCheck={false}
            className={`${inp} text-sm font-mono mb-2 resize-none`}
          />
          <div className="flex gap-2">
            <button
              onClick={handlePay}
              disabled={paying || !payInvoice.trim()}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
            >
              {paying ? <><RefreshCw className="w-4 h-4 animate-spin" />Paying...</> : <><Zap className="w-4 h-4" />Pay Invoice</>}
            </button>
            <button
              onClick={() => { setShowPayForm(false); setPayInvoice(''); }}
              className={`py-2 px-3 rounded-lg text-sm ${dm ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Receive / create invoice form */}
      {showReceiveForm && (
        <div className={`mb-3 p-3 rounded-lg border ${dm ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
          <p className={`text-sm font-medium ${txt} mb-2`}>Create Lightning Invoice</p>
          {!generatedInvoice ? (
            <>
              <div className="flex gap-2 mb-2">
                <input
                  type="number"
                  value={receiveAmount}
                  onChange={e => setReceiveAmount(e.target.value)}
                  placeholder="Amount (sats)"
                  min="1"
                  className={`${inp} text-sm flex-1`}
                />
              </div>
              <input
                type="text"
                value={receiveMemo}
                onChange={e => setReceiveMemo(e.target.value)}
                placeholder="Memo (optional)"
                className={`${inp} text-sm mb-2`}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleMakeInvoice}
                  disabled={creatingInvoice || !receiveAmount.trim()}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                >
                  {creatingInvoice ? <><RefreshCw className="w-4 h-4 animate-spin" />Creating...</> : <><ArrowDownLeft className="w-4 h-4" />Create Invoice</>}
                </button>
                <button
                  onClick={() => { setShowReceiveForm(false); setReceiveAmount(''); setReceiveMemo(''); }}
                  className={`py-2 px-3 rounded-lg text-sm ${dm ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div>
              <p className={`text-xs ${dm ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Share this invoice to receive payment:</p>
              <div className={`p-2 rounded font-mono text-xs break-all ${dm ? 'bg-gray-900 text-green-400' : 'bg-gray-50 text-gray-800'}`}>
                {generatedInvoice}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => copyToClipboard(generatedInvoice)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                    dm ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {copied ? <><Check className="w-3.5 h-3.5 text-green-500" />Copied!</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
                </button>
                <button
                  onClick={() => { setGeneratedInvoice(''); setShowReceiveForm(false); }}
                  className={`py-2 px-3 rounded-lg text-sm ${dm ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transaction history */}
      {showTxns && (
        <div className={`p-3 rounded-lg border ${dm ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-sm font-medium ${txt}`}>Recent Transactions</p>
            <button onClick={() => setShowTxns(false)} className={`${dm ? 'text-gray-400' : 'text-gray-500'}`}><X className="w-4 h-4" /></button>
          </div>
          {transactions.length === 0 ? (
            <p className={`text-sm ${dm ? 'text-gray-400' : 'text-gray-500'}`}>No transactions found.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {transactions.map((tx, i) => (
                <div key={i} className={`flex items-center justify-between p-2 rounded ${dm ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {tx.type === 'incoming' ? (
                      <ArrowDownLeft className="w-4 h-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-red-500 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${txt} truncate`}>
                        {tx.description || (tx.type === 'incoming' ? 'Received' : 'Sent')}
                      </p>
                      <p className={`text-xs ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
                        {formatDate(tx.settled_at || tx.created_at)}
                      </p>
                    </div>
                  </div>
                  <p className={`text-sm font-medium flex-shrink-0 ml-2 ${tx.type === 'incoming' ? 'text-green-500' : dm ? 'text-red-400' : 'text-red-500'}`}>
                    {tx.type === 'incoming' ? '+' : '-'}{formatSats(tx.amount)} sats
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
