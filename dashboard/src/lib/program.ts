import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Program, AnchorProvider } from "@coral-xyz/anchor";

const CONFIG_SEED = Buffer.from("config");
const FEE_VAULT_SEED = Buffer.from("fee_vault");
const LOCK_VAULT_SEED = Buffer.from("lock_vault");

export interface BagscolatorStats {
  isActive: boolean;
  tokenMint: string;
  authority: string;
  minBuyThreshold: number;
  cooldownSeconds: number;
  maxSlippageBps: number;
  totalSolSpent: number;
  totalTokensBought: number;
  totalTokensLocked: number;
  lastBuybackTimestamp: number;
  buybackCount: number;
  feeVaultBalance: number;
  lockVaultBalance: number;
  nextBuybackIn: number | null;
  progressToThreshold: number;
}

export async function fetchBagscolatorStats(
  rpcUrl: string,
  programId: string,
  configAddress: string
): Promise<BagscolatorStats> {
  const connection = new Connection(rpcUrl, "confirmed");
  const configPubkey = new PublicKey(configAddress);
  const programPubkey = new PublicKey(programId);

  const configInfo = await connection.getAccountInfo(configPubkey);
  if (!configInfo) throw new Error("Config account not found");

  // Decode Config manually (discriminator 8 bytes + fields)
  const data = configInfo.data;
  const authority = new PublicKey(data.subarray(8, 40));
  const tokenMint = new PublicKey(data.subarray(40, 72));
  const minBuyThreshold = Number(data.readBigUInt64LE(72));
  const cooldownSeconds = Number(data.readBigInt64LE(80));
  const maxSlippageBps = data.readUInt16LE(88);
  const totalSolSpent = Number(data.readBigUInt64LE(90));
  const totalTokensBought = Number(data.readBigUInt64LE(98));
  const totalTokensLocked = Number(data.readBigUInt64LE(106));
  const lastBuybackTimestamp = Number(data.readBigInt64LE(114));
  const buybackCount = Number(data.readBigUInt64LE(122));
  const isActive = data[130] === 1;

  const [feeVaultAddress] = PublicKey.findProgramAddressSync(
    [FEE_VAULT_SEED, configPubkey.toBuffer()],
    programPubkey
  );

  const [lockVaultAuthority] = PublicKey.findProgramAddressSync(
    [LOCK_VAULT_SEED, configPubkey.toBuffer()],
    programPubkey
  );

  const lockVaultTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    lockVaultAuthority,
    true
  );

  const [feeVaultBalance, lockVaultInfo] = await Promise.all([
    connection.getBalance(feeVaultAddress),
    connection.getTokenAccountBalance(lockVaultTokenAccount).catch(() => null),
  ]);

  const lockVaultBalance = lockVaultInfo
    ? Number(lockVaultInfo.value.amount)
    : 0;

  const now = Math.floor(Date.now() / 1000);
  let nextBuybackIn: number | null = null;
  if (lastBuybackTimestamp > 0) {
    const nextAllowed = lastBuybackTimestamp + cooldownSeconds;
    nextBuybackIn = nextAllowed > now ? nextAllowed - now : 0;
  }

  const progressToThreshold = minBuyThreshold > 0
    ? Math.min((feeVaultBalance / minBuyThreshold) * 100, 100)
    : 0;

  return {
    isActive,
    tokenMint: tokenMint.toBase58(),
    authority: authority.toBase58(),
    minBuyThreshold,
    cooldownSeconds,
    maxSlippageBps,
    totalSolSpent,
    totalTokensBought,
    totalTokensLocked,
    lastBuybackTimestamp,
    buybackCount,
    feeVaultBalance,
    lockVaultBalance,
    nextBuybackIn,
    progressToThreshold,
  };
}
