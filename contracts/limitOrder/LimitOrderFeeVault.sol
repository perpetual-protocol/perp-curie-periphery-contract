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

    // TODO: refactor these state variable into Storage
    address internal _rewardToken;
    address internal _limitOrderBook;

    //
    // CONSTANT
    //

    uint256 internal constant _FEE_AMOUNT = 1;

    modifier onlyLimitOrderBook() {
        // LOFV_SMBLOB : sender must be LimitOrderBook
        require(_msgSender() == _limitOrderBook, "LOFV_SMBLOB");
        _;
    }

    function initialize(address rewardTokenArg) external initializer {
        __OwnerPausable_init();
        __ReentrancyGuard_init();

        // LOFV_RTINC: rewardToken is not a contract
        require(rewardTokenArg.isContract(), "LOFV_RTINC");
        _rewardToken = rewardTokenArg;
    }

    function setRewardToken(address rewardTokenArg) external onlyOwner {
        // LOFV_RTINC: rewardToken is not a contract
        require(rewardTokenArg.isContract(), "LOFV_RTINC");
        _rewardToken = rewardTokenArg;
    }

    function setLimitOrderBook(address limitOrderBookArg) external onlyOwner {
        // LOFV_LOBINC: LimitOrderBook is not a contract
        require(limitOrderBookArg.isContract(), "LOFV_LOBINC");
        _limitOrderBook = limitOrderBookArg;
    }

    function disburse(address keeper, uint256 orderValue) external override onlyLimitOrderBook returns (uint256) {
        // TODO: be aware of decimal issue when we use different reward token

        // LOFV_NEBTD: not enough balance to disburse
        require(IERC20Upgradeable(_rewardToken).balanceOf(address(this)) >= _FEE_AMOUNT, "LOFV_NEBTD");

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(_rewardToken), keeper, _FEE_AMOUNT);
        // TODO: emit event

        return _FEE_AMOUNT;
    }

    function withdraw(address token, uint256 amount) external override onlyOwner {
        // LOFV_NEBTW: not enough balance to withdraw
        require(IERC20Upgradeable(token).balanceOf(address(this)) >= amount, "LOFV_NEBTW");
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), _msgSender(), amount);
        // TODO: emit event
    }
}
