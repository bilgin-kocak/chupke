import { createHash } from "node:crypto";

/** Shielded pools a received output can land in. Ironwood is the active pool on NU7 testnet. */
export type Pool = "ironwood" | "orchard" | "sapling" | "transparent";

export interface WalletInfo {
  chainHeight: number;
  walletHeight: number;
}

export interface WalletBalance {
  spendableZat: number;
  totalZat: number;
}

/** A fresh unified address of the shop account (ZIP 316 diversified; shielded receivers only). */
export interface NewAddress {
  address: string;
  /** The wallet's address index (ZIP 32 diversifier index order). */
  index: number;
}

/** One received output. `key` is stable across rescans (payments.key, invariant I1). */
export interface IncomingOutput {
  key: string;
  txid: string;
  pool: Pool;
  outputIndex: number | null;
  amountZat: number;
  memo: string | null;
  minedHeight: number | null;
  confirmations: number;
}

export interface SentOutput {
  txid: string;
  to: string | null;
  amountZat: number;
  memo: string | null;
}

export interface ZcashWallet {
  info(): Promise<WalletInfo>;
  sync(): Promise<void>;
  /** The wallet's primary shielded unified address (the shop UA). */
  primaryAddress(): Promise<string>;
  /**
   * Writes the wallet: derives the next diversified address of the same account. Every address
   * shares the account's viewing key, so payments to any of them are received like the primary one.
   */
  newAddress(): Promise<NewAddress>;
  balance(): Promise<WalletBalance>;
  listIncoming(): Promise<IncomingOutput[]>;
  /** May throw NotSupportedError (e.g. a view-only inbox). */
  listSent(): Promise<SentOutput[]>;
  /** Money-moving: callers must persist their intent before calling (invariant I3). */
  send(to: string, amountZat: number, memo: string): Promise<{ txid: string }>;
}

/**
 * WALLET_MODE=split: watch with a view-only inbox (from the shop UFVK), spend with the outbox
 * (the full wallet of the same account). Both derive the same addresses and output keys, so
 * payments.key is identical in either mode and switching modes never reprocesses an output.
 */
export class SplitWallet implements ZcashWallet {
  constructor(
    private readonly inbox: ZcashWallet,
    private readonly outbox: ZcashWallet,
  ) {}
  info(): Promise<WalletInfo> {
    return this.inbox.info();
  }
  async sync(): Promise<void> {
    await this.inbox.sync();
    await this.outbox.sync(); // listSent and balance read the outbox
  }
  primaryAddress(): Promise<string> {
    return this.inbox.primaryAddress();
  }
  /** The view-only inbox derives the same address at each index as the full wallet (checked live). */
  newAddress(): Promise<NewAddress> {
    return this.inbox.newAddress();
  }
  balance(): Promise<WalletBalance> {
    return this.outbox.balance();
  }
  listIncoming(): Promise<IncomingOutput[]> {
    return this.inbox.listIncoming();
  }
  listSent(): Promise<SentOutput[]> {
    return this.outbox.listSent();
  }
  send(to: string, amountZat: number, memo: string): Promise<{ txid: string }> {
    return this.outbox.send(to, amountZat, memo);
  }
}

export class NotSupportedError extends Error {
  constructor(what: string) {
    super(`not supported: ${what}`);
    this.name = "NotSupportedError";
  }
}

/** Raised when a wallet command fails. Never carries raw stdout/stderr (it may hold addresses or memos). */
export class WalletCommandError extends Error {
  constructor(
    readonly command: string,
    readonly exitCode: number | null,
    message: string,
  ) {
    super(message);
    this.name = "WalletCommandError";
  }
}

/**
 * A send the wallet refused before building/broadcasting anything (e.g. "Propose send error:
 * Insufficient balance"). Safe to retry without checking listSent: no money moved.
 */
export class SendNotBroadcastError extends WalletCommandError {
  constructor(command: string, exitCode: number | null, message: string) {
    super(command, exitCode, message);
    this.name = "SendNotBroadcastError";
  }
}

/**
 * payments.key: "<txid>:<pool>:<outputIndex>", or "<txid>:<sha256(memo|amount)[0..8]>" when the
 * wallet reports no output index.
 */
export function paymentKey(o: { txid: string; pool: Pool; outputIndex: number | null; memo: string | null; amountZat: number }): string {
  if (o.outputIndex !== null) return `${o.txid}:${o.pool}:${o.outputIndex}`;
  const digest = createHash("sha256").update(`${o.memo ?? ""}|${o.amountZat}`).digest("hex").slice(0, 8);
  return `${o.txid}:${digest}`;
}
