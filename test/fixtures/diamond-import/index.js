import {
  fromB,
  processFromB,
  countFromB,
  dataFromB,
  sharedDataFromB,
} from './moduleB.js';
import {
  fromC,
  processFromC,
  countFromC,
  dataFromC,
  sharedDataFromC,
} from './moduleC.js';
import { getCounter } from './shared.js';

// Another conflicting variable to test deconfliction
const data = 'index-local-data';

// Test that shared module is not duplicated
console.log('fromB:', fromB);
console.log('fromC:', fromC);
console.log('processFromB result:', processFromB('test'));
console.log('processFromC result:', processFromC('test'));

// Test that shared state is maintained (counter should be 2)
console.log('countFromB:', countFromB);
console.log('countFromC:', countFromC);
console.log('final counter:', getCounter());

// Test conflicting variable deconfliction
console.log('local data:', data);
console.log('dataFromB:', dataFromB);
console.log('dataFromC:', dataFromC);
console.log('sharedDataFromB:', sharedDataFromB);
console.log('sharedDataFromC:', sharedDataFromC);
