use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed};
use anchor_spl::token::{self, CloseAccount, SyncNative, Token, TokenAccount};

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// Anyone can crank this — the keeper is just the tx payer, not a privileged role.
#[derive(Accounts)]
pub struct ExecuteBuyback<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.token_mint.as_ref(), config.authority.as_ref()],
        bump = config.config_bump,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: System-owned PDA holding accumulated SOL fees.
    #[account(
        mut,
        seeds = [FEE_VAULT_SEED, config.key().as_ref()],
        bump = config.fee_vault_bump,
    )]
    pub fee_vault: UncheckedAccount<'info>,

    /// The WSOL ATA owned by fee_vault PDA.  Created by the keeper in a preceding
    /// instruction (createAssociatedTokenAccountIdempotent) within the same tx.
    /// Closed at the end of this instruction — rent refunded to keeper.
    /// CHECK: Validated against expected ATA derivation in handler.
    #[account(mut)]
    pub fee_vault_wsol: UncheckedAccount<'info>,

    /// CHECK: PDA authority for the lock vault token account.
    #[account(
        seeds = [LOCK_VAULT_SEED, config.key().as_ref()],
        bump = config.lock_vault_bump,
    )]
    pub lock_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = config.token_mint,
        associated_token::authority = lock_vault_authority,
    )]
    pub lock_vault_token_account: Account<'info, TokenAccount>,

    /// CHECK: Jupiter v6 program — address validated at call-site by the keeper
    /// constructing the correct route.  Remaining accounts carry the full
    /// Jupiter route account set.
    pub jupiter_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, ExecuteBuyback<'info>>,
    swap_data: Vec<u8>,
    min_output_amount: u64,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let clock = Clock::get()?;

    // ── gate checks ──────────────────────────────────────────────────
    require!(config.is_active, BagscolatorError::ProgramNotActive);

    let vault_lamports = ctx.accounts.fee_vault.lamports();
    require!(
        vault_lamports >= config.min_buy_threshold,
        BagscolatorError::ThresholdNotMet
    );

    if config.last_buyback_timestamp > 0 {
        let next_allowed = config
            .last_buyback_timestamp
            .checked_add(config.cooldown_seconds)
            .ok_or(BagscolatorError::ArithmeticOverflow)?;
        require!(
            clock.unix_timestamp >= next_allowed,
            BagscolatorError::CooldownNotExpired
        );
    }

    // ── validate WSOL account ────────────────────────────────────────
    let expected_wsol = anchor_spl::associated_token::get_associated_token_address(
        &ctx.accounts.fee_vault.key(),
        &anchor_spl::token::spl_token::native_mint::id(),
    );
    require_keys_eq!(
        ctx.accounts.fee_vault_wsol.key(),
        expected_wsol,
        BagscolatorError::InvalidWsolAccount
    );

    let pre_balance = ctx.accounts.lock_vault_token_account.amount;

    // ── transfer SOL → WSOL account ──────────────────────────────────
    let config_key = ctx.accounts.config.key();
    let fee_vault_seeds: &[&[u8]] = &[
        FEE_VAULT_SEED,
        config_key.as_ref(),
        &[config.fee_vault_bump],
    ];

    invoke_signed(
        &anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.fee_vault.key(),
            &ctx.accounts.fee_vault_wsol.key(),
            vault_lamports,
        ),
        &[
            ctx.accounts.fee_vault.to_account_info(),
            ctx.accounts.fee_vault_wsol.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[fee_vault_seeds],
    )?;

    // sync_native so the token-program balance reflects the new lamports
    token::sync_native(CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        SyncNative {
            account: ctx.accounts.fee_vault_wsol.to_account_info(),
        },
    ))?;

    // ── CPI → Jupiter v6 ────────────────────────────────────────────
    let mut jup_account_infos = Vec::with_capacity(ctx.remaining_accounts.len());
    let mut jup_account_metas = Vec::with_capacity(ctx.remaining_accounts.len());

    for acc in ctx.remaining_accounts.iter() {
        let is_signer = acc.key() == ctx.accounts.fee_vault.key();
        jup_account_metas.push(if acc.is_writable {
            AccountMeta::new(acc.key(), is_signer)
        } else {
            AccountMeta::new_readonly(acc.key(), is_signer)
        });
        jup_account_infos.push(acc.to_account_info());
    }

    invoke_signed(
        &Instruction {
            program_id: ctx.accounts.jupiter_program.key(),
            accounts: jup_account_metas,
            data: swap_data,
        },
        &jup_account_infos,
        &[fee_vault_seeds],
    )?;

    // ── verify output ────────────────────────────────────────────────
    ctx.accounts.lock_vault_token_account.reload()?;
    let tokens_received = ctx
        .accounts
        .lock_vault_token_account
        .amount
        .checked_sub(pre_balance)
        .ok_or(BagscolatorError::ArithmeticOverflow)?;

    require!(tokens_received > 0, BagscolatorError::NoTokensReceived);
    require!(
        tokens_received >= min_output_amount,
        BagscolatorError::SlippageExceeded
    );

    // ── close WSOL account — rent back to keeper ─────────────────────
    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.fee_vault_wsol.to_account_info(),
            destination: ctx.accounts.keeper.to_account_info(),
            authority: ctx.accounts.fee_vault.to_account_info(),
        },
        &[fee_vault_seeds],
    ))?;

    // ── update metrics ───────────────────────────────────────────────
    let config = &mut ctx.accounts.config;
    config.total_sol_spent = config
        .total_sol_spent
        .checked_add(vault_lamports)
        .ok_or(BagscolatorError::ArithmeticOverflow)?;
    config.total_tokens_bought = config
        .total_tokens_bought
        .checked_add(tokens_received)
        .ok_or(BagscolatorError::ArithmeticOverflow)?;
    config.total_tokens_locked = config
        .total_tokens_locked
        .checked_add(tokens_received)
        .ok_or(BagscolatorError::ArithmeticOverflow)?;
    config.last_buyback_timestamp = clock.unix_timestamp;
    config.buyback_count = config
        .buyback_count
        .checked_add(1)
        .ok_or(BagscolatorError::ArithmeticOverflow)?;

    emit!(BuybackExecuted {
        sol_spent: vault_lamports,
        tokens_received,
        timestamp: clock.unix_timestamp,
        buyback_number: config.buyback_count,
        token_mint: config.token_mint,
    });

    Ok(())
}
