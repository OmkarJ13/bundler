import {
  sharedValue,
  sharedFunction,
  incrementCounter,
  sharedData,
} from './shared.js';

// Conflicting variable name - same as in moduleB and shared
const data = 'moduleC-specific-data';

export const fromC = `C-${sharedValue}`;
export const dataFromC = data;
export const sharedDataFromC = sharedData;
export const processFromC = (input) => sharedFunction(`C: ${input}`);

// This should increment the shared counter
export const countFromC = incrementCounter();
