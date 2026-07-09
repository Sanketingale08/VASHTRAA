import { db } from "@workspace/db";
import { stockHistoryTable } from "@workspace/db";

type StockHistorySource = "order" | "cancel" | "return" | "manual" | "bulk";

interface RecordStockChangeOpts {
  tx?: any;
  productId: string;
  vendorId?: string | null;
  previousStock: number;
  newStock: number;
  source: StockHistorySource;
  reason?: string;
  actorId?: string | null;
  orderId?: string | null;
}

export async function recordStockChange(opts: RecordStockChangeOpts) {
  const client = opts.tx ?? db;
  const delta = opts.newStock - opts.previousStock;
  if (delta === 0) return;
  await client.insert(stockHistoryTable).values({
    productId: opts.productId,
    vendorId: opts.vendorId ?? null,
    delta,
    previousStock: opts.previousStock,
    newStock: opts.newStock,
    source: opts.source,
    reason: opts.reason ?? "",
    actorId: opts.actorId ?? null,
    orderId: opts.orderId ?? null,
  });
}
