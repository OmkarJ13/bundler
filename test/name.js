/* eslint-disable @typescript-eslint/no-require-imports */
const { firstName } = require('./firstname.js');
const { lastName } = require('./lastname.js');

module.exports = {
  name: firstName + ' ' + lastName,
};
