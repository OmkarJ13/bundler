// This module is shared by both moduleB and moduleC
export const sharedValue = 'shared-data';
export const sharedFunction = (input) => `processed: ${input}`;

// Conflicting variable to test deconfliction
const data = 'shared-data-value';
export { data as sharedData };

// Counter to demonstrate shared state
let counter = 0;
export function incrementCounter() {
  return ++counter;
}

export function getCounter() {
  return counter;
}
