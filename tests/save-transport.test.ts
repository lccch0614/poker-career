import test from "node:test";
import assert from "node:assert/strict";
import { saveKeepalive } from "../app/save-transport";

test("normal saves never use keepalive, including small ones", () => {
  assert.equal(saveKeepalive("{}", false), false);
  assert.equal(saveKeepalive("x".repeat(80_000), false), false);
});

test("leaving page uses keepalive only below the browser body limit in bytes", () => {
  assert.equal(saveKeepalive("x".repeat(59_000), true), true);
  assert.equal(saveKeepalive("x".repeat(65_000), true), false);
  assert.equal(saveKeepalive("牌".repeat(21_000), true), false);
});
