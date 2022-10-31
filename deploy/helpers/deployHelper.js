const fs = require("fs");

const { ZERO_ADDR } = require("../../scripts/utils/constants");

function nonEmptyField(field, fieldName, onlyUndefined = false) {
  if (field != undefined && (onlyUndefined || (field !== "" && field.length !== 0))) {
    return field;
  }

  throw new Error(`Empty ${fieldName} field.`);
}

function nonEmptyAddress(addr, arrName, onlyUndefined = false) {
  nonEmptyField(addr, arrName, onlyUndefined);

  if (addr !== ZERO_ADDR) {
    return addr;
  }

  throw new Error(`Zero address in ${arrName} array.`);
}

function validAddressesArr(arr, arrName, onlyUndefined = false) {
  nonEmptyField(arr, arrName, onlyUndefined);

  for (let i = 0; i < arr.length; i++) {
    nonEmptyAddress(arr[i], arrName, onlyUndefined);
  }

  return arr;
}

function parseTokenFactoryParams(path) {
  const tokenFactoryParams = JSON.parse(fs.readFileSync(path, "utf8"));

  validAddressesArr(tokenFactoryParams.admins, "admins");
  nonEmptyField(tokenFactoryParams.baseTokenContractsURI, "baseTokenContractsURI", true);
  nonEmptyField(tokenFactoryParams.priceDecimals, "priceDecimals");

  return {
    admins: tokenFactoryParams.admins,
    baseTokenContractsURI: tokenFactoryParams.baseTokenContractsURI,
    priceDecimals: tokenFactoryParams.priceDecimals,
  };
}

module.exports = {
  nonEmptyField,
  validAddressesArr,
  parseTokenFactoryParams,
};
