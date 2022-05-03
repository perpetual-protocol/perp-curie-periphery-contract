// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { BlockContext } from "../base/BlockContext.sol";
import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { PerpMath } from "@perp/curie-contract/contracts/lib/PerpMath.sol";
import { ILimitOrderFeeVault } from "../interface/ILimitOrderFeeVault.sol";
import { OwnerPausable } from "../base/OwnerPausable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
// solhint-disable-next-line max-line-length
import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

contract LimitOrderFeeVault is ILimitOrderFeeVault, BlockContext, ReentrancyGuardUpgradeable, OwnerPausable {
    using AddressUpgradeable for address;
    using PerpMath for int256;
    using PerpMath for uint256;
    using SignedSafeMathUpgradeable for int256;

    // TODO: put these state variables into StorageV1
    // TODO: add setters
    address public rewardToken;
    address public limitOrderBook;
    uint256 public feeAmount;

    modifier onlyLimitOrderBook() {
        // LOFV_SMBLOB: Sender Must Be LimitOrderBook
        require(_msgSender() == limitOrderBook, "LOFV_SMBLOB");
        _;
    }

    function initialize(address rewardTokenArg, uint256 feeAmountArg) external initializer {
        __OwnerPausable_init();
        __ReentrancyGuard_init();

        // LOFV_RTINC: RewardToken Is Not a Contract
        require(rewardTokenArg.isContract(), "LOFV_RTINC");
        rewardToken = rewardTokenArg;

        // LOFV_FAMBGT0: FeeAmount Must Be Greater Than 0
        require(feeAmountArg > 0, "LOFV_FAMBGT0");
        feeAmount = feeAmountArg;
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

    function setFeeAmount(uint256 feeAmountArg) external onlyOwner {
        // LOFV_FAMBGT0: FeeAmount Must Be Greater Than 0
        require(feeAmountArg > 0, "LOFV_FAMBGT0");
        feeAmount = feeAmountArg;
        emit FeeAmountChanged(feeAmountArg);
    }

    function disburse(address keeper, uint256 orderValue)
        external
        override
        onlyLimitOrderBook
        nonReentrant
        returns (uint256)
    {
        // TODO: be aware of decimal issue when we use different reward token

        // LOFV_NEBTD: not enough balance to disburse
        require(IERC20Upgradeable(rewardToken).balanceOf(address(this)) >= feeAmount, "LOFV_NEBTD");

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(rewardToken), keeper, feeAmount);

        emit Disbursed(keeper, feeAmount);

        return feeAmount;
    }

    // TODO: should we support multiple token to withdraw? or only support rewardToken?
    function withdraw(address token, uint256 amount) external override onlyOwner nonReentrant {
        // LOFV_WTMBRT: Withdrawn Token Must Be RewardToken
        require(token == rewardToken, "LOFV_WTMBRT");

        address to = _msgSender();

        // LOFV_NEBTW: not enough balance to withdraw
        require(IERC20Upgradeable(token).balanceOf(address(this)) >= amount, "LOFV_NEBTW");

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), to, amount);

        emit Withdrawn(to, token, amount);
    }
}
