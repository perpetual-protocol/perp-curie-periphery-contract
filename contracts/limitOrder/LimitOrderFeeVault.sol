// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { BlockContext } from "../base/BlockContext.sol";
import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { PerpMath } from "@perp/curie-contract/contracts/lib/PerpMath.sol";
import { ILimitOrderFeeVault } from "../interface/ILimitOrderFeeVault.sol";
import { LimitOrderFeeVaultStorageV1 } from "../storage/LimitOrderFeeVaultStorage.sol";
import { OwnerPausable } from "../base/OwnerPausable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
// solhint-disable-next-line max-line-length
import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

contract LimitOrderFeeVault is
    ILimitOrderFeeVault,
    BlockContext,
    ReentrancyGuardUpgradeable,
    OwnerPausable,
    LimitOrderFeeVaultStorageV1
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

        // LOFV_RAMBGT0: RewardAmount Must Be Greater Than 0
        require(rewardAmountArg > 0, "LOFV_RAMBGT0");
        rewardAmount = rewardAmountArg;
    }

    function setRewardToken(address rewardTokenArg) external onlyOwner {
        // LOFV_RTINC: RewardToken Is Not a Contract
        require(rewardTokenArg.isContract(), "LOFV_RTINC");
        rewardToken = rewardTokenArg;
        emit RewardTokenChanged(rewardTokenArg);
    }

    function setLimitOrderBook(address limitOrderBookArg) external onlyOwner {
        // LOFV_LOBINC: LimitOrderBook Is Not a Contract
        require(limitOrderBookArg.isContract(), "LOFV_LOBINC");
        limitOrderBook = limitOrderBookArg;
        emit LimitOrderBookChanged(limitOrderBookArg);
    }

    function setRewardAmount(uint256 rewardAmountArg) external onlyOwner {
        // LOFV_RAMBGT0: RewardAmount Must Be Greater Than 0
        require(rewardAmountArg > 0, "LOFV_RAMBGT0");
        rewardAmount = rewardAmountArg;
        emit RewardAmountChanged(rewardAmountArg);
    }

    // TODO: handle decimal issue if we use different rewardTokens (PERP or USDC)
    function disburse(address keeper) external override onlyLimitOrderBook nonReentrant returns (uint256) {
        uint256 normalizedRewardAmount = IERC20Upgradeable(rewardToken).balanceOf(address(this)) >= rewardAmount
            ? rewardAmount
            : 0;

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(rewardToken), keeper, normalizedRewardAmount);

        emit Disbursed(keeper, normalizedRewardAmount);

        return normalizedRewardAmount;
    }

    function withdraw(uint256 amount) external override onlyOwner nonReentrant {
        address owner = owner();

        // LOFV_NEBTW: Not Enough Balance to Withdraw
        require(IERC20Upgradeable(rewardToken).balanceOf(address(this)) >= amount, "LOFV_NEBTW");

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(rewardToken), owner, amount);

        emit Withdrawn(owner, rewardToken, amount);
    }
}
