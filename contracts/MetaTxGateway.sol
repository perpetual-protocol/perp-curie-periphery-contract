// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.6;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { LowLevelErrorMessage } from "./LowLevelErrorMessage.sol";
import { SafeOwnableNonUpgradable } from "./base/SafeOwnableNonUpgradable.sol";

// this is functionally identical to
// https://github.com/bcnmy/metatx-standard/blob/master/src/contracts/EIP712MetaTransaction.sol
contract MetaTxGateway is SafeOwnableNonUpgradable, LowLevelErrorMessage {
    using Address for address;
    using SafeMath for uint256;

    //
    // EVENTS
    //
    event MetaTransactionExecuted(address from, address to, address payable relayerAddress, bytes functionSignature);

    //
    // Struct and Enum
    //
    struct EIP712Domain {
        string name;
        string version;
        uint256 chainId;
        address verifyingContract;
    }

    /*
     * Meta transaction structure.
     * No point of including value field here as if user is doing value transfer then he has the funds to pay for gas
     * He should call the desired function directly in that case.
     */
    struct MetaTransaction {
        uint256 nonce;
        address from;
        address to;
        bytes functionSignature;
    }

    //
    // Constant
    //
    //
    bytes32 internal constant _EIP712_DOMAIN_TYPEHASH =
        keccak256(bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));

    // solhint-disable-next-line
    bytes32 private constant _META_TRANSACTION_TYPEHASH =
        keccak256(bytes("MetaTransaction(uint256 nonce,address from,address to,bytes functionSignature)"));

    //**********************************************************//
    //    Can not change the order of below state variables     //
    //**********************************************************//

    bytes32 internal _domainSeparatorL1;
    bytes32 internal _domainSeparatorL2;
    mapping(address => uint256) private _nonces;

    // whitelist of contracts this gateway can execute
    mapping(address => bool) private _whitelistMap;

    //
    // FUNCTIONS
    //

    constructor(
        string memory name,
        string memory version,
        uint256 chainIdL1
    ) {
        _domainSeparatorL1 = keccak256(
            abi.encode(
                _EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainIdL1,
                address(this)
            )
        );

        _domainSeparatorL2 = keccak256(
            abi.encode(
                _EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                _getChainID(),
                address(this)
            )
        );
    }

    /**
     * @notice add an address to the whitelist. Only contracts in the whitelist can be executed by this gateway.
     *         This prevents the gateway from being abused to execute arbitrary meta txs
     * @dev only owner can call
     * @param addr an address
     */
    function addToWhitelists(address addr) external onlyOwner {
        // MTG_ANC: address is not contract
        require(addr.isContract(), "MTG_ANC");
        _whitelistMap[addr] = true;
    }

    function removeFromWhitelists(address addr) external onlyOwner {
        delete _whitelistMap[addr];
    }

    function executeMetaTransaction(
        address from,
        address to,
        bytes calldata functionSignature,
        bytes32 sigR,
        bytes32 sigS,
        uint8 sigV
    ) external returns (bytes memory) {
        require(isInWhitelists(to), "!whitelisted");

        MetaTransaction memory metaTx =
            MetaTransaction({ nonce: _nonces[from], from: from, to: to, functionSignature: functionSignature });

        require(
            _verify(from, _domainSeparatorL1, metaTx, sigR, sigS, sigV) ||
                _verify(from, _domainSeparatorL2, metaTx, sigR, sigS, sigV),
            "Meta tx Signer and signature do not match"
        );

        _nonces[from] = _nonces[from].add(1);
        // Append userAddress at the end to extract it from calling context
        // solhint-disable avoid-low-level-calls
        (bool success, bytes memory returnData) = address(to).call(abi.encodePacked(functionSignature, from));
        require(success, _getRevertMessage(returnData));
        emit MetaTransactionExecuted(from, to, msg.sender, functionSignature);
        return returnData;
    }

    //
    // VIEW FUNCTIONS
    //

    function getNonce(address user) external view returns (uint256 nonce) {
        nonce = _nonces[user];
    }

    //
    // INTERNAL VIEW FUNCTIONS
    //

    function isInWhitelists(address addr) public view returns (bool) {
        return _whitelistMap[addr];
    }

    function _getChainID() internal pure returns (uint256 id) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            id := chainid()
        }
    }

    /**
     * Accept message hash and returns hash message in EIP712 compatible form
     * So that it can be used to recover signer from signature signed using EIP712 formatted data
     * https://eips.ethereum.org/EIPS/eip-712
     * "\\x19" makes the encoding deterministic
     * "\\x01" is the version byte to make it compatible to EIP-191
     */
    function _toTypedMessageHash(bytes32 domainSeparator, bytes32 messageHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, messageHash));
    }

    function _hashMetaTransaction(MetaTransaction memory metaTx) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    _META_TRANSACTION_TYPEHASH,
                    metaTx.nonce,
                    metaTx.from,
                    metaTx.to,
                    keccak256(metaTx.functionSignature)
                )
            );
    }

    function _verify(
        address user,
        bytes32 domainSeparator,
        MetaTransaction memory metaTx,
        bytes32 sigR,
        bytes32 sigS,
        uint8 sigV
    ) internal pure returns (bool) {
        address signer =
            ecrecover(_toTypedMessageHash(domainSeparator, _hashMetaTransaction(metaTx)), sigV, sigR, sigS);
        require(signer != address(0), "invalid signature");
        return signer == user;
    }
}
