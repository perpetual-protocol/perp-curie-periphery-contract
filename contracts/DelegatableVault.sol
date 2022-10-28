// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SafeOwnable } from "@perp/curie-contract/contracts/base/SafeOwnable.sol";
import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";
import { IVault } from "@perp/curie-contract/contracts/interface/IVault.sol";
import { DelegatableVaultStorageV1 } from "./storage/DelegatableVaultStorage.sol";
import { LowLevelErrorMessage } from "./LowLevelErrorMessage.sol";
// solhint-disable-next-line max-line-length
import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

contract DelegatableVault is SafeOwnable, LowLevelErrorMessage, DelegatableVaultStorageV1 {
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;

    struct Call {
        bytes callData;
    }
    struct Result {
        bool success;
        bytes returnData;
    }

    //
    // MODIFIER
    //

    modifier onlyFundOwner() {
        // DV_OFO: only fund owner
        require(msg.sender == _fundOwner, "DV_OFO");
        _;
    }

    modifier onlyFundOwnerOrFundManager() {
        // DV_OFOFM: only fund owner or fund manager
        require(msg.sender == _fundOwner || msg.sender == _fundManager, "DV_OFOFM");
        _;
    }

    //
    // EXTERNAL NON-VIEW
    //

    function initialize(
        address clearingHouseArg,
        address fundOwnerArg,
        address fundManagerArg
    ) external initializer {
        // DV_CHNC: ClearingHouse address is not contract
        require(clearingHouseArg.isContract(), "DV_CHNC");

        __SafeOwnable_init();

        _clearingHouse = clearingHouseArg;

        _fundOwner = fundOwnerArg;
        _fundManager = fundManagerArg;

        // only enable addLiquidity, removeLiquidity, openPosition and closePosition when initialize for now.
        whiteFunctionMap[IClearingHouse.addLiquidity.selector] = true;
        whiteFunctionMap[IClearingHouse.removeLiquidity.selector] = true;
        whiteFunctionMap[IClearingHouse.openPosition.selector] = true;
        whiteFunctionMap[IClearingHouse.closePosition.selector] = true;
    }

    function setFundManager(address fundManagerArg) external onlyOwner {
        _fundManager = fundManagerArg;
    }

    function setWhiteFunction(bytes4 functionSelector, bool enable) external onlyOwner {
        whiteFunctionMap[functionSelector] = enable;
    }

    //
    // only fund owner
    //
    function deposit(address token, uint256 amountX10_D) external onlyFundOwner {
        IVault vault = IVault(IClearingHouse(_clearingHouse).getVault());
        SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(token), msg.sender, address(this), amountX10_D);
        SafeERC20Upgradeable.safeApprove(IERC20Upgradeable(token), address(vault), amountX10_D);
        vault.deposit(token, amountX10_D);
    }

    function withdraw(address token, uint256 amountX10_D) external onlyFundOwner {
        IVault vault = IVault(IClearingHouse(_clearingHouse).getVault());
        vault.withdraw(token, amountX10_D);
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), msg.sender, amountX10_D);
    }

    function withdrawToken(address token) external {
        uint256 amount = IERC20Upgradeable(token).balanceOf(address(this));
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), _fundOwner, amount);
    }

    //
    // only fund owner and fund manager
    //
    function addLiquidity(IClearingHouse.AddLiquidityParams calldata params)
        external
        onlyFundOwnerOrFundManager
        returns (IClearingHouse.AddLiquidityResponse memory)
    {
        return IClearingHouse(_clearingHouse).addLiquidity(params);
    }

    function removeLiquidity(IClearingHouse.RemoveLiquidityParams calldata params)
        external
        onlyFundOwnerOrFundManager
        returns (IClearingHouse.RemoveLiquidityResponse memory response)
    {
        return IClearingHouse(_clearingHouse).removeLiquidity(params);
    }

    function openPosition(IClearingHouse.OpenPositionParams memory params)
        external
        onlyFundOwnerOrFundManager
        returns (uint256 deltaBase, uint256 deltaQuote)
    {
        return IClearingHouse(_clearingHouse).openPosition(params);
    }

    function closePosition(IClearingHouse.ClosePositionParams calldata params)
        external
        onlyFundOwnerOrFundManager
        returns (uint256 deltaAvailableBase, uint256 deltaAvailableQuote)
    {
        return IClearingHouse(_clearingHouse).closePosition(params);
    }

    function aggregate(bytes[] calldata calls)
        external
        onlyFundOwnerOrFundManager
        returns (uint256 blockNumber, bytes[] memory returnData)
    {
        blockNumber = block.number;
        returnData = new bytes[](calls.length);
        for (uint256 i = 0; i < calls.length; i++) {
            // DV_FNIW: function not in white list
            require(whiteFunctionMap[_getSelector(calls[i])], "DV_FNIW");
            (bool success, bytes memory ret) = _clearingHouse.call(calls[i]);
            require(success, _getRevertMessage(ret));
            returnData[i] = ret;
        }
    }

    // 4pm
    function rollOver(uint256 newDeposit) external {
        // input param:
        // - uint256 newDeposit: new deposit amount
        // - uint256 notional: notional amount
        // - uint256 lmRewardAmount: LM reward amount
        // - uint24 withdrawRatio: withdraw ratio
        // alice: 8000
        // bob: 2000
        //
        // BinaryVault init
        // setBaseToken
        //
        // if it's epoch 0:
        // lmRewardAmount: 0
        // notional: 10000
        // newDeposit: 9800 (exclude fixedAmount: 200)
        // 1. deposit into vault with 9800 + 0 (newDeposit + lmRewardAmount)
        // 2. add liquidity with notional, useTakerBalance: false
        // base: 10 ETH
        // quote: 5000
        //
        // if it's epoch 1:
        // lmRewardAmount: 200
        // notional: 12000
        // newDeposit: 1800
        // 1. deposit into vault with 1800 + 200 (newDeposit + lmRewardAmount)
        // 2. removeLiquidity all
        // base 10 ETH
        // quote: 5000
        // closePosition: 0
        // 3. add liquidity with notional, useTakerBalance: true
        // base: 12 ETH
        // quote: 6000
        //
        // in sheet
        // alice withdraw: 10%
        // bob withdraw: 100%
        // totalWithdrawRatio: (8000 * 10% + 2000 * 100%) / 10000 = 0.28
        // if it's epoch 2:
        // lmRewardAmount: 300
        // notional: 9000
        // newDeposit: 0
        // 1. deposit into vault with 0 + 300 (newDeposit + lmRewardAmount)
        // 2. removeLiquidity all
        // base 12 ETH
        // quote: 6000
        // closePosition: 3 ETH (3 * 500 = 1500)
        // 3. add liquidity with notional, useTakerBalance: true
        // base: 9 ETH
        // quote: 4500
        // 4. withdraw 3000
    }

    function rollOver2(uint24 withdrawRatio) external {
        // if epoch 0:
        // withdrawRatio: 0%
        // old quote balance = vault.balanceOf(this)
        // new quote balance = old quote balance * (1 - withdrawRatio.div(2))
        // new base to add = new quote balance / 2 / market price
        // new quote to add = new quote balance / 2
        //
        // if epoch 1:
        // withdrawRatio: 0%
        // remove liquidity all
        // old quote balance = vault.balanceOf(this)
        // new quote balance = old quote balance * (1 - withdrawRatio.div(2))
        // new notional = new quote balance + removedBase * market price
        // add liquidity with new notional, useTakerBalance: true
        // new base to add = new notional / 2 / market price
        // new quote to add = new notional / 2
        //
        // if epoch 2:
        // withdrawRatio: 50%
        // remove liquidity all
        // close position
        // close position size = removedBase * withdrawRatio.div(2)
        // base balance = removedBase - close position size
        // old quote value = vault.balanceOf(this) - new deposit
        // old base value = base balance * market price
        // old notional = old quote value + old base value
        // new quote value = old quote value * (1 - withdrawRatio.div(2)) + new deposit
        // new base value = getTakerPositionSize() * market price
        // new notional = new quote value + new base value
        // add liquidity with new notional, useTakerBalance: true
        // new base to add = new notional / 2 / market price
        // new quote to add = new notional / 2
        // withdraw balance = old notional * withdrawRatio
    }

    function _getSelector(bytes memory data) private pure returns (bytes4) {
        return data[0] | (bytes4(data[1]) >> 8) | (bytes4(data[2]) >> 16) | (bytes4(data[3]) >> 24);
    }
}
