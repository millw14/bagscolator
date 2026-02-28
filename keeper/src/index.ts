import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { loadConfig } from "./config";
import { fetchState, isBuybackReady } from "./monitor";
import { executeBuyback } from "./executor";
import * as idl from "../../target/idl/bagscolator.json";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(maxMs: number): number {
  return Math.floor(Math.random() * maxMs);
}

async function main() {
  const cfg = loadConfig();
  console.log("bagscolator keeper starting");
  console.log(`  rpc:     ${cfg.connection.rpcEndpoint}`);
  console.log(`  keeper:  ${cfg.keeper.publicKey.toBase58()}`);
  console.log(`  config:  ${cfg.configAddress.toBase58()}`);
  console.log(`  poll:    ${cfg.pollIntervalMs}ms`);

  const provider = new AnchorProvider(
    cfg.connection,
    new Wallet(cfg.keeper),
    { commitment: "confirmed" }
  );
  const program = new Program(idl as any, cfg.programId, provider);

  let consecutiveErrors = 0;

  while (true) {
    try {
      const state = await fetchState(
        cfg.connection,
        program,
        cfg.configAddress,
        cfg.programId
      );

      const check = isBuybackReady(state);

      if (!check.ready) {
        process.stdout.write(`\r  waiting — ${check.reason}          `);
        consecutiveErrors = 0;
        await sleep(cfg.pollIntervalMs);
        continue;
      }

      // Anti-frontrun: add random jitter before execution
      const delay = jitter(cfg.jitterMaxMs);
      console.log(`\n  threshold met — executing in ${delay}ms`);
      await sleep(delay);

      // Re-check after jitter (state may have changed)
      const freshState = await fetchState(
        cfg.connection,
        program,
        cfg.configAddress,
        cfg.programId
      );
      const recheck = isBuybackReady(freshState);
      if (!recheck.ready) {
        console.log(`  stale after jitter — ${recheck.reason}`);
        await sleep(cfg.pollIntervalMs);
        continue;
      }

      const sig = await executeBuyback(
        cfg.connection,
        program,
        cfg.keeper,
        freshState,
        cfg.configAddress,
        cfg.jupiterApiUrl
      );

      console.log(`  buyback #${freshState.config.buybackCount + 1} confirmed: ${sig}`);
      consecutiveErrors = 0;
    } catch (err: any) {
      consecutiveErrors++;
      const backoff = Math.min(
        cfg.pollIntervalMs * Math.pow(2, consecutiveErrors),
        60_000
      );
      console.error(`\n  error (attempt ${consecutiveErrors}): ${err.message}`);
      if (consecutiveErrors >= cfg.maxRetries) {
        console.error(`  backing off ${backoff}ms`);
      }
      await sleep(backoff);
    }
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
