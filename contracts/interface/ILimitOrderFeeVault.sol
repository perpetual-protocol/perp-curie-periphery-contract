// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

interface ILimitOrderFeeVault {
    function disburse(address keeper, uint256 orderValue) external returns (uint256);

    function withdraw(address token, uint256 amount) external;

    event RewardTokenChanged(address rewardToken);

    event LimitOrderBookChanged(address limitOrderBook);

    event FeeAmountChanged(uint256 feeAmount);

    event Disbursed(address keeper, uint256 amount);

    event Withdrawn(address to, address token, uint256 amount);
}
