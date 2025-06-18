import './side-effect.js';

export const foo = 'foo in foo.js';

export function hello() {
  const foo = 'foo';
  console.log('hello', foo);
}
