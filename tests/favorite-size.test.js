import test from 'node:test';
import assert from 'node:assert/strict';
import { favoriteSize, isFavoriteSize } from '../src/shared/favorite-size.js';

test('Favorite size accepts the complete slider range and defaults invalid settings', () => {
  for (let size = 50; size <= 150; size += 10) {
    assert.equal(isFavoriteSize(size), true);
    assert.equal(favoriteSize(size), size);
    assert.equal(favoriteSize(String(size)), size);
  }
  for (const value of [undefined, null, 0, 40, 55, 160, NaN, Infinity, 'bad']) {
    assert.equal(isFavoriteSize(value), false);
    assert.equal(favoriteSize(value), 100);
  }
});
