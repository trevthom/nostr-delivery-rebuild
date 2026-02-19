/**
 * Utility for automated NWC payments in delivery flows.
 * Creates ephemeral NWC clients to generate and pay Lightning invoices.
 */

export async function createPaymentInvoice(
  nwcUrl: string,
  amountSats: number,
  memo: string
): Promise<string> {
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
  invoice: string
): Promise<string> {
  const { NWCClient } = await import('@getalby/sdk/nwc');
  const client = new NWCClient({ nostrWalletConnectUrl: nwcUrl });
  try {
    const res = await client.payInvoice({ invoice });
    return res.preimage;
  } finally {
    client.close();
  }
}
