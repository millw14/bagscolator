"use client";

import { useEffect, useState, useCallback } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { fetchBagscolatorStats, type BagscolatorStats } from "@/lib/program";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || "";
const CONFIG_ADDRESS = process.env.NEXT_PUBLIC_CONFIG_ADDRESS || "";
const POLL_MS = 10_000;

function formatSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function formatTokens(raw: number, decimals = 9): string {
  return (raw / 10 ** decimals).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return "ready";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-bags-border bg-bags-card p-5">
      <p className="text-xs uppercase tracking-widest text-bags-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold text-bags-text">{value}</p>
      {sub && <p className="mt-1 text-xs text-bags-muted">{sub}</p>}
    </div>
  );
}

export default function StatsPanel() {
  const [stats, setStats] = useState<BagscolatorStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    if (!PROGRAM_ID || !CONFIG_ADDRESS) {
      setError("Set NEXT_PUBLIC_PROGRAM_ID and NEXT_PUBLIC_CONFIG_ADDRESS in .env.local");
      return;
    }
    try {
      const s = await fetchBagscolatorStats(RPC_URL, PROGRAM_ID, CONFIG_ADDRESS);
      setStats(s);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      setTick((t) => t + 1);
      refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  if (error) {
    return (
      <div className="rounded-xl border border-bags-danger/30 bg-bags-card p-8 text-center">
        <p className="text-bags-danger">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-bags-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex items-center gap-3">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            stats.isActive ? "bg-bags-accent glow-pulse" : "bg-bags-danger"
          }`}
        />
        <span className="text-sm text-bags-muted">
          {stats.isActive ? "Protocol active" : "Protocol paused"}
        </span>
        <span className="ml-auto text-xs text-bags-muted">
          Buybacks executed: <span className="text-bags-text">{stats.buybackCount}</span>
        </span>
      </div>

      {/* Main stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Fee Vault"
          value={`${formatSol(stats.feeVaultBalance)} SOL`}
          sub={`${stats.progressToThreshold.toFixed(1)}% to threshold`}
        />
        <Stat
          label="Total SOL Spent"
          value={`${formatSol(stats.totalSolSpent)} SOL`}
          sub={`across ${stats.buybackCount} buybacks`}
        />
        <Stat
          label="Tokens Bought"
          value={formatTokens(stats.totalTokensBought)}
        />
        <Stat
          label="Permanently Locked"
          value={formatTokens(stats.lockVaultBalance)}
          sub="no withdrawal possible"
        />
      </div>

      {/* Progress bar */}
      <div className="rounded-xl border border-bags-border bg-bags-card p-5">
        <div className="mb-2 flex items-center justify-between text-xs text-bags-muted">
          <span>Progress to next buyback</span>
          <span>
            {formatSol(stats.feeVaultBalance)} / {formatSol(stats.minBuyThreshold)} SOL
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-bags-border">
          <div
            className="h-full rounded-full bg-bags-accent transition-all duration-700"
            style={{ width: `${stats.progressToThreshold}%` }}
          />
        </div>
        {stats.nextBuybackIn !== null && stats.nextBuybackIn > 0 && (
          <p className="mt-2 text-xs text-bags-muted">
            Cooldown: {formatTime(stats.nextBuybackIn)}
          </p>
        )}
      </div>

      {/* Config */}
      <div className="rounded-xl border border-bags-border bg-bags-card p-5">
        <p className="mb-3 text-xs uppercase tracking-widest text-bags-muted">Configuration</p>
        <div className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <span className="text-bags-muted">Threshold: </span>
            <span className="text-bags-text">{formatSol(stats.minBuyThreshold)} SOL</span>
          </div>
          <div>
            <span className="text-bags-muted">Cooldown: </span>
            <span className="text-bags-text">{stats.cooldownSeconds}s</span>
          </div>
          <div>
            <span className="text-bags-muted">Max slippage: </span>
            <span className="text-bags-text">{stats.maxSlippageBps / 100}%</span>
          </div>
          <div>
            <span className="text-bags-muted">Token: </span>
            <span className="text-bags-text font-mono text-xs">
              {stats.tokenMint.slice(0, 8)}...
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
