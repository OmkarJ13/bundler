import { defineTest } from '../../utils/test';

export default defineTest(
  'should throw an error when circular dependencies are present',
  {
    throwsError:
      /Circular dependency detected: .*\/index.js -> .*\/foo.js -> .*\/bar.js -> .*\/index.js/,
  }
);
