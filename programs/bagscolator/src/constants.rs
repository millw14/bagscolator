pub const CONFIG_SEED: &[u8] = b"config";
pub const FEE_VAULT_SEED: &[u8] = b"fee_vault";
pub const LOCK_VAULT_SEED: &[u8] = b"lock_vault";

pub const MAX_SLIPPAGE_BPS: u16 = 1000; // 10%
pub const MIN_COOLDOWN_SECONDS: i64 = 60;
pub const MAX_COOLDOWN_SECONDS: i64 = 86_400; // 24h
pub const MIN_BUY_THRESHOLD: u64 = 10_000_000; // 0.01 SOL
