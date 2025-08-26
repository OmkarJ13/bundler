// This module is shared by both moduleB and moduleC
const sharedValue = 'shared-data';
const sharedFunction = input => `processed: ${input}`;

// Conflicting variable to test deconfliction
const data = 'shared-data-value';
// Counter to demonstrate shared state
let counter = 0;
function incrementCounter() {
  return ++counter;
}
function getCounter() {
  return counter;
}
// Conflicting variable name - same as in moduleC and shared
const data$1 = 'moduleB-specific-data';
const fromB = `B-${sharedValue}`;
const dataFromB = data$1;
const sharedDataFromB = data;
const processFromB = input => sharedFunction(`B: ${input}`);

// This should increment the shared counter
const countFromB = incrementCounter();
// Conflicting variable name - same as in moduleB and shared
const data$2 = 'moduleC-specific-data';
const fromC = `C-${sharedValue}`;
const dataFromC = data$2;
const sharedDataFromC = data;
const processFromC = input => sharedFunction(`C: ${input}`);

// This should increment the shared counter
const countFromC = incrementCounter();
// Another conflicting variable to test deconfliction
const data$3 = 'index-local-data';

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
console.log('local data:', data$3);
console.log('dataFromB:', dataFromB);
console.log('dataFromC:', dataFromC);
console.log('sharedDataFromB:', sharedDataFromB);
console.log('sharedDataFromC:', sharedDataFromC);