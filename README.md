# Bagscolator

A deflationary launch primitive for Solana. Launch fees automatically buy the
token back and permanently lock it on-chain.

No trust assumptions. No admin withdrawals. Provably permanent.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Transaction                              │
│                                                                  │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │  Fee Vault   │───►│  Jupiter v6 CPI  │───►│  Lock Vault   │  │
│  │  (SOL PDA)   │    │  (WSOL → Token)  │    │  (Token PDA)  │  │
│  └──────────────┘    └──────────────────┘    └───────────────┘  │
│        ▲                                            │            │
│        │                                            ▼            │
│  ┌──────────────┐                          No withdraw exists.   │
│  │  Bags fees   │                          Program is immutable. │
│  │  deposited   │                          Tokens locked forever.│
│  └──────────────┘                                                │
└──────────────────────────────────────────────────────────────────┘
```

### Four layers

| Layer | Where | What |
|---|---|---|
| **Fee Vault** | On-chain PDA | Accumulates SOL from launch fees |
| **Buy Engine** | On-chain program | Validates conditions → Jupiter CPI → verifies output |
| **Lock Vault** | On-chain PDA | Token account with PDA authority, no withdraw instruction |
| **Keeper Bot** | Off-chain (Node.js) | Monitors vault, triggers buybacks, handles Jupiter routing |

### Anti-exploit measures

| Attack | Mitigation |
|---|---|
| Front-running | Random jitter on execution timing, Jupiter routing |
| Sandwich attacks | Slippage protection (configurable bps), min output enforcement |
| Wash trading for buybacks | Minimum threshold (configurable), cooldown between buybacks |
| Admin rug | No withdraw instruction exists. Renounce program upgrade authority post-deploy. |

---

## Project structure

```
bagscolator/
├── programs/bagscolator/     # Anchor program (Rust)
│   └── src/
│       ├── lib.rs            # Program entry point
│       ├── state.rs          # Config account, events
│       ├── errors.rs         # Custom error codes
│       ├── constants.rs      # Seeds, limits
│       └── instructions/
│           ├── initialize.rs       # Set up protocol for a token
│           ├── deposit_fees.rs     # Accept SOL into fee vault
│           ├── execute_buyback.rs  # SOL → WSOL → Jupiter → Lock
│           └── update_config.rs    # Authority-only param changes
├── keeper/                   # Off-chain automation bot
│   └── src/
│       ├── index.ts          # Main loop with polling + jitter
│       ├── config.ts         # Environment / keypair loading
│       ├── monitor.ts        # On-chain state reads + readiness check
│       └── executor.ts       # Jupiter quote + tx construction
├── dashboard/                # Next.js transparency dashboard
│   └── src/
│       ├── app/page.tsx      # Main page
│       ├── lib/program.ts    # Direct on-chain reads (no backend)
│       └── components/       # Stats panel, progress bar
├── tests/                    # Anchor test suite
│   └── bagscolator.ts
├── Anchor.toml
├── Cargo.toml
└── README.md
```

---

## Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (v1.18+)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) (v0.30.1)
- Node.js 18+
- Yarn or npm

---

## Build & test

```bash
# 1. Install JS dependencies
yarn install

# 2. Build the Anchor program
anchor build

# 3. Get your program ID and update Anchor.toml + lib.rs
anchor keys list
# → copy the ID into Anchor.toml [programs.localnet] and declare_id!() in lib.rs

# 4. Rebuild with correct program ID
anchor build

# 5. Run tests (starts local validator automatically)
anchor test
```

---

## Deploy to devnet

```bash
# Switch to devnet
solana config set --url devnet

# Airdrop for deployment
solana airdrop 5

# Deploy
anchor deploy --provider.cluster devnet

# The program ID is printed. Update Anchor.toml [programs.devnet].
```

After deploying to mainnet and verifying correctness:

```bash
# IRREVERSIBLE — makes the lock vault truly permanent
solana program set-upgrade-authority <PROGRAM_ID> --final
```

---

## Run the keeper

```bash
cd keeper
cp .env.example .env
# Edit .env with your program ID, config address, and keypair path

npm install
npm start
```

The keeper:
1. Polls the fee vault balance every `POLL_INTERVAL_MS`
2. When threshold is met and cooldown has expired, adds random jitter
3. Gets a Jupiter quote for the full vault balance
4. Builds and sends the atomic buyback transaction
5. Logs the result and continues polling

Anyone can run a keeper — the on-chain program doesn't restrict who triggers buybacks.

---

## Run the dashboard

```bash
cd dashboard
cp .env.example .env.local
# Edit with your program ID and config address

npm install
npm run dev
```

The dashboard reads directly from Solana RPC. No backend. No trust.

---

## On-chain instructions

### `initialize`

Creates the Config PDA, fee vault PDA, and lock vault token account for a token mint.

| Param | Type | Description |
|---|---|---|
| `min_buy_threshold` | u64 | Minimum fee vault balance (lamports) before buyback triggers |
| `cooldown_seconds` | i64 | Seconds between buybacks (60–86400) |
| `max_slippage_bps` | u16 | Max acceptable slippage in basis points (1–1000) |

### `deposit_fees`

Transfers SOL from any depositor into the fee vault PDA.

### `execute_buyback`

Atomic buyback: SOL → WSOL → Jupiter CPI → token → lock vault.

Callable by anyone (permissionless crank). Checks:
- Protocol is active
- Vault balance ≥ threshold
- Cooldown has elapsed
- Output ≥ min_output_amount (slippage protection)

### `update_config`

Authority-only. Adjusts threshold, cooldown, slippage, or pause state.

---

## Security model

The permanent lock guarantee comes from two properties:

1. **No withdraw instruction.** The program source has exactly four instructions:
   `initialize`, `deposit_fees`, `execute_buyback`, `update_config`. None of
   them move tokens out of the lock vault.

2. **Immutable program.** After `solana program set-upgrade-authority --final`,
   no one can add a withdraw instruction.

Together: tokens that land in the lock vault are provably irrecoverable.

---

## What to show the founder

1. Working devnet deployment
2. Fee vault accumulating SOL
3. Keeper executing a buyback (Jupiter swap tx on explorer)
4. Lock vault holding tokens (verifiable on-chain)
5. Dashboard showing real-time stats
6. Program source — auditable, no withdraw path

Not a thread. Not a tweet. A demo.
