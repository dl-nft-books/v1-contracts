const { fromRpcSig } = require("ethereumjs-util");
const { signTypedData } = require("@metamask/eth-sig-util");

const signMint = (domain, message, privateKey) => {
  const { name, version = "1", chainId = 1, verifyingContract } = domain;

  const EIP712Domain = [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ];

  const Mint = [
    { name: "paymentTokenAddress", type: "address" },
    { name: "paymentTokenPrice", type: "uint256" },
    { name: "discount", type: "uint256" },
    { name: "endTimestamp", type: "uint256" },
    { name: "tokenURI", type: "bytes32" },
  ];

  const data = {
    primaryType: "Mint",
    types: { EIP712Domain, Mint },
    domain: { name, version, chainId, verifyingContract },
    message,
  };

  return fromRpcSig(signTypedData({ privateKey, data, version: "V4" }));
};

const signCreate = (domain, message, privateKey) => {
  const { name, version = "1", chainId = 1, verifyingContract } = domain;

  const EIP712Domain = [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ];

  const Create = [
    { name: "tokenContractId", type: "uint256" },
    { name: "tokenName", type: "bytes32" },
    { name: "tokenSymbol", type: "bytes32" },
    { name: "pricePerOneToken", type: "uint256" },
    { name: "voucherTokenContract", type: "address" },
    { name: "voucherTokensAmount", type: "uint256" },
    { name: "minNFTFloorPrice", type: "uint256" },
  ];

  const data = {
    primaryType: "Create",
    types: { EIP712Domain, Create },
    domain: { name, version, chainId, verifyingContract },
    message,
  };

  return fromRpcSig(signTypedData({ privateKey, data, version: "V4" }));
};

module.exports = {
  signMint,
  signCreate,
};
