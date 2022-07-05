import { TypedDataField } from "@ethersproject/abstract-signer/src.ts"
import { SignTypedDataVersion, TypedDataUtils, TypedMessage } from "@metamask/eth-sig-util"

export interface MessageTypes {
    EIP712Domain: TypedDataField[]
    [additionalProperties: string]: TypedDataField[]
}

export function generateTypedHash(typedData: TypedMessage<MessageTypes>) {
    return `0x${TypedDataUtils.eip712Hash(typedData, SignTypedDataVersion.V4).toString("hex")}`
}
