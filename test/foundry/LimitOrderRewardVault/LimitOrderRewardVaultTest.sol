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
    event Withdrawn(address to, address token, uint256 amount);
    event Disbursed(bytes32 orderHash, address keeper, address token, uint256 amount);

    TestERC20 rewardToken1;

    function setUp() public {
        rewardToken1 = new TestERC20();
        rewardToken1.__TestERC20_init("TestPERP-1", "PERP-1", 18);

        limitOrderRewardVault = new LimitOrderRewardVault();
        limitOrderRewardVault.initialize(address(rewardToken1), 10 ** 18);
    }

    function testSetRewardToken_should_set_reward_token() public {
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

    function testSetRewardToken_should_not_set_non_contract_address() public {
        vm.expectRevert(bytes("LOFV_RTINC"));
        limitOrderRewardVault.setRewardToken(address(0));
    }

    function testSetRewardToken_should_only_be_called_by_owner() public {
        vm.expectRevert(bytes("SO_CNO"));
        vm.prank(nonOwnerAddress);
        limitOrderRewardVault.setRewardToken(address(0));
    }

    function testSetLimitOrderBook_should_set_limitOrderBook() public {
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

    function testSetLimitOrderBook_should_not_set_non_contract_address() public {
        vm.expectRevert(bytes("LOFV_LOBINC"));
        limitOrderRewardVault.setLimitOrderBook(address(0));
    }

    function testSetLimitOrderBook_should_only_be_called_by_owner() public {
        vm.expectRevert(bytes("SO_CNO"));
        vm.prank(nonOwnerAddress);
        limitOrderRewardVault.setLimitOrderBook(address(0));
    }

    function testSetRewardAmount_should_set_reward_amount() public {
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

    function testSetRewardAmount_should_only_be_called_by_owner() public {
        uint256 newRewardAmount = 2e18;
        vm.expectRevert(bytes("SO_CNO"));
        vm.prank(nonOwnerAddress);
        limitOrderRewardVault.setRewardAmount(newRewardAmount);
    }

    function testDisburse_should_disburse_reward_to_keeper() public {
        (address limitOrderBookAddr,) = prepareForDisbursing();

        uint256 rewardAmount = 100 * 10 ** rewardToken1.decimals();
        limitOrderRewardVault.setRewardAmount(rewardAmount);

        address keeper = address(0x1111);
        bytes32 anyOrderHash = keccak256(abi.encodePacked("0"));

        vm.prank(limitOrderBookAddr);
        limitOrderRewardVault.disburse(keeper, anyOrderHash);
    }

    function testDisburse_should_emit_event() public {
        (address limitOrderBookAddr,) = prepareForDisbursing();

        uint256 rewardAmount = 100 * 10 ** rewardToken1.decimals();
        limitOrderRewardVault.setRewardAmount(rewardAmount);

        address keeper = address(0x1111);
        bytes32 orderHash = keccak256(abi.encodePacked("0"));

        vm.expectEmit(false, false, false, true);
        emit Disbursed(orderHash, keeper, address(rewardToken1), rewardAmount);
        vm.prank(limitOrderBookAddr);
        limitOrderRewardVault.disburse(keeper, orderHash);
    }

    function testDisburse_should_be_reverted_if_balance_is_not_enough() public {
        (address limitOrderBookAddr, uint256 vaultBalance) = prepareForDisbursing();

        uint256 rewardAmount = vaultBalance + 1;
        limitOrderRewardVault.setRewardAmount(rewardAmount);

        address anyKeeper = address(0x1111);
        bytes32 anyOrderHash = keccak256(abi.encodePacked("0"));

        vm.expectRevert(bytes("LOFV_NEBTD"));
        vm.prank(limitOrderBookAddr);
        limitOrderRewardVault.disburse(anyKeeper, anyOrderHash);
    }

    function testDisburse_should_only_be_called_by_limitOrderBook() public {
        address anyKeeper = address(0x1111);
        bytes32 anyOrderHash = keccak256(abi.encodePacked("0"));
        vm.expectRevert(bytes("LOFV_SMBLOB"));
        vm.prank(nonOwnerAddress);
        limitOrderRewardVault.disburse(anyKeeper, anyOrderHash);
    }

    function testWithdraw_should_transfer_amount_to_admin() public {
        address admin = address(this);
        address vault = address(limitOrderRewardVault);

        assertEq(0, rewardToken1.balanceOf(admin));

        uint256 vaultBalance = 1000 * 10 ** rewardToken1.decimals();

        rewardToken1.mint(vault, vaultBalance);
        limitOrderRewardVault.withdraw(vaultBalance);

        assertEq(vaultBalance, rewardToken1.balanceOf(admin));
        assertEq(0, rewardToken1.balanceOf(vault));
    }

    function testWithdraw_should_emit_event() public {
        address admin = address(this);
        address vault = address(limitOrderRewardVault);

        uint256 vaultBalance = 1000 * 10 ** rewardToken1.decimals();

        rewardToken1.mint(vault, vaultBalance);

        vm.expectEmit(false, false, false, true);
        emit Withdrawn(admin, address(rewardToken1), vaultBalance);
        limitOrderRewardVault.withdraw(vaultBalance);
    }

    function testWithdraw_should_revert_if_balance_not_enough() public {
        address admin = address(this);
        address vault = address(limitOrderRewardVault);

        uint256 vaultBalance = 1000 * 10 ** rewardToken1.decimals();

        rewardToken1.mint(vault, vaultBalance);

        vm.expectRevert(bytes("LOFV_NEBTW"));
        limitOrderRewardVault.withdraw(vaultBalance + 1);
    }

    function testWithdraw_should_only_be_called_by_owner() public {
        vm.expectRevert(bytes("SO_CNO"));
        vm.prank(nonOwnerAddress);
        limitOrderRewardVault.withdraw(1);
    }

    function prepareForDisbursing() private returns (address limitOrderBookAddr, uint256 vaultBalance){
        address vaultAddr = address(limitOrderRewardVault);
        address limitOrderBookAddr = address(new TestLimitOrderBook());
        limitOrderRewardVault.setLimitOrderBook(limitOrderBookAddr);

        uint256 vaultBalance = 1000 * 10 ** rewardToken1.decimals();
        rewardToken1.mint(vaultAddr, vaultBalance);

        return (limitOrderBookAddr, vaultBalance);
    }

}
