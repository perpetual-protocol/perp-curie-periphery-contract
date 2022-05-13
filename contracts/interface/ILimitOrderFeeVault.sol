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
    /// @param rewardAmount The new rewardAmount
    event RewardAmountChanged(uint256 rewardAmount);

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
    function disburse(address keeper) external returns (uint256);

    /// @param amount The amount of rewardToken to withdraw
    function withdraw(uint256 amount) external;
}
