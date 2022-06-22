// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { BlockContext } from "../base/BlockContext.sol";
import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { PerpMath } from "@perp/curie-contract/contracts/lib/PerpMath.sol";
import { ILimitOrderRewardVault } from "../interface/ILimitOrderRewardVault.sol";
import { LimitOrderRewardVaultStorageV1 } from "../storage/LimitOrderRewardVaultStorage.sol";
import { OwnerPausable } from "../base/OwnerPausable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
// solhint-disable-next-line max-line-length
import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

contract LimitOrderRewardVault is
    ILimitOrderRewardVault,
    BlockContext,
    ReentrancyGuardUpgradeable,
    OwnerPausable,
    LimitOrderRewardVaultStorageV1
{
    using AddressUpgradeable for address;
    using PerpMath for int256;
    using PerpMath for uint256;
    using SignedSafeMathUpgradeable for int256;

    modifier onlyLimitOrderBook() {
        // LOFV_SMBLOB: Sender Must Be LimitOrderBook
        require(_msgSender() == limitOrderBook, "LOFV_SMBLOB");
        _;
    }

    function initialize(address rewardTokenArg, uint256 rewardAmountArg) external initializer {
        __OwnerPausable_init();
        __ReentrancyGuard_init();

        // LOFV_RTINC: RewardToken Is Not a Contract
        require(rewardTokenArg.isContract(), "LOFV_RTINC");
        rewardToken = rewardTokenArg;

        rewardAmount = rewardAmountArg;
    }

    // TODO: any better way to verify the rewardAmount is correct?
    // to prevent something like sending 1 ETH as reward
    function setRewardTokenAndAmount(address rewardTokenArg, uint256 rewardAmountArg) external onlyOwner {
        // LOFV_RTINC: RewardToken Is Not a Contract
        require(rewardTokenArg.isContract(), "LOFV_RTINC");
        rewardToken = rewardTokenArg;

        rewardAmount = rewardAmountArg;

        emit RewardTokenAndAmountChanged(rewardTokenArg, rewardAmountArg);
    }

    /// @dev limitOrderBook cannot be set in initializer since LimitOrderBook also depends on LimitOrderRewardVault
    function setLimitOrderBook(address limitOrderBookArg) external onlyOwner {
        // LOFV_LOBINC: LimitOrderBook Is Not a Contract
        require(limitOrderBookArg.isContract(), "LOFV_LOBINC");
        limitOrderBook = limitOrderBookArg;
        emit LimitOrderBookChanged(limitOrderBookArg);
    }

    function disburse(address keeper, bytes32 orderHash)
        external
        override
        onlyLimitOrderBook
        nonReentrant
        returns (uint256)
    {
        if (rewardAmount == 0) {
            return 0;
        }

        // NOTE: we don't revert if rewardToken balance is not enough to disburse
        // instead, log event then we can send the reward afterwards
        // so it won't block filling limit orders
        if (IERC20Upgradeable(rewardToken).balanceOf(address(this)) < rewardAmount) {
            emit Undisbursed(orderHash, keeper, rewardAmount);
            return 0;
        }

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(rewardToken), keeper, rewardAmount);

        emit Disbursed(orderHash, keeper, rewardToken, rewardAmount);

        return rewardAmount;
    }

    function withdraw(uint256 amount) external override onlyOwner nonReentrant {
        address owner = owner();

        // LOFV_NEBTW: Not Enough Balance To Withdraw
        require(IERC20Upgradeable(rewardToken).balanceOf(address(this)) >= amount, "LOFV_NEBTW");

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(rewardToken), owner, amount);

        emit Withdrawn(owner, rewardToken, amount);
    }
}
