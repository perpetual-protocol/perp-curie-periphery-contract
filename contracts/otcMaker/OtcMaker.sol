// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/drafts/EIP712Upgradeable.sol";

import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";
import { IClearingHouseConfig } from "@perp/curie-contract/contracts/interface/IClearingHouseConfig.sol";
import { IVault } from "@perp/curie-contract/contracts/interface/IVault.sol";

import { SafeOwnable } from "../base/SafeOwnable.sol";

import { IOtcMaker } from "../interface/IOtcMaker.sol";
import { OtcMakerStorageV1 } from "../storage/OtcMakerStorage.sol";

contract OtcMaker is SafeOwnable, EIP712Upgradeable, IOtcMaker, OtcMakerStorageV1 {
    //
    // MODIFIER
    //
    modifier onlyCaller() {
        // OM_NC: not caller
        require(_msgSender() == _caller, "OM_NC");
        _;
    }

    //
    // EXTERNAL NON-VIEW
    //

    function initialize(address clearingHouseArg) external initializer {
        __SafeOwnable_init();
        _caller = _msgSender();
        _clearingHouse = clearingHouseArg;
        _vault = IClearingHouse(_clearingHouse).getVault();
    }

    function setCaller(address newCaller) external override onlyOwner {
        // OM_ZA: zero address
        require(newCaller != address(0), "OM_ZA");
        _caller = newCaller;
        emit UpdateCaller(_caller, newCaller);
    }

    function deposit(address token, uint256 amount) external override onlyOwner {
        SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(token), owner(), address(this), amount);
        IERC20Upgradeable(token).approve(_vault, amount);
        IVault(_vault).deposit(token, amount);
    }

    // TODO onlyCaller
    function openPositionFor(OpenPositionForParams calldata params)
        external
        override
        onlyCaller
        returns (uint256 base, uint256 quote)
    {
        // _verifySigner()

        // _checkMarginLimit()

        // addLiquidity()
        //     AddLiquidityParams{
        //         address baseToken;
        //         uint256 base;
        //         uint256 quote;
        //         int24 lowerTick;
        //         int24 upperTick;
        //         uint256 minBase;
        //         uint256 minQuote;
        //         bool useTakerBalance;
        //         uint256 deadline;
        //     }
        //     { liquidity } = return struct AddLiquidityResponse {
        //         uint256 base;
        //         uint256 quote;
        //         uint256 fee;
        //         uint256 liquidity;
        //     }

        // openPositionFor()
        //     address trader
        //     struct OpenPositionParams {
        //         address baseToken;
        //         bool isBaseToQuote;
        //         bool isExactInput;
        //         uint256 amount;
        //         uint256 oppositeAmountBound;
        //         uint256 deadline;
        //         uint160 sqrtPriceLimitX96;
        //         bytes32 referralCode;
        //     }

        // removeLiquidity()
        //     RemoveLiquidityParams {
        //         address baseToken;
        //         int24 lowerTick;
        //         int24 upperTick;
        //         uint128 liquidity;
        //         uint256 minBase;
        //         uint256 minQuote;
        //         uint256 deadline;
        //     }

        revert();
    }

    // TODO onlyCaller -> emergency margin adjustment to manage OtcMaker's margin ratio
    function openPosition(OpenPositionParams calldata params)
        external
        override
        onlyOwner
        returns (uint256 base, uint256 quote)
    {
        revert();
    }

    function withdraw(address token, uint256 amount) external override onlyOwner {
        IVault(_vault).withdraw(token, amount);
        SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(token), _caller, address(this), amount);
    }

    function withdrawToken(address token) external override onlyOwner {
        revert();
    }

    function claimWeek(
        address merkleRedeem,
        address liquidityProvider,
        uint256 week,
        uint256 claimedBalance,
        bytes32[] calldata _merkleProof
    ) external override onlyOwner {
        revert();
    }

    function setMarginRatioLimit(uint24 openMarginRatioLimitArg) external override onlyOwner {
        revert();
    }

    //
    // EXTERNAL VIEW
    //

    function getCaller() external view override returns (address) {
        return _caller;
    }

    //
    // PUBLIC NON-VIEW
    //

    //
    // PUBLIC VIEW
    //

    //
    // INTERNAL NON-VIEW
    //

    //
    // INTERNAL VIEW
    //

    /// @return address signer address
    /// @return bytes32 hash of openPositionFor
    function _verifySigner(OpenPositionForParams calldata params, bytes memory signature)
        internal
        view
        returns (address, bytes32)
    {}

    function _checkMarginLimit() internal view returns (bool) {}

    //
    // INTERNAL PURE
    //
}
