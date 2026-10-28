import assert from "node:assert/strict";
import test from "node:test";
import { parsePlayerProfile, registrationIdentity } from "../lib/player-profile.ts";

test("invalid browser storage cannot break the player profile", () => {
  for (const value of [null, "", "{", "null", "[]", '"text"', "x".repeat(800_001)]) {
    assert.equal(parsePlayerProfile(value), null);
  }
});

test("stored avatars only accept bounded raster data URLs", () => {
  for (const photo of ["javascript:alert(1)", "https://example.com/photo.jpg", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/jpeg;base64," + "A".repeat(700_000)]) {
    assert.equal(parsePlayerProfile(JSON.stringify({ name: " Player ", email: " player@example.com ", photo })).photo, "");
  }
  assert.deepEqual(parsePlayerProfile('{"name":" Player ","email":" player@example.com ","photo":"data:image/png;base64,AAAA"}'), { name: "Player", email: "player@example.com", photo: "data:image/png;base64,AAAA" });
});

test("a saved profile prefills the existing registration identity without inventing a surname", () => {
  assert.deepEqual(registrationIdentity({ name: "  Anna   van der Meer ", email: "anna@example.com", photo: "" }), { firstName: "Anna", lastName: "van der Meer", email: "anna@example.com" });
  assert.deepEqual(registrationIdentity({ name: "Anna", email: "anna@example.com", photo: "" }), { firstName: "Anna", lastName: "", email: "anna@example.com" });
});
