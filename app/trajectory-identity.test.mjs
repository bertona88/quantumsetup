import assert from "node:assert/strict";
import test from "node:test";

import {
  TRAJECTORY_BITS,
  deriveInitialDirection,
  formatTrajectoryId,
  freshTrajectoryId,
  parseTrajectoryId,
  trajectoryIdForUrl,
} from "./trajectory-identity.js";

test("fresh trajectory identities contain 128 sampled bits", () => {
  const cryptoSource = {
    getRandomValues(words) {
      words.set([0x01234567, 0x89abcdef, 0xfedcba98, 0x76543210]);
      return words;
    },
  };
  const id = freshTrajectoryId(cryptoSource);
  assert.equal(TRAJECTORY_BITS, 128);
  assert.equal(id, "0123456789abcdeffedcba9876543210");
  assert.equal(trajectoryIdForUrl(id), id);
  assert.equal(formatTrajectoryId(id), "0123-4567…7654-3210");
});

test("trajectory parsing preserves 128-bit ids and legacy 32-bit replay links", () => {
  assert.equal(
    parseTrajectoryId("0123456789ABCDEFFEDCBA9876543210"),
    "0123456789abcdeffedcba9876543210",
  );
  assert.equal(parseTrajectoryId("51eed"), 0x51eed);
  assert.equal(parseTrajectoryId("not-a-seed"), undefined);
});

test("initial musical direction is deterministic and bounded by the trajectory", () => {
  const first = deriveInitialDirection("0123456789abcdeffedcba9876543210");
  const replay = deriveInitialDirection("0123456789abcdeffedcba9876543210");
  assert.deepEqual(first, replay);
  assert.ok(["hypnotic", "dub", "detroit", "acid", "peak"].includes(first.vibe));
  assert.ok(["minor", "neutral", "major"].includes(first.tonality));
});
