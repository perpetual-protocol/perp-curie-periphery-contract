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
import { OwnerPausable } from "../base/OwnerPausable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";
import { IAccountBalance } from "@perp/curie-contract/contracts/interface/IAccountBalance.sol";

contract LimitOrderBook is ILimitOrderBook, BlockContext, ReentrancyGuardUpgradeable, OwnerPausable, EIP712Upgradeable {
    using AddressUpgradeable for address;
    using PerpMath for int256;
    using PerpMath for uint256;
    using SignedSafeMathUpgradeable for int256;

    enum OrderStatus {
        Unfilled, // this is the default value
        Filled,
        Cancelled
    }

    // solhint-disable-next-line func-name-mixedcase
    bytes32 public LIMIT_ORDER_TYPEHASH =
        keccak256(
            // solhint-disable-next-line max-line-length
            "LimitOrder(uint256 salt,address trader,address baseToken,bool isBaseToQuote,bool isExactInput,uint256 amount,uint256 oppositeAmountBound,uint256 deadline,bool reduceOnly)"
        );

    // TODO: refactor the following state variable into LimitOrderStorage
    mapping(bytes32 => OrderStatus) private _ordersStatus;

    address public clearingHouse;
    address public accountBalance;

    //
    // EXTERNAL NON-VIEW
    //

    function initialize(
        string memory name,
        string memory version,
        address clearingHouseArg
    ) external initializer {
        __ReentrancyGuard_init();
        __OwnerPausable_init();
        __EIP712_init(name, version); // ex: "PerpCurieLimitOrder" and "1"
        // LOB_CHINC : ClearingHouse Is Not Contract
        require(clearingHouseArg.isContract(), "LOB_CHINC");
        clearingHouse = clearingHouseArg;
        accountBalance = IClearingHouse(clearingHouse).getAccountBalance();
    }

    /// @param signature a EIP712 signature, generated from `eth_signTypedData_v4`
    function fillLimitOrder(LimitOrder memory order, bytes memory signature) external override nonReentrant {
        bytes32 orderHash = getOrderHash(order);
        verifySigner(order, signature);

        // LOB_OIFA: Order is filled already
        require(_ordersStatus[orderHash] != OrderStatus.Filled, "LOB_OIFA");
        // LOB_OIC: Order is cancelled
        require(_ordersStatus[orderHash] != OrderStatus.Cancelled, "LOB_OIC");

        int256 oldTakerPositionSize = IAccountBalance(accountBalance).getTakerPositionSize(
            order.trader,
            order.baseToken
        );

        IClearingHouse(clearingHouse).openPositionFor(
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
            // LOB_TINR : this it not reduceOnly
            require(
                oldTakerPositionSize.mul(newTakerPositionSize) > 0 &&
                    oldTakerPositionSize.abs() > newTakerPositionSize.abs(),
                "LOB_TINR"
            );
        }

        _ordersStatus[orderHash] = OrderStatus.Filled;
        // TODO: this require another vault contract to disburse
        // distributeKeeperFee();
        emit LimitOrderFilled(
            order.trader,
            order.baseToken,
            orderHash,
            _msgSender(), // keeper
            0 // keeperFee, TODO: revisit this after finish distributeKeeperFee
        );
    }

    function cancelLimitOrder(LimitOrder memory order) external override {
        // LOB_OSMBS: Order's Signer Must Be Sender
        require(_msgSender() == order.trader, "LOB_OSMBS");
        bytes32 orderHash = getOrderHash(order);
        _ordersStatus[orderHash] = OrderStatus.Cancelled;
        emit LimitOrderCancelled(order.trader, order.baseToken, orderHash);
    }

    //
    // PUBLIC VIEW
    //

    function getOrderHash(LimitOrder memory order) public view override returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(LIMIT_ORDER_TYPEHASH, order)));
    }

    function verifySigner(LimitOrder memory order, bytes memory signature) public view override returns (address) {
        bytes32 orderHash = getOrderHash(order);
        address signer = ECDSAUpgradeable.recover(orderHash, signature);

        // LOB_SNET: signer is not trader
        require(signer == order.trader, "LOB_SINT");

        return signer;
    }
}
