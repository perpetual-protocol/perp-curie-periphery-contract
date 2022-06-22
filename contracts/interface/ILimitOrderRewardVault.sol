// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

interface ILimitOrderRewardVault {
    /// @notice Emitted when rewardToken and rewardAmount are changed
    /// @param rewardToken The new address of rewardToken
    /// @param rewardAmount The new rewardAmount
    event RewardTokenAndAmountChanged(address rewardToken, uint256 rewardAmount);

    /// @notice Emitted when limitOrderBook is changed
    /// @param limitOrderBook The new address of limitOrderBook
    event LimitOrderBookChanged(address limitOrderBook);

    /// @notice Emitted when keeper reward is disbursed
    /// @param orderHash The hash of the limit order
    /// @param keeper The address of keeper
    /// @param token The rewardToken
    /// @param amount The reward to keeper
    event Disbursed(bytes32 orderHash, address keeper, address token, uint256 amount);

    /// @notice Emitted when rewardToken balance is not enough to disburse
    /// @param orderHash The hash of the limit order
    /// @param keeper The address of keeper
    /// @param token The rewardToken
    /// @param amount The reward to keeper
    event Undisbursed(bytes32 orderHash, address keeper, address token, uint256 amount);

    /// @notice Emitted when token is withdrawn
    /// @param to The address of who withdrawn the token
    /// @param token The address of token withdrawn
    /// @param amount The amount of token withdrawn
    event Withdrawn(address to, address token, uint256 amount);

    /// @param keeper The address of keeper
    /// @param orderHash The hash of the limit order
    function disburse(address keeper, bytes32 orderHash) external returns (uint256);

    /// @param amount The amount of rewardToken to withdraw
    function withdraw(uint256 amount) external;
}
