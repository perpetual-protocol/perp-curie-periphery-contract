// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { BlockContext } from "../base/BlockContext.sol";
import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { ECDSAUpgradeable } from "@openzeppelin/contracts-upgradeable/cryptography/ECDSAUpgradeable.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/drafts/EIP712Upgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { PerpMath } from "@perp/curie-contract/contracts/lib/PerpMath.sol";
import { ILimitOrderBook } from "../interface/ILimitOrderBook.sol";
import { ILimitOrderFeeVault } from "../interface/ILimitOrderFeeVault.sol";
import { LimitOrderBookStorageV1 } from "../storage/LimitOrderBookStorage.sol";
import { OwnerPausable } from "../base/OwnerPausable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";
import { IAccountBalance } from "@perp/curie-contract/contracts/interface/IAccountBalance.sol";

contract LimitOrderBook is
    ILimitOrderBook,
    BlockContext,
    ReentrancyGuardUpgradeable,
    OwnerPausable,
    EIP712Upgradeable,
    LimitOrderBookStorageV1
{
    using AddressUpgradeable for address;
    using PerpMath for int256;
    using PerpMath for uint256;
    using SignedSafeMathUpgradeable for int256;

    // NOTE: cannot use `OrderType orderType` here, use `uint256 orderType` instead
    // solhint-disable-next-line func-name-mixedcase
    bytes32 public constant LIMIT_ORDER_TYPEHASH =
        keccak256(
            // solhint-disable-next-line max-line-length
            "LimitOrder(uint256 orderType,uint256 salt,address trader,address baseToken,bool isBaseToQuote,bool isExactInput,uint256 amount,uint256 oppositeAmountBound,uint256 deadline,bool reduceOnly,uint80 roundIdWhenCreated,uint256 triggerPrice)"
        );

    //
    // EXTERNAL NON-VIEW
    //

    function initialize(
        string memory name,
        string memory version,
        address clearingHouseArg,
        address limitOrderFeeVaultArg
    ) external initializer {
        __ReentrancyGuard_init();
        __OwnerPausable_init();
        __EIP712_init(name, version); // ex: "PerpCurieLimitOrder" and "1"

        // LOB_CHINC : ClearingHouse Is Not Contract
        require(clearingHouseArg.isContract(), "LOB_CHINC");
        clearingHouse = clearingHouseArg;

        // LOB_ABINC : AccountBalance Is Not Contract
        address accountBalanceArg = IClearingHouse(clearingHouse).getAccountBalance();
        require(accountBalanceArg.isContract(), "LOB_ABINC");
        accountBalance = accountBalanceArg;

        // LOB_LOFVINC : LimitOrderFeeVault Is Not Contract
        require(limitOrderFeeVaultArg.isContract(), "LOB_LOFVINC");
        limitOrderFeeVault = limitOrderFeeVaultArg;
    }

    function setClearingHouse(address clearingHouseArg) external onlyOwner {
        // LOB_CHINC: ClearingHouse Is Not a Contract
        require(clearingHouseArg.isContract(), "LOB_CHINC");
        clearingHouse = clearingHouseArg;
        accountBalance = IClearingHouse(clearingHouse).getAccountBalance();

        emit ClearingHouseChanged(clearingHouseArg);
    }

    function setLimitOrderFeeVault(address limitOrderFeeVaultArg) external onlyOwner {
        // LOB_LOFVINC: LimitOrderFeeVault Is Not a Contract
        require(limitOrderFeeVaultArg.isContract(), "LOB_LOFVINC");
        limitOrderFeeVault = limitOrderFeeVaultArg;

        emit LimitOrderFeeVaultChanged(limitOrderFeeVaultArg);
    }

    /// @inheritdoc ILimitOrderBook
    function fillLimitOrder(
        LimitOrder memory order,
        bytes memory signature,
        uint80 roundIdWhenTriggered
    ) external override nonReentrant {
        bytes32 orderHash = getOrderHash(order);
        verifySigner(order, signature);

        // TODO: support StopLimitOrder in the future
        // LOB_OSLO: Only Support LimitOrder
        require(order.orderType == ILimitOrderBook.OrderType.LimitOrder, "LOB_OSLO");

        // LOB_OMBU: Order Must Be Unfilled
        require(_ordersStatus[orderHash] == ILimitOrderBook.OrderStatus.Unfilled, "LOB_OMBU");

        int256 oldTakerPositionSize = IAccountBalance(accountBalance).getTakerPositionSize(
            order.trader,
            order.baseToken
        );

        (uint256 base, uint256 quote) = IClearingHouse(clearingHouse).openPositionFor(
            order.trader,
            IClearingHouse.OpenPositionParams({
                baseToken: order.baseToken,
                isBaseToQuote: order.isBaseToQuote,
                isExactInput: order.isExactInput,
                amount: order.amount,
                oppositeAmountBound: order.oppositeAmountBound,
                deadline: order.deadline,
                sqrtPriceLimitX96: 0,
                referralCode: ""
            })
        );

        int256 newTakerPositionSize = IAccountBalance(accountBalance).getTakerPositionSize(
            order.trader,
            order.baseToken
        );

        if (order.reduceOnly) {
            // LOB_NRO: Not ReduceOnly
            require(
                oldTakerPositionSize.mul(newTakerPositionSize) > 0 &&
                    oldTakerPositionSize.abs() > newTakerPositionSize.abs(),
                "LOB_NRO"
            );
        }

        _ordersStatus[orderHash] = ILimitOrderBook.OrderStatus.Filled;

        address keeper = _msgSender();
        uint256 keeperFee = ILimitOrderFeeVault(limitOrderFeeVault).disburse(keeper, quote);

        emit LimitOrderFilled(order.trader, order.baseToken, orderHash, keeper, keeperFee);
    }

    /// @inheritdoc ILimitOrderBook
    function cancelLimitOrder(LimitOrder memory order) external override {
        // LOB_OSMBS: Order's Signer Must Be Sender
        require(_msgSender() == order.trader, "LOB_OSMBS");

        // we didn't require `signature` as input like fillLimitOrder(),
        // so trader can actually cancel an order that is not existed
        bytes32 orderHash = getOrderHash(order);
        _ordersStatus[orderHash] = ILimitOrderBook.OrderStatus.Cancelled;

        emit LimitOrderCancelled(order.trader, order.baseToken, orderHash);
    }

    //
    // PUBLIC VIEW
    //

    function getOrderHash(LimitOrder memory order) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(LIMIT_ORDER_TYPEHASH, order)));
    }

    function verifySigner(LimitOrder memory order, bytes memory signature) public view returns (address) {
        bytes32 orderHash = getOrderHash(order);
        address signer = ECDSAUpgradeable.recover(orderHash, signature);

        // LOB_SINT: Signer Is Not Trader
        require(signer == order.trader, "LOB_SINT");

        return signer;
    }
}
