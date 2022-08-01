# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.1] - 2022-08-01

### Removed

- Remove `DelegatableVault`

## [1.4.0] - 2022-07-05

### Added

- Add `LimitOrderBook` for filling limit orders
- Add `LimitOrderRewardVault` for distribute keeper rewards for limit orders

## [1.3.5] - 2022-03-18

### Added

- Add `PerpPortal.getAccountLeverage()`

### Changed

- Change the license to `GPL-3.0-or-later`.

## [1.3.4] - 2022-02-17

### Deployed

- Deploy a new `Quoter` on Optimism

## [1.3.3] - 2022-01-26

### Deployed

- Deploy a new `DelegatableVaultMaker` with `withdrawToken()` on **Optimism**

## [1.3.3-staging] - 2022-01-24

### Deployed

- Deploy a new `DelegatableVaultMaker` with `withdrawToken()` on **Optimism Kovan**

## [1.3.2-staging] - 2022-01-07

### Deployed

- Deploy a new DelegatableVaultMaker on **Optimism Kovan** based on `@perp/curie-contract#1.0.7`

## [1.3.1] - 2022-01-05

### Deployed

- Deploy a new `PerpPortal` contract on **Optimism Kovan** based on `@perp/curie-contract#1.0.6`.
- Deploy a new `Quoter` contract on **Optimism Kovan** based on `@perp/curie-contract#1.0.6`.

## [1.3.0] - 2022-01-03

### Deployed

- Code is same as `1.3.0-staging` and deploy `DelegateVault` contract to **Optimism**

## [1.3.0-staging] - 2021-12-22

### Added

- Add `DelegatableVault.setRewardContractAddress()` to set reward contract address in white list.
- Add `DelegatableVault.claimWeek()` to claim reward for one week from the specific reward contract.
- Add `DelegatableVault.claimWeeks()` to claim reward for multiple weeks from the specific reward contract.

### Deployed

- Upgrade `DelegatableVaultMaker` contract on **Optimism Kovan**.

## [1.2.0] - 2021-12-13

- Code is same as `1.2.0-staging` and deploy `PerpPortal` contract to **Optimism**

## [1.2.0-staging] - 2021-12-09

- Add multiple view function for `PerpPortal` contract

## [1.1.0] - 2021-12-08

- Support multiple instance of `DelegateableVault`
- Deploy a new `DelegatableVaultMaker` contract on **Optimism**.
- Deploy a new `PerpPortal` contract on **Optimism**.

## [1.1.0-staging] - 2021-11-30

- Deploy a new `DelegatableVaultMaker` contract on **Optimism Kovan**.
- Deploy a new `PerpPortal` contract on **Optimism Kovan**.

## [1.0.2] - 2021-11-27

- Deploy a new `Quoter` contract on **Optimism** based on `@perp/curie-contract#1.0.2`.
- Deploy a new `Multicall2` contract on **Optimism**.

## [1.0.2-staging] - 2021-11-27

- Deploy a new `Quoter` contract on **Optimism Kovan** based on `@perp/curie-contract#1.0.2-staging`.
- Deploy a new `Multicall2` contract on **Optimism Kovan**.

## [1.0.1] - 2021-11-25

- Deploy a new `Quoter` contract on **Optimism** based on `@perp/curie-contract#1.0.1`.
- Deploy a new `Multicall2` contract on **Optimism**.

## [1.0.0] - 2021-11-24

- Deploy a new `Quoter` contract on **Optimism** based on `@perp/curie-contract#1.0.0`.
- Deploy a new `Multicall2` contract on **Optimism**.

## [1.0.0-staging] - 2021-11-24

- Deploy a new `Quoter` contract based on `@perp/curie-contract#1.0.0-staging`.
- Deploy a new `Multicall2` contract.
- The above contracts are deployed to both of **Optimism Kovan** and **Arbitrum Rinkeby**.

## [0.15.0-staging] - 2021-11-23

- Deploy a new `Quoter` contract on **Optimism Kovan** based on `@perp/curie-contract#0.15.1-staging`.
- Deploy a new `Multicall2` contract on **Optimism Kovan**.

## [0.14.0-staging] - 2021-11-17

- Deploy a new `Quoter` contract on **Optimism Kovan** based on `@perp/curie-contract#0.14.0-staging`.
- Deploy a new `Multicall2` contract on **Optimism Kovan**.

## [0.13.1-staging] - 2021-11-17

- Add `LowLevelErrorMessage.sol`
- Re-deploy `Quoter` contract based on `@perp/curie-contract#0.13.3-staging`
- Re-deploy `Multicall2` contract
- The above contracts are deployed to **Arbitrum Rinkeby** only

## [0.13.0-staging] - 2021-11-10

### Added

- Deploy a new `Quoter` contract based on `@perp/curie-contract#0.13.0-staging`
- Deploy a new `Multicall2` contract
- The above contracts are deployed to **Arbitrum Rinkeby** only
