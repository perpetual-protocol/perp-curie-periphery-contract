// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import { ECDSAUpgradeable } from "@openzeppelin/contracts-upgradeable/cryptography/ECDSAUpgradeable.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/drafts/EIP712Upgradeable.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";

import { PerpMath } from "@perp/curie-contract/contracts/lib/PerpMath.sol";
import { PerpSafeCast } from "@perp/curie-contract/contracts/lib/PerpSafeCast.sol";
import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";
import { IClearingHouseConfig } from "@perp/curie-contract/contracts/interface/IClearingHouseConfig.sol";
import { IVault } from "@perp/curie-contract/contracts/interface/IVault.sol";
import { IAccountBalance } from "@perp/curie-contract/contracts/interface/IAccountBalance.sol";

import { SafeOwnable } from "../base/SafeOwnable.sol";

import { IOtcMaker } from "../interface/IOtcMaker.sol";
import { ILimitOrderBook } from "../interface/ILimitOrderBook.sol";
import { OtcMakerStorageV1 } from "../storage/OtcMakerStorage.sol";

contract OtcMaker is SafeOwnable, EIP712Upgradeable, IOtcMaker, OtcMakerStorageV1 {
    using PerpMath for int256;
    using PerpMath for uint256;
    using PerpSafeCast for int256;
    using PerpSafeCast for uint256;

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

    function initialize(address clearingHouseArg, address limitOrderBookArg) external initializer {
        __SafeOwnable_init();
        _caller = _msgSender();
        _clearingHouse = clearingHouseArg;
        _limitOrderBook = limitOrderBookArg;
        _vault = IClearingHouse(_clearingHouse).getVault();
        _accountBalance = IClearingHouse(_clearingHouse).getAccountBalance();
    }

    function setCaller(address newCaller) external override onlyOwner {
        // OM_ZA: zero address
        require(newCaller != address(0), "OM_ZA");
        _caller = newCaller;
        emit UpdateCaller(_caller, newCaller);
    }

    function setMarginRatioLimit(uint24 marginRatioLimitArg) external override onlyOwner {
        _marginRatioLimit = marginRatioLimitArg;
    }

    function deposit(address token, uint256 amount) external override onlyOwner {
        SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(token), owner(), address(this), amount);
        IERC20Upgradeable(token).approve(_vault, amount);
        IVault(_vault).deposit(token, amount);
    }

    function openPositionFor(
        ILimitOrderBook.LimitOrder calldata limitOrderParams,
        JitLiquidityParams calldata jitLiquidityParams,
        bytes calldata signature
    ) external override onlyCaller {
        // OM_NLO: not limit order
        require(limitOrderParams.orderType == ILimitOrderBook.OrderType.LimitOrder, "OM_NLO");

        // TODO should we set minBase & minQuote's percentage as a constant in contract?
        IClearingHouse.AddLiquidityResponse memory addLiquidityResponse = IClearingHouse(_clearingHouse).addLiquidity(
            IClearingHouse.AddLiquidityParams({
                baseToken: limitOrderParams.baseToken,
                base: jitLiquidityParams.liquidityBase,
                quote: jitLiquidityParams.liquidityQuote,
                lowerTick: jitLiquidityParams.lowerTick,
                upperTick: jitLiquidityParams.upperTick,
                minBase: FullMath.mulDiv(jitLiquidityParams.liquidityBase, 9, 10),
                minQuote: FullMath.mulDiv(jitLiquidityParams.liquidityQuote, 9, 10),
                useTakerBalance: false,
                deadline: block.timestamp
            })
        );

        ILimitOrderBook(_limitOrderBook).fillLimitOrder(limitOrderParams, signature, 0);

        IClearingHouse(_clearingHouse).removeLiquidity(
            IClearingHouse.RemoveLiquidityParams({
                baseToken: limitOrderParams.baseToken,
                lowerTick: jitLiquidityParams.lowerTick,
                upperTick: jitLiquidityParams.upperTick,
                liquidity: addLiquidityResponse.liquidity.toUint128(),
                minBase: FullMath.mulDiv(jitLiquidityParams.liquidityBase, 9, 10),
                minQuote: FullMath.mulDiv(jitLiquidityParams.liquidityQuote, 9, 10),
                deadline: block.timestamp
            })
        );

        // OM_IM: insufficient margin
        require(isMarginSufficient(), "OM_IM");
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
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), owner(), amount);
    }

    function withdrawToken(address token) external override onlyOwner {
        uint256 amount = IERC20Upgradeable(token).balanceOf(address(this));
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), owner(), amount);
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

    function isMarginSufficient() public view override returns (bool) {
        int256 accountValue_18 = IClearingHouse(_clearingHouse).getAccountValue(address(this));
        int256 marginRequirement = IAccountBalance(_accountBalance)
            .getTotalAbsPositionValue(address(this))
            .mulRatio(_marginRatioLimit)
            .toInt256();
        return accountValue_18 >= marginRequirement;
    }

    //
    // INTERNAL NON-VIEW
    //

    //
    // INTERNAL VIEW
    //

    //
    // INTERNAL PURE
    //
}
