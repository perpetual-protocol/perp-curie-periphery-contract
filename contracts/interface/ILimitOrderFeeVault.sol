// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

interface ILimitOrderFeeVault {
    /// @notice Emitted when rewardToken is changed
    /// @param rewardToken The new address of rewardToken
    event RewardTokenChanged(address rewardToken);

    /// @notice Emitted when limitOrderBook is changed
    /// @param limitOrderBook The new address of limitOrderBook
    event LimitOrderBookChanged(address limitOrderBook);

    /// @notice Emitted when feeAmount is changed
    /// @param feeAmount The new feeAmount
    event FeeAmountChanged(uint256 feeAmount);

    /// @notice Emitted when keeper fee is disbursed
    /// @param keeper The address of keeper
    /// @param amount The fee reward to keeper
    event Disbursed(address keeper, uint256 amount);

    /// @notice Emitted when token is withdrawn
    /// @param to The address of who withdrawn the token
    /// @param token The address of token withdrawn
    /// @param amount The amount of token withdrawn
    event Withdrawn(address to, address token, uint256 amount);

    /// @param keeper The address of keeper
    /// @param orderValue The order value (in USD) of the order
    function disburse(address keeper, uint256 orderValue) external returns (uint256);

    /// @param amount The amount of rewardToken to withdraw
    function withdraw(uint256 amount) external;
}
