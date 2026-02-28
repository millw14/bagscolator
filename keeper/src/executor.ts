import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from "@solana/spl-token";
import { Program, BN } from "@coral-xyz/anchor";
import { OnChainState } from "./monitor";

const JUPITER_V6_PROGRAM_ID = new PublicKey(
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
);

interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  routePlan: unknown[];
}

interface JupiterSwapResponse {
  swapTransaction: string; // base64-encoded versioned tx
}

export async function getJupiterQuote(
  jupiterApiUrl: string,
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number
): Promise<JupiterQuote> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amount.toString(),
    slippageBps: slippageBps.toString(),
    swapMode: "ExactIn",
  });

  const res = await fetch(`${jupiterApiUrl}/quote?${params}`);
  if (!res.ok) {
    throw new Error(`Jupiter quote failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getJupiterSwapIx(
  jupiterApiUrl: string,
  quote: JupiterQuote,
  userPublicKey: string
): Promise<JupiterSwapResponse> {
  const res = await fetch(`${jupiterApiUrl}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: false,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });
  if (!res.ok) {
    throw new Error(`Jupiter swap failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Build and send the full buyback transaction:
 *   Ix 0: create WSOL ATA for fee_vault (idempotent)
 *   Ix 1: program.execute_buyback  (SOL → WSOL → Jupiter CPI → verify → close WSOL)
 */
export async function executeBuyback(
  connection: Connection,
  program: Program,
  keeper: Keypair,
  state: OnChainState,
  configAddress: PublicKey,
  jupiterApiUrl: string
): Promise<string> {
  const {
    feeVaultAddress,
    feeVaultBalance,
    lockVaultAuthority,
    config: { tokenMint, maxSlippageBps },
  } = state;

  // 1. Jupiter quote: SOL → token
  const quote = await getJupiterQuote(
    jupiterApiUrl,
    NATIVE_MINT.toBase58(),
    tokenMint.toBase58(),
    feeVaultBalance,
    maxSlippageBps
  );

  const minOutputAmount = BigInt(quote.otherAmountThreshold);

  console.log(
    `  quote: ${feeVaultBalance / LAMPORTS_PER_SOL} SOL → ≥${minOutputAmount} tokens`
  );

  // 2. Jupiter swap instructions (we extract the inner instructions from the
  //    versioned tx Jupiter returns — in a real integration you'd use their
  //    /swap-instructions endpoint for cleaner composability).
  const swapResp = await getJupiterSwapIx(
    jupiterApiUrl,
    quote,
    feeVaultAddress.toBase58()
  );

  const swapTxBuf = Buffer.from(swapResp.swapTransaction, "base64");
  const jupTx = VersionedTransaction.deserialize(swapTxBuf);

  // 3. Build our composite transaction
  const feeVaultWsol = getAssociatedTokenAddressSync(
    NATIVE_MINT,
    feeVaultAddress,
    true // allowOwnerOffCurve — fee_vault is a PDA
  );

  const lockVaultTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    lockVaultAuthority,
    true
  );

  const createWsolIx = createAssociatedTokenAccountIdempotentInstruction(
    keeper.publicKey,
    feeVaultWsol,
    feeVaultAddress,
    NATIVE_MINT
  );

  // Serialize execute_buyback data: discriminator + swap_data + min_output
  // In production this would use the IDL-generated method builder.
  // For now we call via the Anchor program client.
  const buybackIx = await program.methods
    .executeBuyback(
      Buffer.from([]), // swap_data placeholder — Jupiter CPI data
      new BN(minOutputAmount.toString())
    )
    .accounts({
      keeper: keeper.publicKey,
      config: configAddress,
      feeVault: feeVaultAddress,
      feeVaultWsol,
      lockVaultAuthority,
      lockVaultTokenAccount,
      jupiterProgram: JUPITER_V6_PROGRAM_ID,
    })
    .instruction();

  // 4. Assemble + sign
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");

  const message = new TransactionMessage({
    payerKey: keeper.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [createWsolIx, buybackIx],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([keeper]);

  const sig = await connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 2,
  });

  await connection.confirmTransaction(
    { signature: sig, ...latestBlockhash },
    "confirmed"
  );

  return sig;
}
