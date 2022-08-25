use crate::{
    error::QFError,
    instruction::QFInstruction,
    state::{Project, Round, RoundStatus, Voter},
};
use num_traits::FromPrimitive;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    decode_error::DecodeError,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::{PrintProgramError, ProgramError},
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    system_instruction,
    sysvar::{rent::Rent, Sysvar},
};
use spl_math::{
    precise_number::{PreciseNumber, ONE},
    uint::U256,
};

use spl_token;

pub struct Processor {}
impl Processor {
    pub fn process_start_round(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        ratio: u8,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let new_round_info = next_account_info(account_info_iter)?;
        let round_owner_info = next_account_info(account_info_iter)?;
        let vault_info = next_account_info(account_info_iter)?;
        let rent = &Rent::from_account_info(next_account_info(account_info_iter)?)?;

        if new_round_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut round = Round::unpack_unchecked(&new_round_info.data.borrow())?;
        if round.is_initialized() {
            return Err(ProgramError::AccountAlreadyInitialized);
        }

        if new_round_info.data_len() != Round::LEN {
            return Err(ProgramError::InvalidAccountData);
        }

        if !rent.is_exempt(new_round_info.lamports(), Round::LEN) {
            return Err(ProgramError::AccountNotRentExempt);
        }

        let (pda, _) =
            Pubkey::find_program_address(&[&round_owner_info.key.to_bytes()], &program_id);
        let vault = spl_token::state::Account::unpack(&vault_info.data.borrow())?;
        if vault.owner != pda {
            return Err(QFError::OwnerMismatch.into());
        }

        round.status = RoundStatus::Ongoing;
        round.ratio = ratio;
        round.fund = vault.amount;
        round.owner = *round_owner_info.key;
        round.vault = *vault_info.key;
        round.area = U256::zero();

        Round::pack(round, &mut new_round_info.data.borrow_mut())?;
        Ok(())
    }

    pub fn process_donate(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount: u64,
        decimals: u8,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let round_info = next_account_info(account_info_iter)?;
        let from_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let to_info = next_account_info(account_info_iter)?;
        let from_auth_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;

        if round_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut round = Round::unpack(&round_info.data.borrow())?;
        if round.status != RoundStatus::Ongoing {
            return Err(QFError::RoundStatusError.into());
        }

        if to_info.key != &round.vault {
            return Err(QFError::VaultMismatch.into());
        }

        if token_program_info.key != &spl_token::ID {
            return Err(QFError::UnexpectedTokenProgramID.into());
        }

        invoke(
            &spl_token::instruction::transfer_checked(
                &token_program_info.key,
                &from_info.key,
                &mint_info.key,
                &to_info.key,
                &from_auth_info.key,
                &[&from_auth_info.key],
                amount,
                decimals,
            )?,
            &[
                from_info.clone(),
                mint_info.clone(),
                to_info.clone(),
                from_auth_info.clone(),
                token_program_info.clone(),
            ],
        )?;

        round.fund = round.fund.checked_add(amount).unwrap();
        Round::pack(round, &mut round_info.data.borrow_mut())?;

        Ok(())
    }

    pub fn process_register_project(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let new_project_info = next_account_info(account_info_iter)?;
        let round_info = next_account_info(account_info_iter)?;
        let project_owner_info = next_account_info(account_info_iter)?;
        let rent = &Rent::from_account_info(next_account_info(account_info_iter)?)?;

        if round_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut round = Round::unpack(&round_info.data.borrow())?;
        if round.status != RoundStatus::Ongoing {
            return Err(QFError::RoundStatusError.into());
        }

        if new_project_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut project = Project::unpack_unchecked(&new_project_info.data.borrow())?;
        if project.is_initialized() {
            return Err(ProgramError::AccountAlreadyInitialized);
        }

        if new_project_info.data_len() != Project::LEN {
            return Err(ProgramError::InvalidAccountData);
        }

        if !rent.is_exempt(new_project_info.lamports(), Project::LEN) {
            return Err(ProgramError::AccountNotRentExempt);
        }

        project.round = *round_info.key;
        project.owner = *project_owner_info.key;
        project.withdraw = false;
        project.votes = 0;
        project.area = U256::zero();

        round.project_number = round.project_number.checked_add(1).unwrap();
        Round::pack(round, &mut round_info.data.borrow_mut())?;

        Project::pack(project, &mut new_project_info.data.borrow_mut())?;

        Ok(())
    }

    pub fn process_init_voter(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let new_voter_info = next_account_info(account_info_iter)?;
        let voter_token_holder_info = next_account_info(account_info_iter)?;
        let project_info = next_account_info(account_info_iter)?;
        let from_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        let rent = &Rent::from_account_info(next_account_info(account_info_iter)?)?;

        if project_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        Project::unpack(&project_info.data.borrow())?;

        let (_, bump_seed) = Pubkey::find_program_address(
            &[
                &project_info.key.to_bytes(),
                &voter_token_holder_info.key.to_bytes(),
            ],
            &program_id,
        );
        let seeds: &[&[_]] = &[
            &project_info.key.to_bytes(),
            &voter_token_holder_info.key.to_bytes(),
            &[bump_seed],
        ];

        let required_lamports = rent
            .minimum_balance(Voter::LEN)
            .max(1)
            .saturating_sub(new_voter_info.lamports());

        if required_lamports > 0 {
            msg!("Transfer {} lamports to the voter", required_lamports);
            invoke(
                &system_instruction::transfer(
                    &from_info.key,
                    &new_voter_info.key,
                    required_lamports,
                ),
                &[
                    from_info.clone(),
                    new_voter_info.clone(),
                    system_program_info.clone(),
                ],
            )?;
        }

        msg!("Allocate space for the voter");
        invoke_signed(
            &system_instruction::allocate(new_voter_info.key, Voter::LEN as u64),
            &[new_voter_info.clone(), system_program_info.clone()],
            &[&seeds],
        )?;

        msg!("Assign voter to QF Program");
        invoke_signed(
            &system_instruction::assign(new_voter_info.key, &program_id),
            &[new_voter_info.clone(), system_program_info.clone()],
            &[&seeds],
        )?;

        let mut voter = Voter::unpack_unchecked(&new_voter_info.data.borrow())?;
        if voter.is_initialized() {
            return Err(ProgramError::AccountAlreadyInitialized);
        }

        voter.is_initialized = true;
        voter.votes = 0;
        voter.votes_sqrt = U256::from(0);

        Voter::pack(voter, &mut new_voter_info.data.borrow_mut())?;

        Ok(())
    }

    pub fn process_vote(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount: u64,
        decimals: u8,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let round_info = next_account_info(account_info_iter)?;
        let project_info = next_account_info(account_info_iter)?;
        let voter_info = next_account_info(account_info_iter)?;
        let from_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let to_info = next_account_info(account_info_iter)?;
        let from_auth_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;

        if round_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut round = Round::unpack(&round_info.data.borrow())?;
        if round.status != RoundStatus::Ongoing {
            return Err(QFError::RoundStatusError.into());
        }
        if to_info.key != &round.vault {
            return Err(QFError::VaultMismatch.into());
        }

        if project_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut project = Project::unpack(&project_info.data.borrow())?;
        if project.round != *round_info.key {
            return Err(QFError::RoundMismatch.into());
        }

        if voter_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let (expected_key, _) = Pubkey::find_program_address(
            &[&project_info.key.to_bytes(), &from_info.key.to_bytes()],
            &program_id,
        );
        if voter_info.key != &expected_key {
            return Err(QFError::VoterMismatch.into());
        }
        let mut voter = Voter::unpack(&voter_info.data.borrow())?;

        if token_program_info.key != &spl_token::ID {
            return Err(QFError::UnexpectedTokenProgramID.into());
        }

        invoke(
            &spl_token::instruction::transfer_checked(
                &token_program_info.key,
                &from_info.key,
                &mint_info.key,
                &to_info.key,
                &from_auth_info.key,
                &[&from_auth_info.key],
                amount,
                decimals,
            )?,
            &[
                from_info.clone(),
                mint_info.clone(),
                to_info.clone(),
                from_auth_info.clone(),
                token_program_info.clone(),
            ],
        )?;
        round.area = round.area.checked_sub(project.area).unwrap();

        let mut project_area_sqrt = PreciseNumber {
            value: project.area_sqrt,
        };

        let new_votes_sqrt = PreciseNumber {
            value: U256::from(voter.votes.checked_add(amount).unwrap())
                .checked_mul(U256::from(ONE))
                .unwrap(),
        }
        .sqrt()
        .unwrap();

        project_area_sqrt = project_area_sqrt
            .checked_sub(&PreciseNumber {
                value: voter.votes_sqrt,
            })
            .unwrap()
            .checked_add(&new_votes_sqrt)
            .unwrap();
        project.area = project_area_sqrt.checked_pow(1).unwrap().value;

        project.area_sqrt = project_area_sqrt.value;
        project.votes = project.votes.checked_add(amount).unwrap();
        Project::pack(project, &mut project_info.data.borrow_mut())?;

        voter.votes = voter.votes.checked_add(amount).unwrap();
        voter.votes_sqrt = new_votes_sqrt.value;
        Voter::pack(voter, &mut voter_info.data.borrow_mut())?;

        
        let votes = U256::from(project.area).checked_div(U256::from(ONE)).unwrap();

        if votes > round.top_area {
            round.top_area = votes;
        }
        if round.min_area == U256::from(0) || votes < round.min_area {
            round.min_area = votes;
            round.min_area_p = *project_info.key;
        } else if round.min_area_p == *project_info.key {
            round.min_area = votes;
        }

        round.area = round.area.checked_add(project.area).unwrap();
        round.total_area = round.area.checked_div(U256::from(ONE)).unwrap();
        Round::pack(round, &mut round_info.data.borrow_mut())?;

        Ok(())
    }

    pub fn process_withdraw(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let round_info = next_account_info(account_info_iter)?;
        let vault_info = next_account_info(account_info_iter)?;
        let vault_owner_info = next_account_info(account_info_iter)?;
        let project_info = next_account_info(account_info_iter)?;
        let project_owner_info = next_account_info(account_info_iter)?;
        let to_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;

        if round_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut round = Round::unpack(&round_info.data.borrow())?;
        if round.status != RoundStatus::Finished {
            return Err(QFError::RoundStatusError.into());
        }

        if project_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut project = Project::unpack(&project_info.data.borrow())?;
        if project.round != *round_info.key {
            return Err(QFError::RoundMismatch.into());
        }
        if project.withdraw {
            return Err(QFError::ProjectAlreadyWithdraw.into());
        }
        if !project_owner_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
        if project.owner != *project_owner_info.key {
            return Err(QFError::OwnerMismatch.into());
        }

        if token_program_info.key != &spl_token::ID {
            return Err(QFError::UnexpectedTokenProgramID.into());
        }

        let seeds: &[&[_]] = &[
            &round.owner.to_bytes(),
            &[Pubkey::find_program_address(&[&round.owner.to_bytes()], &program_id).1],
        ];


        // ============= begin of cal amount ===============
        let mut votes = U256::from(project.area).checked_div(U256::from(ONE)).unwrap();
        let fund = U256::from(round.fund);
        let mut amount = U256::from(project.votes);
        msg!("votes: {}", amount);
        msg!("amount: {}", amount);
        msg!("fund: {}", fund);
        msg!("totalVotes: {}", round.total_area);
        msg!("project_number: {}", round.project_number);
        msg!("topVotes: {}", round.top_area);
        msg!("minVotes: {}", round.min_area);
        msg!("ratio: {}",round.ratio);

        let ratio = U256::from(round.ratio);
        if round.total_area > U256::from(0) {
            let a = U256::from(
                round
                    .total_area
                    .checked_div(U256::from(round.project_number))
                    .unwrap(),
            );
            let t = round.top_area;
            let m = round.min_area;
            let d = t
                .checked_sub(a)
                .unwrap()
                .checked_add(a.checked_sub(m).unwrap().checked_mul(ratio).unwrap())
                .unwrap();
            msg!("d: {}", d);
            if d > U256::from(0) {
                let s = ratio
                    .checked_sub(U256::from(1))
                    .unwrap()
                    .checked_mul(a)
                    .unwrap()
                    .checked_div(d)
                    .unwrap();
                msg!("s: {}", s);
                if s < U256::from(1) {
                    if votes > a {
                        votes = a
                            .checked_add(s.checked_mul(votes.checked_sub(a).unwrap()).unwrap())
                            .unwrap();
                    } else {
                        votes = votes
                            .checked_add(
                                a.checked_sub(votes)
                                    .unwrap()
                                    .checked_mul(U256::from(1) - s)
                                    .unwrap(),
                            )
                            .unwrap();
                    }
                }
            }
        }

        amount = amount
            .checked_add(
                fund.checked_mul(votes)
                    .unwrap()
                    .checked_div(round.total_area)
                    .unwrap(),
            )
            .unwrap();

        // charge 5% fee
        let fee = amount
            .checked_mul(U256::from(5))
            .unwrap()
            .checked_div(U256::from(100))
            .unwrap();
        let amount = amount.checked_sub(fee).unwrap();
        // ============= end of cal amount ===============

        invoke_signed(
            &spl_token::instruction::transfer(
                &token_program_info.key,
                &vault_info.key,
                &to_info.key,
                &vault_owner_info.key,
                &[&vault_owner_info.key],
                amount.as_u64(),
            )?,
            &[
                vault_info.clone(),
                to_info.clone(),
                vault_owner_info.clone(),
                token_program_info.clone(),
            ],
            &[&seeds],
        )?;

        project.withdraw = true;
        Project::pack(project, &mut project_info.data.borrow_mut())?;

        round.fee = round.fee.checked_add(fee.as_u64()).unwrap();
        Round::pack(round, &mut round_info.data.borrow_mut())?;

        Ok(())
    }

    pub fn process_end_round(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let round_info = next_account_info(account_info_iter)?;
        let owner_info = next_account_info(account_info_iter)?;

        if round_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut round = Round::unpack(&round_info.data.borrow())?;
        if round.status != RoundStatus::Ongoing {
            return Err(QFError::RoundStatusError.into());
        }

        if owner_info.key != &round.owner {
            return Err(QFError::OwnerMismatch.into());
        }
        if !owner_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        round.status = RoundStatus::Finished;
        Round::pack(round, &mut round_info.data.borrow_mut())?;

        Ok(())
    }

    pub fn process_withdraw_fee(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let round_info = next_account_info(account_info_iter)?;
        let owner_info = next_account_info(account_info_iter)?;
        let vault_info = next_account_info(account_info_iter)?;
        let vault_owner_info = next_account_info(account_info_iter)?;
        let to_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;

        if round_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut round = Round::unpack(&round_info.data.borrow())?;
        if round.status != RoundStatus::Finished {
            return Err(QFError::RoundStatusError.into());
        }

        if owner_info.key != &round.owner {
            return Err(QFError::OwnerMismatch.into());
        }
        if !owner_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        if vault_info.key != &round.vault {
            return Err(QFError::VaultMismatch.into());
        }

        if token_program_info.key != &spl_token::ID {
            return Err(QFError::UnexpectedTokenProgramID.into());
        }

        let seeds: &[&[_]] = &[
            &round.owner.to_bytes(),
            &[Pubkey::find_program_address(&[&round.owner.to_bytes()], &program_id).1],
        ];

        invoke_signed(
            &spl_token::instruction::transfer(
                &token_program_info.key,
                &vault_info.key,
                &to_info.key,
                &vault_owner_info.key,
                &[&vault_owner_info.key],
                round.fee,
            )?,
            &[
                vault_info.clone(),
                to_info.clone(),
                vault_owner_info.clone(),
                token_program_info.clone(),
            ],
            &[&seeds],
        )?;

        round.fee = 0;
        Round::pack(round, &mut round_info.data.borrow_mut())?;

        Ok(())
    }

    pub fn process_ban_project(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        ban_amount: U256,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let round_info = next_account_info(account_info_iter)?;
        let owner_info = next_account_info(account_info_iter)?;
        let project_info = next_account_info(account_info_iter)?;

        if round_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut round = Round::unpack(&round_info.data.borrow())?;
        if round.status != RoundStatus::Ongoing {
            return Err(QFError::RoundStatusError.into());
        }

        if owner_info.key != &round.owner {
            return Err(QFError::OwnerMismatch.into());
        }
        if !owner_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        if project_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut project = Project::unpack(&project_info.data.borrow())?;

        project.area = project.area.checked_sub(ban_amount).unwrap();
        project.area_sqrt = PreciseNumber {
            value: project.area.checked_div(U256::from(ONE)).unwrap(),
        }
        .sqrt()
        .unwrap()
        .value
        .checked_mul(U256::from(1000000))
        .unwrap();
        round.area = round.area.checked_sub(ban_amount).unwrap();

        Round::pack(round, &mut round_info.data.borrow_mut())?;
        Project::pack(project, &mut project_info.data.borrow_mut())?;

        Ok(())
    }

    /// Processes an [Instruction](enum.Instruction.html).
    pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
        let instruction = QFInstruction::unpack(input)?;
        match instruction {
            QFInstruction::StartRound { ratio } => {
                msg!("Instruction: StartRound");
                Self::process_start_round(program_id, accounts, ratio)
            }
            QFInstruction::Donate { amount, decimals } => {
                msg!("Instruction: Donate");
                Self::process_donate(program_id, accounts, amount, decimals)
            }
            QFInstruction::RegisterProject => {
                msg!("Instruction: RegisterProject");
                Self::process_register_project(program_id, accounts)
            }
            QFInstruction::InitVoter => {
                msg!("Instruction: InitVoter");
                Self::process_init_voter(program_id, accounts)
            }
            QFInstruction::Vote { amount, decimals } => {
                msg!("Instruction: Vote");
                Self::process_vote(program_id, accounts, amount, decimals)
            }
            QFInstruction::Withdraw => {
                msg!("Instruction: Withdraw");
                Self::process_withdraw(program_id, accounts)
            }
            QFInstruction::EndRound => {
                msg!("Instruction: EndRound");
                Self::process_end_round(program_id, accounts)
            }
            QFInstruction::WithdrawFee => {
                msg!("Instruction: WithdrawFee");
                Self::process_withdraw_fee(program_id, accounts)
            }
            QFInstruction::BanProject { ban_amount } => {
                msg!("Instruction: BanProject");
                Self::process_ban_project(program_id, accounts, ban_amount)
            }
        }
    }
}

impl PrintProgramError for QFError {
    fn print<E>(&self)
    where
        E: 'static + std::error::Error + DecodeError<E> + PrintProgramError + FromPrimitive,
    {
        match self {
            QFError::OwnerMismatch => msg!("owner mismatch"),
            QFError::RoundStatusError => msg!("round status does not expected"),
            QFError::VaultMismatch => msg!("vault does not match"),
            QFError::RoundMismatch => msg!("round does not match"),
            QFError::ProjectAlreadyWithdraw => msg!("project has already withdraw"),
            QFError::UnexpectedTokenProgramID => msg!("unexpected token program id"),
            QFError::VoterMismatch => msg!("voter mismatch"),
        }
    }
}
