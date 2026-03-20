# Post-Deployment Checklist - Elysium

**Status:** NOT APPLICABLE — PROJECT FILES MISSING

This document provides step-by-step verification tasks to perform after deploying the Elysium governance system to a testnet or mainnet. Since the smart contracts are not available, this checklist is a template that must be completed with actual contract addresses, function selectors, and parameter values.

## Pre-Flight Checks (Before Deployment)

- [ ] Ensure deployer account has sufficient testnet ETH for gas
- [ ] Verify all signer private keys are securely available (for multisig timelock, if used)
- [ ] Confirm network RPC endpoint is reliable (e.g., Alchemy/Infura)
- [ ] Review deployment parameters (governance token cap, voting delay, quorum percentages, etc.)
- [ ] Prepare environment file with private keys and RPC URLs
- [ ] Ensure `cast` or `forge` is installed and working

## Deployment Steps

1. **Compile contracts**
   ```bash
   forge build
   ```

2. **Run tests**
   ```bash
   forge test -vv
   ```

3. **Run fuzzing/invariant (if applicable)**
   ```bash
   forge fuzz --runs=1000
   forge invariant --runs=1000
   ```

4. **Deploy script execution**
   ```bash
   forge script script/DeployAll.s.sol:DeployAll --rpc-url <RPC> --private-key <KEY> --broadcast
   ```
   - [ ] Monitor for transaction confirmations
   - [ ] Record deployed contract addresses in a secure location
   - [ ] Verify each constructor completed successfully

5. **Verify role grants**
   - [ ] Check that ADMIN, GUARDIAN, and other roles are assigned to intended addresses
   - [ ] Confirm timelock contract has correct delay (e.g., 2 days)
   - [ ] Ensure no address retains DEFAULT_ADMIN_ROLE unnecessarily

6. **Initial parameter configuration**
   - [ ] Set voting delay, period, and quorum values via proposals
   - [ ] Initialize token minting if applicable (or verify initial distribution)
   - [ ] Configure merit grant parameters (amounts, vesting)
   - [ ] Set citizenship jury size and selection parameters

7. **Batch mint initial token holders (if using MintSigners)**
   ```bash
   forge script script/MintSigners.s.sol:MintSigners --private-key <MINTER_KEY> --broadcast
   ```

## Post-Deployment Verification

### On-Chain Checks

- [ ] **Governance token**: Verify total supply and initial allocations (team, treasury, community, etc.)
- [ ] **Governor contract**: Proposal creation, voting, and queueing functions work
- [ ] **Timelock**: Execution delay is enforced, cancellations work
- [ ] **Voting power**: Token holders have correct voting weight
- [ ] **AI vote caps**: If implemented, verify AI addresses cannot exceed cap
- [ ] **Citizenship jury**: Random selection mechanism functions, jurors can be summoned
- [ ] **Identity challenge**: Challenge process executes, challenged identities are suspended
- [ ] **Verifier integration**: External verifier can mark identities as verified
- [ ] **Merit grants**: Grant claims pay out correctly and vesting schedule is enforced
- [ ] **Tier system**: Different user tiers have appropriate voting power multipliers
- [ ] **H3 safeguards**: Any anti-whale or anti-concentration features work

### Functional Tests

- [ ] **Small test proposal**: Submit a trivial proposal (e.g., set a parameter) and run through full voting cycle
- [ ] **Fast-forward time**: Use `evm_increaseTime` to test timelock expiration
- [ ] **Edge case voting**: Test voting with exactly quorum, exactly threshold, and just missing both
- [ ] **Emergency pause**: If a pause function exists, verify it can be triggered by guardian and prevents state changes
- [ ] **Upgradeability (if proxy)**: Verify that upgrade functions are restricted to Timelock/DAO

### Monitoring (First 24h)

- [ ] Check for any unexpected events or reverts in transaction logs
- [ ] Monitor gas costs of common operations (proposal creation, vote, execution)
- [ ] Verify no unintended token transfers or frozen balances
- [ ] Confirm that the initial community is active and can interact

## Emergency Procedures

- **Pause the system**: Guardian role should call `pause()` (if implemented)
- **Cancel a malicious proposal**: Timelock admin (or DAO) can cancel proposals in queue
- **Upgrade contracts**: Follow upgrade process via Timelock with DAO vote
- **Revert a bad deployment**: If using a proxy, deploy a fixed implementation and upgrade; if immutable, plan a migration

---

## Signature

This checklist must be completed by the deployment team before declaring the testnet (or mainnet) launch successful. Any failed items should be documented with remediation steps.
