pragma solidity 0.7.6;
pragma abicoder v2;

import "forge-std/Test.sol";
import "../../../contracts/interface/ILimitOrderBook.sol";
import "../../../contracts/test/TestLimitOrderBook.sol";

contract LimitOrderBook_Signing is Test {
    TestLimitOrderBook limitOrderBook;

    function setUp() public {
        limitOrderBook = new TestLimitOrderBook();
    }

    function testGetOrderStatus_order_neither_filled_nor_cancelled_should_be_unfilled() public {
        bytes32 anyOrderHash = keccak256(abi.encodePacked("0"));
        ILimitOrderBook.OrderStatus orderStatus = limitOrderBook.getOrderStatus(anyOrderHash);
        assertEq(uint(ILimitOrderBook.OrderStatus.Unfilled), uint(orderStatus));
    }

    function testGetOrderHash_hash_bar() public {
        address trader = address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8);
        address baseToken = address(0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6);
        ILimitOrderBook.LimitOrder memory limitOrder = ILimitOrderBook.LimitOrder({
            orderType : ILimitOrderBook.OrderType.LimitOrder,
            salt : uint256(1),
            trader : trader,
            baseToken : baseToken,
            isBaseToQuote : false,
            isExactInput : true,
            amount : 3000e18,
            oppositeAmountBound : 1e18,
            deadline : type(uint256).max,
            sqrtPriceLimitX96 : 0,
            referralCode : bytes32(0x0000000000000000000000000000000000000000000000000000000000000000),
            reduceOnly : false,
            roundIdWhenCreated : uint80(0),
            triggerPrice : uint256(0)
        });

        bytes32 hash1 = limitOrderBook.getOrderHash(limitOrder);
        bytes32 expected = bytes32(0x2469eb8c579088a720fc5d3a5ab17ce786cf8898709f95338714241f122204ef);
        assertEq(expected, hash1);
    }

    function testGetOrderHash_hash_considers_salt() public {
        address trader = address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8);
        address baseToken = address(0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6);
        ILimitOrderBook.LimitOrder memory limitOrder = ILimitOrderBook.LimitOrder({
            orderType : ILimitOrderBook.OrderType.LimitOrder,
            salt : uint256(1),
            trader : trader,
            baseToken : baseToken,
            isBaseToQuote : false,
            isExactInput : true,
            amount : 3000e18,
            oppositeAmountBound : 1e18,
            deadline : type(uint256).max,
            sqrtPriceLimitX96 : 0,
            referralCode : bytes32(0x00),
            reduceOnly : false,
            roundIdWhenCreated : uint80(0),
            triggerPrice : uint256(0)
        });

        ILimitOrderBook.LimitOrder memory limitOrder2 = ILimitOrderBook.LimitOrder({
            orderType : ILimitOrderBook.OrderType.LimitOrder,
            salt : uint256(2),  // the only difference
            trader : trader,
            baseToken : baseToken,
            isBaseToQuote : false,
            isExactInput : true,
            amount : 3000e18,
            oppositeAmountBound : 1e18,
            deadline : type(uint256).max,
            sqrtPriceLimitX96 : 0,
            referralCode : bytes32(0x00),
            reduceOnly : false,
            roundIdWhenCreated : uint80(0),
            triggerPrice : uint256(0)
        });

        bytes32 hash1 = limitOrderBook.getOrderHash(limitOrder);
        bytes32 hash2 = limitOrderBook.getOrderHash(limitOrder2);

        assertTrue(hash1 != hash2);
    }

    function testVerifySigner_sign_limit_order_by_trader_self() public {
        uint256 privateKey = 1;
        address trader = vm.addr(privateKey);
        address baseToken = address(0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6);
        ILimitOrderBook.LimitOrder memory limitOrder = ILimitOrderBook.LimitOrder({
            orderType : ILimitOrderBook.OrderType.LimitOrder,
            salt : uint256(1),
            trader : trader,
            baseToken : baseToken,
            isBaseToQuote : false,
            isExactInput : true,
            amount : 3000e18,
            oppositeAmountBound : 1e18,
            deadline : type(uint256).max,
            sqrtPriceLimitX96 : 0,
            referralCode : bytes32(0x00),
            reduceOnly : false,
            roundIdWhenCreated : uint80(0),
            triggerPrice : uint256(0)
        });

        bytes32 hash1 = limitOrderBook.getOrderHash(limitOrder);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, hash1);

        address signer = limitOrderBook.verifySigner(limitOrder, abi.encodePacked(r,s,v));
        assertEq(signer, trader);
    }

    function testVerifySigner_sign_limit_order_by_non_trader_should_fail() public {
        uint256 privateKey = 1;
        address trader = vm.addr(privateKey);
        address baseToken = address(0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6);
        ILimitOrderBook.LimitOrder memory limitOrder = ILimitOrderBook.LimitOrder({
            orderType : ILimitOrderBook.OrderType.LimitOrder,
            salt : uint256(1),
            trader : trader,
            baseToken : baseToken,
            isBaseToQuote : false,
            isExactInput : true,
            amount : 3000e18,
            oppositeAmountBound : 1e18,
            deadline : type(uint256).max,
            sqrtPriceLimitX96 : 0,
            referralCode : bytes32(0x00),
            reduceOnly : false,
            roundIdWhenCreated : uint80(0),
            triggerPrice : uint256(0)
        });

        bytes32 hash1 = limitOrderBook.getOrderHash(limitOrder);

        uint256 otherPrivateKey = 2;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(otherPrivateKey, hash1);

        vm.expectRevert(bytes("LOB_SINT"));
        limitOrderBook.verifySigner(limitOrder, abi.encodePacked(r,s,v));
    }
}
