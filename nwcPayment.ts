/**
 * Utility for automated NWC payments in delivery flows.
 * Uses a shared NWC client when available, otherwise creates ephemeral ones.
 */

export async function createPaymentInvoice(
  nwcUrl: string,
  amountSats: number,
  memo: string,
  existingClient?: any
): Promise<string> {
  if (existingClient) {
    const res = await existingClient.makeInvoice({
      amount: amountSats * 1000, // sats to millisats
      description: memo,
    });
    return res.invoice;
  }
  const { NWCClient } = await import('@getalby/sdk/nwc');
  const client = new NWCClient({ nostrWalletConnectUrl: nwcUrl });
  try {
    const res = await client.makeInvoice({
      amount: amountSats * 1000, // sats to millisats
      description: memo,
    });
    return res.invoice;
  } finally {
    client.close();
  }
}

export async function payPaymentInvoice(
  nwcUrl: string,
  invoice: string,
  existingClient?: any
): Promise<string> {
  if (existingClient) {
    const res = await existingClient.payInvoice({ invoice });
    return res.preimage;
  }
  const { NWCClient } = await import('@getalby/sdk/nwc');
  const client = new NWCClient({ nostrWalletConnectUrl: nwcUrl });
  try {
    const res = await client.payInvoice({ invoice });
    return res.preimage;
  } finally {
    client.close();
  }
}
