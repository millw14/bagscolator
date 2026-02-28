use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.token_mint.as_ref(), config.authority.as_ref()],
        bump = config.config_bump,
        has_one = authority,
    )]
    pub config: Account<'info, Config>,
}

pub fn handler(
    ctx: Context<UpdateConfig>,
    new_threshold: Option<u64>,
    new_cooldown: Option<i64>,
    new_slippage: Option<u16>,
    new_active: Option<bool>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(t) = new_threshold {
        require!(t >= MIN_BUY_THRESHOLD, BagscolatorError::InvalidThreshold);
        config.min_buy_threshold = t;
    }
    if let Some(c) = new_cooldown {
        require!(
            (MIN_COOLDOWN_SECONDS..=MAX_COOLDOWN_SECONDS).contains(&c),
            BagscolatorError::InvalidCooldown
        );
        config.cooldown_seconds = c;
    }
    if let Some(s) = new_slippage {
        require!(
            s > 0 && s <= MAX_SLIPPAGE_BPS,
            BagscolatorError::InvalidSlippage
        );
        config.max_slippage_bps = s;
    }
    if let Some(a) = new_active {
        config.is_active = a;
    }

    emit!(ConfigUpdated {
        authority: config.authority,
        min_buy_threshold: config.min_buy_threshold,
        cooldown_seconds: config.cooldown_seconds,
        max_slippage_bps: config.max_slippage_bps,
        is_active: config.is_active,
    });

    Ok(())
}
