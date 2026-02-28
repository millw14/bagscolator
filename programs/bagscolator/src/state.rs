use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub min_buy_threshold: u64,
    pub cooldown_seconds: i64,
    pub max_slippage_bps: u16,
    pub total_sol_spent: u64,
    pub total_tokens_bought: u64,
    pub total_tokens_locked: u64,
    pub last_buyback_timestamp: i64,
    pub buyback_count: u64,
    pub is_active: bool,
    pub config_bump: u8,
    pub fee_vault_bump: u8,
    pub lock_vault_bump: u8,
}

#[event]
pub struct BuybackExecuted {
    pub sol_spent: u64,
    pub tokens_received: u64,
    pub timestamp: i64,
    pub buyback_number: u64,
    pub token_mint: Pubkey,
}

#[event]
pub struct FeesDeposited {
    pub amount: u64,
    pub depositor: Pubkey,
    pub new_balance: u64,
}

#[event]
pub struct ConfigUpdated {
    pub authority: Pubkey,
    pub min_buy_threshold: u64,
    pub cooldown_seconds: i64,
    pub max_slippage_bps: u16,
    pub is_active: bool,
}
