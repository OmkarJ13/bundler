import {
  sharedValue,
  sharedFunction,
  incrementCounter,
  sharedData,
} from './shared.js';

// Conflicting variable name - same as in moduleC and shared
const data = 'moduleB-specific-data';

export const fromB = `B-${sharedValue}`;
export const dataFromB = data;
export const sharedDataFromB = sharedData;
export const processFromB = (input) => sharedFunction(`B: ${input}`);

// This should increment the shared counter
export const countFromB = incrementCounter();
