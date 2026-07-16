import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';

// 이 jsdom 환경에는 localStorage가 없어(Node 실험 기능 미설정) 영속화 테스트가
// 실제 저장소를 필요로 한다. 인메모리 목을 전역에 설치한다.
if (typeof globalThis.localStorage === 'undefined') {
  class MemoryStorage {
    #map = new Map();

    get length() {
      return this.#map.size;
    }

    getItem(key) {
      const k = String(key);
      return this.#map.has(k) ? this.#map.get(k) : null;
    }

    setItem(key, value) {
      this.#map.set(String(key), String(value));
    }

    removeItem(key) {
      this.#map.delete(String(key));
    }

    clear() {
      this.#map.clear();
    }

    key(index) {
      return Array.from(this.#map.keys())[index] ?? null;
    }
  }
  globalThis.localStorage = new MemoryStorage();
}

afterEach(() => {
  cleanup();
});
