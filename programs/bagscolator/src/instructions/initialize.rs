use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED, token_mint.key().as_ref(), authority.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: System-owned PDA that accumulates SOL fees.
    /// Never initialized as a program account — holds only native lamports.
    #[account(
        mut,
        seeds = [FEE_VAULT_SEED, config.key().as_ref()],
        bump,
    )]
    pub fee_vault: UncheckedAccount<'info>,

    /// CHECK: PDA used solely as the signing authority for the lock vault token account.
    #[account(
        seeds = [LOCK_VAULT_SEED, config.key().as_ref()],
        bump,
    )]
    pub lock_vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        associated_token::mint = token_mint,
        associated_token::authority = lock_vault_authority,
    )]
    pub lock_vault_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(
    ctx: Context<Initialize>,
    min_buy_threshold: u64,
    cooldown_seconds: i64,
    max_slippage_bps: u16,
) -> Result<()> {
    require!(
        min_buy_threshold >= MIN_BUY_THRESHOLD,
        BagscolatorError::InvalidThreshold
    );
    require!(
        (MIN_COOLDOWN_SECONDS..=MAX_COOLDOWN_SECONDS).contains(&cooldown_seconds),
        BagscolatorError::InvalidCooldown
    );
    require!(
        max_slippage_bps > 0 && max_slippage_bps <= MAX_SLIPPAGE_BPS,
        BagscolatorError::InvalidSlippage
    );

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.token_mint = ctx.accounts.token_mint.key();
    config.min_buy_threshold = min_buy_threshold;
    config.cooldown_seconds = cooldown_seconds;
    config.max_slippage_bps = max_slippage_bps;
    config.total_sol_spent = 0;
    config.total_tokens_bought = 0;
    config.total_tokens_locked = 0;
    config.last_buyback_timestamp = 0;
    config.buyback_count = 0;
    config.is_active = true;
    config.config_bump = ctx.bumps.config;
    config.fee_vault_bump = ctx.bumps.fee_vault;
    config.lock_vault_bump = ctx.bumps.lock_vault_authority;

    Ok(())
}
