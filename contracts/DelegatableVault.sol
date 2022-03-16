// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SafeOwnable } from "@perp/curie-contract/contracts/base/SafeOwnable.sol";
import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";
import { IVault } from "@perp/curie-contract/contracts/interface/IVault.sol";
import { IMerkleRedeem } from "@perp/curie-liquidity-mining/contracts/interface/IMerkleRedeem.sol";
import { DelegatableVaultStorageV1 } from "./storage/DelegatableVaultStorage.sol";
import { LowLevelErrorMessage } from "./LowLevelErrorMessage.sol";

import {
    SafeERC20Upgradeable,
    IERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

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

    function _getSelector(bytes memory data) private pure returns (bytes4) {
        return data[0] | (bytes4(data[1]) >> 8) | (bytes4(data[2]) >> 16) | (bytes4(data[3]) >> 24);
    }
}
