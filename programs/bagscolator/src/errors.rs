use anchor_lang::prelude::*;

#[error_code]
pub enum BagscolatorError {
    #[msg("Fee vault balance is below the minimum buyback threshold")]
    ThresholdNotMet,

    #[msg("Cooldown period has not expired since the last buyback")]
    CooldownNotExpired,

    #[msg("No tokens were received from the swap")]
    NoTokensReceived,

    #[msg("Output amount is below the minimum acceptable (slippage exceeded)")]
    SlippageExceeded,

    #[msg("Program is currently paused")]
    ProgramNotActive,

    #[msg("Threshold must be >= 0.01 SOL")]
    InvalidThreshold,

    #[msg("Cooldown must be between 60s and 86400s")]
    InvalidCooldown,

    #[msg("Slippage must be between 1 and 1000 bps")]
    InvalidSlippage,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("WSOL account address does not match expected ATA")]
    InvalidWsolAccount,
}
