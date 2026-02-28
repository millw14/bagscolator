import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

function envOrThrow(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function loadKeypair(keypairPath: string): Keypair {
  const resolved = keypairPath.startsWith("~")
    ? path.join(process.env.HOME || process.env.USERPROFILE || "", keypairPath.slice(1))
    : keypairPath;
  const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export interface KeeperConfig {
  connection: Connection;
  keeper: Keypair;
  programId: PublicKey;
  configAddress: PublicKey;
  jupiterApiUrl: string;
  pollIntervalMs: number;
  maxRetries: number;
  jitterMaxMs: number;
}

export function loadConfig(): KeeperConfig {
  const rpcUrl = envOrThrow("RPC_URL");
  const keypairPath = envOrThrow("KEEPER_KEYPAIR_PATH");
  const programId = new PublicKey(envOrThrow("PROGRAM_ID"));
  const configAddress = new PublicKey(envOrThrow("CONFIG_ADDRESS"));
  const jupiterApiUrl = process.env.JUPITER_API_URL || "https://quote-api.jup.ag/v6";
  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || "15000", 10);
  const maxRetries = parseInt(process.env.MAX_RETRIES || "3", 10);
  const jitterMaxMs = parseInt(process.env.JITTER_MAX_MS || "5000", 10);

  return {
    connection: new Connection(rpcUrl, "confirmed"),
    keeper: loadKeypair(keypairPath),
    programId,
    configAddress,
    jupiterApiUrl,
    pollIntervalMs,
    maxRetries,
    jitterMaxMs,
  };
}
