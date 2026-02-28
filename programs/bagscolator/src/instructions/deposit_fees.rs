use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::*;
use crate::state::*;

#[derive(Accounts)]
pub struct DepositFees<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.token_mint.as_ref(), config.authority.as_ref()],
        bump = config.config_bump,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: System-owned PDA, validated by seeds.
    #[account(
        mut,
        seeds = [FEE_VAULT_SEED, config.key().as_ref()],
        bump = config.fee_vault_bump,
    )]
    pub fee_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositFees>, amount: u64) -> Result<()> {
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.depositor.to_account_info(),
                to: ctx.accounts.fee_vault.to_account_info(),
            },
        ),
        amount,
    )?;

    let new_balance = ctx.accounts.fee_vault.lamports();

    emit!(FeesDeposited {
        amount,
        depositor: ctx.accounts.depositor.key(),
        new_balance,
    });

    Ok(())
}
