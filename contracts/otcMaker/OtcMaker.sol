// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { ECDSAUpgradeable } from "@openzeppelin/contracts-upgradeable/cryptography/ECDSAUpgradeable.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/drafts/EIP712Upgradeable.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";

import { PerpMath } from "@perp/curie-contract/contracts/lib/PerpMath.sol";
import { PerpSafeCast } from "@perp/curie-contract/contracts/lib/PerpSafeCast.sol";
import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";
import { IClearingHouseConfig } from "@perp/curie-contract/contracts/interface/IClearingHouseConfig.sol";
import { IVault } from "@perp/curie-contract/contracts/interface/IVault.sol";
import { IAccountBalance } from "@perp/curie-contract/contracts/interface/IAccountBalance.sol";
import { AccountMarket } from "@perp/curie-contract/contracts/lib/AccountMarket.sol";

import { SafeOwnable } from "../base/SafeOwnable.sol";

import { IMerkleRedeem } from "../interface/IMerkleRedeem.sol";
import { IOtcMaker } from "../interface/IOtcMaker.sol";
import { ILimitOrderBook } from "../interface/ILimitOrderBook.sol";
import { OtcMakerStorageV2 } from "../storage/OtcMakerStorage.sol";

contract OtcMaker is SafeOwnable, EIP712Upgradeable, IOtcMaker, OtcMakerStorageV2 {
    using SignedSafeMathUpgradeable for int256;
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

    modifier onlyFundOwner() {
        // OM_NFO: not fund owner
        require(_msgSender() == _fundOwner, "OM_NFO");
        _;
    }

    modifier onlyPositionManager() {
        // OM_NPM: not position manager
        require(_msgSender() == _positionManager, "OM_NPM");
        _;
    }

    //
    // EXTERNAL NON-VIEW
    //

    function initialize(address clearingHouseArg, address limitOrderBookArg) external initializer {
        __SafeOwnable_init();
        _caller = _msgSender();
        _fundOwner = _msgSender();
        _positionManager = _msgSender();
        _clearingHouse = clearingHouseArg;
        _limitOrderBook = limitOrderBookArg;
        _vault = IClearingHouse(_clearingHouse).getVault();
        _accountBalance = IClearingHouse(_clearingHouse).getAccountBalance();
    }

    function setCaller(address newCaller) external onlyOwner {
        _requireNonZeroAddress(newCaller);
        address oldCaller = _caller;
        _caller = newCaller;
        emit CallerUpdated(oldCaller, newCaller);
    }

    function setFundOwner(address newFundOwner) external onlyOwner {
        _requireNonZeroAddress(newFundOwner);
        address oldFundOwner = _fundOwner;
        _fundOwner = newFundOwner;
        emit FundOwnerUpdated(oldFundOwner, newFundOwner);
    }

    function setPositionManager(address newPositionManager) external onlyOwner {
        _requireNonZeroAddress(newPositionManager);
        address oldPositionManager = _positionManager;
        _positionManager = newPositionManager;
        emit PositionManagerUpdated(oldPositionManager, newPositionManager);
    }

    function setMarginRatioLimit(uint24 marginRatioLimitArg) external onlyOwner {
        uint24 mmRatio = IClearingHouseConfig(IClearingHouse(_clearingHouse).getClearingHouseConfig()).getMmRatio();
        require(marginRatioLimitArg > mmRatio && marginRatioLimitArg < 1000000, "OM_IMR");
        _marginRatioLimit = marginRatioLimitArg;
    }

    function deposit(address token, uint256 amount) external override onlyFundOwner {
        SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(token), _fundOwner, address(this), amount);
        IERC20Upgradeable(token).approve(_vault, amount);
        IVault(_vault).deposit(token, amount);
    }

    function openPositionFor(
        ILimitOrderBook.LimitOrder calldata limitOrderParams,
        JitLiquidityParams calldata jitLiquidityParams,
        bytes calldata signature
    ) external override onlyCaller returns (OpenPositionForResponse memory) {
        // OM_NLO: not limit order
        require(limitOrderParams.orderType == ILimitOrderBook.OrderType.LimitOrder, "OM_NLO");

        // IAccountBalance -> get before takerPositionSize, takerPositionNotional
        AccountMarket.Info memory accountInfoBefore = IAccountBalance(_accountBalance).getAccountInfo(
            address(this),
            limitOrderParams.baseToken
        );

        // TODO should we set minBase & minQuote's percentage as a constant in contract?
        IClearingHouse.AddLiquidityResponse memory addLiquidityResponse = IClearingHouse(_clearingHouse).addLiquidity(
            IClearingHouse.AddLiquidityParams({
                baseToken: limitOrderParams.baseToken,
                base: jitLiquidityParams.liquidityBase,
                quote: jitLiquidityParams.liquidityQuote,
                lowerTick: jitLiquidityParams.lowerTick,
                upperTick: jitLiquidityParams.upperTick,
                minBase: jitLiquidityParams.minLiquidityBase,
                minQuote: jitLiquidityParams.minLiquidityQuote,
                useTakerBalance: false,
                deadline: block.timestamp
            })
        );

        // TODO check if we should add a new order type like ILimitOrderBook.OrderType.LimitOrder
        // roundIdWhenTriggered should be 0, since we will only send OrderType.LimitOrder
        ILimitOrderBook(_limitOrderBook).fillLimitOrder(limitOrderParams, signature, 0);

        IClearingHouse(_clearingHouse).removeLiquidity(
            IClearingHouse.RemoveLiquidityParams({
                baseToken: limitOrderParams.baseToken,
                lowerTick: jitLiquidityParams.lowerTick,
                upperTick: jitLiquidityParams.upperTick,
                liquidity: addLiquidityResponse.liquidity.toUint128(),
                minBase: 0,
                minQuote: 0,
                deadline: block.timestamp
            })
        );

        // OM_IM: insufficient margin
        require(isMarginSufficient(), "OM_IM");

        // IAccountBalance -> get after takerPositionSize, takerPositionNotional
        AccountMarket.Info memory accountInfoAfter = IAccountBalance(_accountBalance).getAccountInfo(
            address(this),
            limitOrderParams.baseToken
        );
        return
            OpenPositionForResponse({
                exchangedPositionSize: accountInfoAfter.takerPositionSize.sub(accountInfoBefore.takerPositionSize),
                exchangedPositionNotional: accountInfoAfter.takerOpenNotional.sub(accountInfoBefore.takerOpenNotional)
            });
    }

    function openPosition(IClearingHouse.OpenPositionParams calldata params)
        external
        override
        onlyPositionManager
        returns (uint256 base, uint256 quote)
    {
        return IClearingHouse(_clearingHouse).openPosition(params);
    }

    function withdraw(address token, uint256 amount) external override onlyFundOwner {
        IVault(_vault).withdraw(token, amount);
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), _fundOwner, amount);
    }

    function withdrawToken(address token) external override onlyFundOwner {
        uint256 amount = IERC20Upgradeable(token).balanceOf(address(this));
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), _fundOwner, amount);
    }

    function claimWeek(
        address merkleRedeem,
        address liquidityProvider,
        uint256 week,
        uint256 claimedBalance,
        bytes32[] calldata merkleProof
    ) external override onlyFundOwner {
        IMerkleRedeem(merkleRedeem).claimWeek(liquidityProvider, week, claimedBalance, merkleProof);
    }

    //
    // EXTERNAL VIEW
    //

    function getCaller() external view override returns (address) {
        return _caller;
    }

    function getFundOwner() external view override returns (address) {
        return _fundOwner;
    }

    function getPositionManager() external view override returns (address) {
        return _positionManager;
    }

    function getClearingHouse() external view override returns (address) {
        return _clearingHouse;
    }

    function getLimitOrderBook() external view override returns (address) {
        return _limitOrderBook;
    }

    function getMarginRatioLimit() external view override returns (uint24) {
        return _marginRatioLimit;
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

    function _requireNonZeroAddress(address addressArg) internal pure {
        // OM_ZA: zero address
        require(addressArg != address(0), "OM_ZA");
    }
}
