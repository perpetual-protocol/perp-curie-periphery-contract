// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import { ECDSAUpgradeable } from "@openzeppelin/contracts-upgradeable/cryptography/ECDSAUpgradeable.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/drafts/EIP712Upgradeable.sol";

import { PerpMath } from "@perp/curie-contract/contracts/lib/PerpMath.sol";
import { PerpSafeCast } from "@perp/curie-contract/contracts/lib/PerpSafeCast.sol";
import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";
import { IClearingHouseConfig } from "@perp/curie-contract/contracts/interface/IClearingHouseConfig.sol";
import { IVault } from "@perp/curie-contract/contracts/interface/IVault.sol";
import { IAccountBalance } from "@perp/curie-contract/contracts/interface/IAccountBalance.sol";

import { SafeOwnable } from "../base/SafeOwnable.sol";

import { IOtcMaker } from "../interface/IOtcMaker.sol";
import { OtcMakerStorageV1 } from "../storage/OtcMakerStorage.sol";

contract OtcMaker is SafeOwnable, EIP712Upgradeable, IOtcMaker, OtcMakerStorageV1 {
    using PerpMath for uint256;
    using PerpMath for int256;
    using PerpSafeCast for uint256;

    bytes32 public constant OTC_MAKER_TYPEHASH =
        keccak256(
            // solhint-disable-next-line max-line-length
            "OpenPositionForParams(bytes signature,address baseToken,int256 amount,uint256 oppositeAmountBound,uint256 deadline,bytes referralCode,uint256 liquidityBase,uint256 liquidityQuote,int24 upperTick,int24 lowerTick)"
        );

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
        _accountBalance = IClearingHouse(_clearingHouse).getAccountBalance();
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
        _requireMarginSufficient();

        address signer = _obtainSigner(params);

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

    function setMarginRatioLimit(uint24 marginRatioLimitArg) external override onlyOwner {
        _marginRatioLimit = marginRatioLimitArg;
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

    /// @return address signer address
    function _obtainSigner(OpenPositionForParams calldata params) internal view returns (address) {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(OTC_MAKER_TYPEHASH, params)));
        address signer = ECDSAUpgradeable.recover(digest, params.signature);

        return signer;
    }

    function _requireMarginSufficient() internal view {
        // OM_IM: insufficient margin
        require(isMarginSufficient(), "OM_IM");
    }

    //
    // INTERNAL PURE
    //
}
