import assert from "node:assert/strict";
import test from "node:test";
import { developmentRendererUrl } from "./renderer-origin-policy";

test("packaged builds ignore a development renderer override", () => {
  assert.equal(developmentRendererUrl("https://remote.example.test", true), undefined);
});

test("development accepts only canonical loopback renderer origins", () => {
  assert.equal(developmentRendererUrl("http://localhost:5173", false), "http://localhost:5173/");
  assert.equal(developmentRendererUrl("https://127.0.0.1:5173", false), "https://127.0.0.1:5173/");
  assert.equal(developmentRendererUrl("http://[::1]:5173", false), "http://[::1]:5173/");
});

test("development rejects malformed and remote renderer overrides", () => {
  assert.throws(() => developmentRendererUrl("not a url", false));
  assert.throws(() => developmentRendererUrl("https://remote.example.test", false));
  assert.throws(() => developmentRendererUrl("file:///tmp/index.html", false));
});
