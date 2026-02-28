import { Connection, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";

const CONFIG_SEED = Buffer.from("config");
const FEE_VAULT_SEED = Buffer.from("fee_vault");
const LOCK_VAULT_SEED = Buffer.from("lock_vault");

export interface OnChainState {
  feeVaultAddress: PublicKey;
  feeVaultBalance: number;
  lockVaultAuthority: PublicKey;
  config: {
    authority: PublicKey;
    tokenMint: PublicKey;
    minBuyThreshold: number;
    cooldownSeconds: number;
    maxSlippageBps: number;
    totalSolSpent: number;
    totalTokensBought: number;
    totalTokensLocked: number;
    lastBuybackTimestamp: number;
    buybackCount: number;
    isActive: boolean;
    feeVaultBump: number;
    lockVaultBump: number;
  };
}

export function deriveFeeVault(
  programId: PublicKey,
  configAddress: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [FEE_VAULT_SEED, configAddress.toBuffer()],
    programId
  );
}

export function deriveLockVaultAuthority(
  programId: PublicKey,
  configAddress: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [LOCK_VAULT_SEED, configAddress.toBuffer()],
    programId
  );
}

export async function fetchState(
  connection: Connection,
  program: Program,
  configAddress: PublicKey,
  programId: PublicKey
): Promise<OnChainState> {
  const configData = await (program.account as any).config.fetch(configAddress);

  const [feeVaultAddress] = deriveFeeVault(programId, configAddress);
  const feeVaultBalance = await connection.getBalance(feeVaultAddress);

  const [lockVaultAuthority] = deriveLockVaultAuthority(programId, configAddress);

  return {
    feeVaultAddress,
    feeVaultBalance,
    lockVaultAuthority,
    config: {
      authority: configData.authority,
      tokenMint: configData.tokenMint,
      minBuyThreshold: configData.minBuyThreshold.toNumber(),
      cooldownSeconds: configData.cooldownSeconds.toNumber(),
      maxSlippageBps: configData.maxSlippageBps,
      totalSolSpent: configData.totalSolSpent.toNumber(),
      totalTokensBought: configData.totalTokensBought.toNumber(),
      totalTokensLocked: configData.totalTokensLocked.toNumber(),
      lastBuybackTimestamp: configData.lastBuybackTimestamp.toNumber(),
      buybackCount: configData.buybackCount.toNumber(),
      isActive: configData.isActive,
      feeVaultBump: configData.feeVaultBump,
      lockVaultBump: configData.lockVaultBump,
    },
  };
}

export function isBuybackReady(state: OnChainState): {
  ready: boolean;
  reason?: string;
} {
  if (!state.config.isActive) {
    return { ready: false, reason: "program paused" };
  }
  if (state.feeVaultBalance < state.config.minBuyThreshold) {
    return {
      ready: false,
      reason: `balance ${state.feeVaultBalance} < threshold ${state.config.minBuyThreshold}`,
    };
  }
  const now = Math.floor(Date.now() / 1000);
  const nextAllowed =
    state.config.lastBuybackTimestamp + state.config.cooldownSeconds;
  if (state.config.lastBuybackTimestamp > 0 && now < nextAllowed) {
    return {
      ready: false,
      reason: `cooldown: ${nextAllowed - now}s remaining`,
    };
  }
  return { ready: true };
}
