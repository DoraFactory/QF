use solana_program::program_error::ProgramError;
use spl_math::uint::U256;
use std::convert::TryInto;
use std::mem::size_of;

#[repr(C)]
#[derive(Debug)]
pub enum QFInstruction {
    StartRound { ratio: u8 },
    Donate { amount: u64, decimals: u8 },
    RegisterProject,
    InitVoter,
    Vote { amount: u64, decimals: u8 },
    Withdraw,
    EndRound,
    WithdrawFee,
    BanProject { ban_amount: U256 },
}

impl QFInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (&tag, rest) = input
            .split_first()
            .ok_or(ProgramError::InvalidInstructionData)?;
        Ok(match tag {
            0 => {
                let (ratio, _rest) = rest.split_at(1);
                let ratio = ratio
                    .try_into()
                    .ok()
                    .map(u8::from_le_bytes)
                    .ok_or(ProgramError::InvalidInstructionData)?;
                Self::StartRound { ratio }
            }
            1 | 4 => {
                let (amount, rest) = rest.split_at(8);
                let amount = amount
                    .try_into()
                    .ok()
                    .map(u64::from_le_bytes)
                    .ok_or(ProgramError::InvalidInstructionData)?;
                let (&decimals, _rest) = rest
                    .split_first()
                    .ok_or(ProgramError::InvalidInstructionData)?;
                match tag {
                    1 => Self::Donate { amount, decimals },
                    4 => Self::Vote { amount, decimals },
                    _ => unreachable!(),
                }
            }
            2 => Self::RegisterProject,
            3 => Self::InitVoter,
            5 => Self::Withdraw,
            6 => Self::EndRound,
            7 => Self::WithdrawFee,
            8 => {
                let (ban_amount, _rest) = rest.split_at(32);
                let ban_amount = ban_amount
                    .try_into()
                    .ok()
                    .map(U256::from_little_endian)
                    .ok_or(ProgramError::InvalidInstructionData)?;
                Self::BanProject { ban_amount }
            }
            _ => return Err(ProgramError::InvalidInstructionData),
        })
    }

    pub fn pack(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(size_of::<Self>());
        match self {
            Self::StartRound { ratio } => {
                buf.push(0);
                buf.extend_from_slice(&ratio.to_le_bytes());
            }
            &Self::Donate { amount, decimals } => {
                buf.push(1);
                buf.extend_from_slice(&amount.to_le_bytes());
                buf.push(decimals);
            }
            Self::RegisterProject => buf.push(2),
            Self::InitVoter => buf.push(3),
            &Self::Vote { amount, decimals } => {
                buf.push(4);
                buf.extend_from_slice(&amount.to_le_bytes());
                buf.push(decimals);
            }
            Self::Withdraw => buf.push(5),
            Self::EndRound => buf.push(6),
            Self::WithdrawFee => buf.push(7),
            Self::BanProject { ban_amount } => {
                buf.push(8);
                let mut dst: [u8; 32] = [0; 32];
                ban_amount.to_little_endian(&mut dst);
                buf.extend_from_slice(&dst);
            }
        };
        buf
    }
}
