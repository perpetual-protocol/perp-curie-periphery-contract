pragma solidity 0.7.6;

import "../../contracts/test/TestERC20.sol";
import "../../contracts/limitOrder/LimitOrderRewardVault.sol";
import "forge-std/Test.sol";

contract LimitOrderRewardVaultTest is Test {
    LimitOrderRewardVault limitOrderRewardVault;
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
        // WIP
        //        TestERC20 rewardToken2 = new TestERC20();
        //        rewardToken2.__TestERC20_init("TestPERP-2", "PERP-2", 18);
        //
        //        vm.expectEmit(false, false, false, true);
        //        emit RewardTokenChanged(address(rewardToken2));
        //        limitOrderRewardVault.setRewardToken(address(rewardToken2));
    }

    function testSetRewardToken_unable_to_set_non_contract_address() public {
        vm.expectRevert(bytes("LOFV_RTINC"));
        limitOrderRewardVault.setRewardToken(address(0));
    }

    function testSetRewardToken_only_able_to_set_by_owner() public {
        address nonOwner = address(0x1234);
        vm.expectRevert(bytes("SO_CNO"));
        vm.prank(nonOwner);
        limitOrderRewardVault.setRewardToken(address(0));
    }
}
