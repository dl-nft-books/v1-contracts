const { fromRpcSig } = require("ethereumjs-util");
const ethSigUtil = require("eth-sig-util");

const sign2612 = (domain, message, privateKey) => {
  const { name, version = "1", chainId = 1, verifyingContract } = domain;
  const { paymentTokenAddress, paymentTokenPrice, endTimestamp, tokenURI } = message;

  const EIP712Domain = [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ];

  const Mint = [
    { name: "paymentTokenAddress", type: "address" },
    { name: "paymentTokenPrice", type: "uint256" },
    { name: "endTimestamp", type: "uint256" },
    { name: "tokenURI", type: "bytes32" },
  ];

  const data = {
    primaryType: "Mint",
    types: { EIP712Domain, Mint },
    domain: { name, version, chainId, verifyingContract },
    message: { paymentTokenAddress, paymentTokenPrice, endTimestamp, tokenURI },
  };

  const signature = ethSigUtil.signTypedMessage(privateKey, { data });
  return fromRpcSig(signature);
};

module.exports = {
  sign2612,
};
