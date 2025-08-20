import { foo } from 'foo';
import { bar } from './named';
import {
  bar as barFromNamespace,
  stuff as stuffFromNamespace,
} from './namespace';
import { bar as barFromDefault } from './default';
import { stuff } from './all';
import * as all from './all';

console.log(
  foo,
  bar,
  barFromNamespace,
  barFromDefault,
  stuff,
  all,
  stuffFromNamespace
);
