pragma solidity 0.7.6;

import "../../contracts/test/TestERC20.sol";
import "../../contracts/limitOrder/LimitOrderRewardVault.sol";
import "forge-std/Test.sol";
import "../../contracts/test/TestLimitOrderBook.sol";

contract LimitOrderRewardVaultTest is Test {
    LimitOrderRewardVault limitOrderRewardVault;
    address constant nonOwnerAddress = address(0x1234);
    event RewardTokenChanged(address rewardToken);
    event LimitOrderBookChanged(address limitOrderBook);
    event RewardAmountChanged(uint256 rewardAmount);

    function setUp() public {
        TestERC20 rewardToken1 = new TestERC20();
        rewardToken1.__TestERC20_init("TestPERP-1", "PERP-1", 18);

        limitOrderRewardVault = new LimitOrderRewardVault();
        limitOrderRewardVault.initialize(address(rewardToken1), 10**18);
    }
    function testSetRewardToken_able_to_set_reward_token() public {
        TestERC20 rewardToken2 = new TestERC20();
        rewardToken2.__TestERC20_init("TestPERP-2", "PERP-2", 18);

        limitOrderRewardVault.setRewardToken(address(rewardToken2));

        assertEq(address(rewardToken2), limitOrderRewardVault.rewardToken());
    }

    function testSetRewardToken_should_emit_event() public {
        TestERC20 rewardToken2 = new TestERC20();
        rewardToken2.__TestERC20_init("TestPERP-2", "PERP-2", 18);

        vm.expectEmit(false, false, false, true);
        emit RewardTokenChanged(address(rewardToken2));
        limitOrderRewardVault.setRewardToken(address(rewardToken2));
    }

    function testSetRewardToken_unable_to_set_non_contract_address() public {
        vm.expectRevert(bytes("LOFV_RTINC"));
        limitOrderRewardVault.setRewardToken(address(0));
    }

    function testSetRewardToken_only_able_to_set_by_owner() public {
        vm.expectRevert(bytes("SO_CNO"));
        vm.prank(nonOwnerAddress);
        limitOrderRewardVault.setRewardToken(address(0));
    }

    function testSetLimitOrderBook_able_to_set_limitOrderBook() public {
        LimitOrderBook limitOrderBook = new TestLimitOrderBook();
        limitOrderRewardVault.setLimitOrderBook(address(limitOrderBook));
        assertEq(address(limitOrderBook), limitOrderRewardVault.limitOrderBook());
    }

    function testSetLimitOrderBook_should_emit_event() public {
        LimitOrderBook limitOrderBook = new TestLimitOrderBook();
        limitOrderRewardVault.setLimitOrderBook(address(limitOrderBook));

        vm.expectEmit(false, false, false, true);
        emit LimitOrderBookChanged(address(limitOrderBook));
        limitOrderRewardVault.setLimitOrderBook(address(limitOrderBook));
    }

    function testSetLimitOrderBook_unable_to_set_non_contract_address() public {
        vm.expectRevert(bytes("LOFV_LOBINC"));
        limitOrderRewardVault.setLimitOrderBook(address(0));
    }

    function testSetLimitOrderBook_only_able_to_set_by_owner() public {
        vm.expectRevert(bytes("SO_CNO"));
        vm.prank(nonOwnerAddress);
        limitOrderRewardVault.setLimitOrderBook(address(0));
    }

    function testSetRewardAmount_able_to_set_reward_amount() public {
        uint256 newRewardAmount = 2e18;
        limitOrderRewardVault.setRewardAmount(newRewardAmount);
        assertEq(newRewardAmount, limitOrderRewardVault.rewardAmount());
    }

    function testSetRewardAmount_should_emit_event() public {
        uint256 newRewardAmount = 2e18;

        vm.expectEmit(false, false, false, true);
        emit RewardAmountChanged(newRewardAmount);
        limitOrderRewardVault.setRewardAmount(newRewardAmount);
    }

    function testSetRewardAmount_rewardAmount_must_be_greater_than_0() public {
        uint256 newRewardAmount = 0;
        vm.expectRevert(bytes("LOFV_RAMBGT0"));
        limitOrderRewardVault.setRewardAmount(newRewardAmount);
    }

    function testSetRewardAmount_only_able_to_set_by_owner() public {
        uint256 newRewardAmount = 2e18;
        vm.expectRevert(bytes("SO_CNO"));
        vm.prank(nonOwnerAddress);
        limitOrderRewardVault.setRewardAmount(newRewardAmount);
    }
}
