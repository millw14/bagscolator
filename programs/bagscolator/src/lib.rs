use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

// Replace after `anchor keys list`
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod bagscolator {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        min_buy_threshold: u64,
        cooldown_seconds: i64,
        max_slippage_bps: u16,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, min_buy_threshold, cooldown_seconds, max_slippage_bps)
    }

    pub fn deposit_fees(ctx: Context<DepositFees>, amount: u64) -> Result<()> {
        instructions::deposit_fees::handler(ctx, amount)
    }

    pub fn execute_buyback<'info>(
        ctx: Context<'_, '_, '_, 'info, ExecuteBuyback<'info>>,
        swap_data: Vec<u8>,
        min_output_amount: u64,
    ) -> Result<()> {
        instructions::execute_buyback::handler(ctx, swap_data, min_output_amount)
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_threshold: Option<u64>,
        new_cooldown: Option<i64>,
        new_slippage: Option<u16>,
        new_active: Option<bool>,
    ) -> Result<()> {
        instructions::update_config::handler(
            ctx,
            new_threshold,
            new_cooldown,
            new_slippage,
            new_active,
        )
    }
}
